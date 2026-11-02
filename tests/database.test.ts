import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../server/index";
import { digest } from "../server/crypto";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
let embedded: PGlite | undefined, pool: pg.Pool | undefined;
let query: (q: string, p?: any[]) => Promise<any[]>;
const ids = Object.fromEntries(
  [
    "director",
    "manager",
    "supervisor",
    "purchase",
    "outsider",
    "site",
    "otherSite",
  ].map((k) => [k, crypto.randomUUID()]),
);
let req: string, item: string;
let pinHash: string;
beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) {
    if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test"))
      throw new Error("Test database name must end in _test");
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    query = async (q, p) => (await pool!.query(q, p)).rows;
  } else {
    embedded = new PGlite({ extensions: { pgcrypto } });
    query = async (q, p) => (await embedded!.query(q, p)).rows;
  }
  let migration = await readFile(
    new URL("../db/001_initial.sql", import.meta.url),
    "utf8",
  );
  if (embedded) {
    migration = migration.replaceAll(
      "PERFORM pg_advisory_xact_lock(774201);",
      "",
    );
    await embedded.exec(migration);
  } else {
    await pool!.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool!.query(migration);
  }
  pinHash = (await query("SELECT crypt('681429',gen_salt('bf',4)) AS hash"))[0]
    .hash;
  for (const [index, role] of [
    "director",
    "manager",
    "supervisor",
    "purchase",
    "outsider",
  ].entries())
    await query(
      "INSERT INTO users(id,name,phone,pin_hash,role,must_change_pin) VALUES($1,$2,$3,$4,$5,false)",
      [
        ids[role],
        role,
        "+91900000000" + index,
        pinHash,
        role === "outsider" ? "SUPERVISOR" : role.toUpperCase(),
      ],
    );
  await query(
    "INSERT INTO sites(id,name) VALUES($1,'Test Site'),($2,'Other Site')",
    [ids.site, ids.otherSite],
  );
  for (const role of ["manager", "supervisor"])
    await query("INSERT INTO assignments VALUES($1,$2)", [ids[role], ids.site]);
  await query("INSERT INTO assignments VALUES($1,$2)", [
    ids.outsider,
    ids.otherSite,
  ]);
}, 30000);
afterAll(async () => {
  await embedded?.close();
  await pool?.end();
});
async function create() {
  const [r] = await query("SELECT create_requisition($1,$2::jsonb,$3) AS id", [
    ids.supervisor,
    JSON.stringify({
      key: crypto.randomUUID(),
      siteId: ids.site,
      note: "",
      items: [
        {
          description: "Plywood",
          quantity: 20,
          unit: "sheet",
          requiredBy: "2099-01-01",
        },
      ],
    }),
    "Asia/Kolkata",
  ]);
  return r.id;
}
describe("database invariants and API", () => {
  it("creates once and audits the original submission", async () => {
    const p = {
      key: crypto.randomUUID(),
      siteId: ids.site,
      note: "",
      items: [
        {
          description: "Plywood",
          quantity: 20,
          unit: "sheet",
          requiredBy: "2099-01-01",
        },
      ],
    };
    const run = () =>
      query("SELECT create_requisition($1,$2::jsonb,$3) AS id", [
        ids.supervisor,
        JSON.stringify(p),
        "Asia/Kolkata",
      ]);
    const a = await run(),
      b = await run();
    expect(a[0].id).toBe(b[0].id);
    req = a[0].id;
    item = (
      await query("SELECT id FROM items WHERE requisition_id=$1", [req])
    )[0].id;
    expect(
      (await query("SELECT * FROM events WHERE requisition_id=$1", [req]))
        .length,
    ).toBe(1);
  });
  it("rejects unassigned users and inappropriate roles", async () => {
    for (const role of ["outsider", "supervisor", "purchase"])
      await expect(
        query("SELECT transition_requisition($1,$2,'APPROVED','')", [
          ids[role],
          req,
        ]),
      ).rejects.toThrow("FORBIDDEN");
  });
  it("approves once with an atomic audit record", async () => {
    await query("SELECT transition_requisition($1,$2,'APPROVED','')", [
      ids.manager,
      req,
    ]);
    await expect(
      query("SELECT transition_requisition($1,$2,'APPROVED','')", [
        ids.director,
        req,
      ]),
    ).rejects.toThrow("CONFLICT");
    expect(
      (
        await query(
          "SELECT * FROM events WHERE requisition_id=$1 AND action='APPROVED'",
          [req],
        )
      ).length,
    ).toBe(1);
  });
  it("requires ordering, validates dispatch balances and rejects stale versions", async () => {
    await expect(
      query("SELECT transition_item($1,$2,0,'DISPATCHED',12,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("INVALID_QUANTITY");
    await query(
      "SELECT transition_item($1,$2,0,'ORDERED',NULL,'','Supplier')",
      [ids.purchase, item],
    );
    await expect(
      query("SELECT transition_item($1,$2,0,'DISPATCHED',12,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("CONFLICT");
    await query("SELECT transition_item($1,$2,1,'DISPATCHED',12,'','')", [
      ids.purchase,
      item,
    ]);
    await expect(
      query("SELECT transition_item($1,$2,2,'DISPATCHED',9,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("INVALID_QUANTITY");
  });
  it("separates purchasing from site receipt and preserves partial quantities", async () => {
    await expect(
      query("SELECT transition_item($1,$2,2,'RECEIVED',12,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      query("SELECT transition_item($1,$2,2,'RECEIVED',13,'','')", [
        ids.supervisor,
        item,
      ]),
    ).rejects.toThrow("INVALID_QUANTITY");
    await query(
      "SELECT transition_item($1,$2,2,'RECEIVED',10,'Two pending','')",
      [ids.supervisor, item],
    );
    expect(
      (
        await query("SELECT item_status FROM item_details WHERE id=$1", [item])
      )[0].item_status,
    ).toBe("PART_RECEIVED");
  });
  it("cancels only quantities not dispatched and requires a reason", async () => {
    await expect(
      query("SELECT transition_item($1,$2,3,'CANCELLED',8,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("REASON_REQUIRED");
    await expect(
      query("SELECT transition_item($1,$2,3,'CANCELLED',9,'Not needed','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("INVALID_QUANTITY");
    await query(
      "SELECT transition_item($1,$2,3,'CANCELLED',8,'Not needed','')",
      [ids.purchase, item],
    );
    await query("SELECT transition_item($1,$2,4,'RECEIVED',2,'','')", [
      ids.supervisor,
      item,
    ]);
    expect(
      (
        await query("SELECT item_status FROM item_details WHERE id=$1", [item])
      )[0].item_status,
    ).toBe("DELIVERED");
    await expect(
      query("SELECT transition_item($1,$2,5,'DISPATCHED',1,'','')", [
        ids.purchase,
        item,
      ]),
    ).rejects.toThrow("CONFLICT");
  });
  it("prevents removal of the final director", async () => {
    await expect(
      query("UPDATE users SET active=false WHERE id=$1", [ids.director]),
    ).rejects.toThrow("LAST_DIRECTOR");
  });
  it("supports rejection and forbids resubmission", async () => {
    const id = await create();
    await expect(
      query("SELECT transition_requisition($1,$2,'REJECTED','')", [
        ids.manager,
        id,
      ]),
    ).rejects.toThrow("REASON_REQUIRED");
    await query(
      "SELECT transition_requisition($1,$2,'REJECTED','Wrong specification')",
      [ids.manager, id],
    );
    await expect(
      query("SELECT transition_requisition($1,$2,'APPROVED','')", [
        ids.manager,
        id,
      ]),
    ).rejects.toThrow("CONFLICT");
  });
  it("locks after five failures and never creates a session for a locked user", async () => {
    for (let n = 0; n < 5; n++)
      await query("SELECT finish_login($1,$2,false,$3,'csrf')", [
        ids.outsider,
        pinHash,
        "bad" + n,
      ]);
    expect(
      (
        await query(
          "SELECT locked_until>now() AS locked FROM users WHERE id=$1",
          [ids.outsider],
        )
      )[0].locked,
    ).toBe(true);
    expect(
      (
        await query(
          "SELECT finish_login($1,$2,true,'bad-session','csrf') AS ok",
          [ids.outsider, pinHash],
        )
      )[0].ok,
    ).toBe(false);
  });
  it("enforces session, CSRF, site scope and report counts through HTTP", async () => {
    const app = createApp(query),
      token = "test-token",
      csrf = "test-csrf";
    await query(
      "INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 day')",
      [await digest(token), ids.supervisor, csrf],
    );
    const request = (path: string, options: RequestInit = {}) =>
      app.request(
        "https://app.test/api" + path,
        {
          ...options,
          headers: { Cookie: "sr_session=" + token, ...options.headers },
        },
        { DATABASE_URL: "", BUSINESS_TZ: "Asia/Kolkata" },
      );
    expect(
      (
        await app.request(
          "https://app.test/api/sites",
          {},
          { DATABASE_URL: "", BUSINESS_TZ: "Asia/Kolkata" },
        )
      ).status,
    ).toBe(401);
    const sites = await (await request("/sites")).json();
    expect(sites.map((s: any) => s.id)).toEqual([ids.site]);
    expect((await request("/users")).status).toBe(403);
    expect(
      (
        await request("/requisitions/" + req + "/status", {
          method: "POST",
          headers: {
            Origin: "https://evil.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    const report = await (await request("/report?date=2099-01-01")).json();
    expect(report.open.some((r: any) => r.id === item)).toBe(false);
    await query("UPDATE users SET active=false WHERE id=$1", [ids.supervisor]);
    expect((await request("/me")).status).toBe(401);
    await query("UPDATE users SET active=true WHERE id=$1", [ids.supervisor]);
  });
  it.skipIf(!process.env.TEST_DATABASE_URL)(
    "allows exactly one concurrent approval on real PostgreSQL",
    async () => {
      const id = await create();
      const results = await Promise.allSettled(
        [ids.director, ids.manager].map((actor) =>
          query("SELECT transition_requisition($1,$2,'APPROVED','')", [
            actor,
            id,
          ]),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await query(
          "SELECT * FROM events WHERE requisition_id=$1 AND action='APPROVED'",
          [id],
        ),
      ).toHaveLength(1);
    },
  );
  it("checks read permissions for every role and site assignment", async () => {
    const app = createApp(query);
    for (const role of [
      "director",
      "manager",
      "supervisor",
      "purchase",
      "outsider",
    ]) {
      const token = "matrix-" + role;
      await query(
        "INSERT INTO sessions VALUES($1,$2,'matrix-csrf',now()+interval '1 day')",
        [await digest(token), ids[role]],
      );
      const get = (path: string) =>
        app.request(
          "https://app.test/api" + path,
          { headers: { Cookie: "sr_session=" + token } },
          { DATABASE_URL: "", BUSINESS_TZ: "Asia/Kolkata" },
        );
      expect((await get("/users")).status).toBe(
        role === "director" ? 200 : 403,
      );
      expect((await get("/requisitions/" + req)).status).toBe(
        role === "outsider" ? 404 : 200,
      );
      const sites = await (await get("/sites")).json();
      expect(sites.length).toBe(
        ["director", "purchase"].includes(role) ? 2 : 1,
      );
      const report = await (await get("/report?site=" + ids.site)).json();
      if (role === "outsider") {
        expect(report.raised).toHaveLength(0);
        expect(report.activity).toHaveLength(0);
        expect(report.open).toHaveLength(0);
      }
      for (const path of ["/sites", "/users"]) {
        if (role === "director") continue;
        const response = await app.request(
          "https://app.test/api" + path,
          {
            method: "POST",
            headers: {
              Cookie: "sr_session=" + token,
              Origin: "https://app.test",
              "Content-Type": "application/json",
              "X-CSRF-Token": "matrix-csrf",
            },
            body: "{}",
          },
          { DATABASE_URL: "", BUSINESS_TZ: "Asia/Kolkata" },
        );
        expect(response.status).toBe(403);
      }
    }
  });
  it("checks every workflow action across roles, with unassigned-site denial", async () => {
    for (const role of [
      "director",
      "manager",
      "supervisor",
      "purchase",
      "outsider",
    ]) {
      const pending = await create();
      const approval = query(
        "SELECT transition_requisition($1,$2,'APPROVED','')",
        [ids[role], pending],
      );
      if (["director", "manager"].includes(role)) await approval;
      else {
        await expect(approval).rejects.toThrow("FORBIDDEN");
        await query("SELECT transition_requisition($1,$2,'APPROVED','')", [
          ids.director,
          pending,
        ]);
      }
      const iid = (
        await query("SELECT id FROM items WHERE requisition_id=$1", [pending])
      )[0].id;
      const order = query(
        "SELECT transition_item($1,$2,0,'ORDERED',NULL,'','')",
        [ids[role], iid],
      );
      if (["director", "purchase"].includes(role)) await order;
      else {
        await expect(order).rejects.toThrow("FORBIDDEN");
        await query("SELECT transition_item($1,$2,0,'ORDERED',NULL,'','')", [
          ids.purchase,
          iid,
        ]);
      }
      const dispatch = query(
        "SELECT transition_item($1,$2,1,'DISPATCHED',5,'','')",
        [ids[role], iid],
      );
      if (["director", "purchase"].includes(role)) await dispatch;
      else {
        await expect(dispatch).rejects.toThrow("FORBIDDEN");
        await query("SELECT transition_item($1,$2,1,'DISPATCHED',5,'','')", [
          ids.purchase,
          iid,
        ]);
      }
      const receipt = query(
        "SELECT transition_item($1,$2,2,'RECEIVED',5,'','')",
        [ids[role], iid],
      );
      if (["director", "supervisor"].includes(role)) await receipt;
      else await expect(receipt).rejects.toThrow("FORBIDDEN");
    }
  }, 30000);
  it("supports director handover and invalidates reset-PIN sessions", async () => {
    const second = crypto.randomUUID();
    await query(
      "INSERT INTO users(id,name,phone,role,pin_hash) VALUES($1,'Second director','+919000000099','DIRECTOR',$2)",
      [second, pinHash],
    );
    await query("UPDATE users SET active=false WHERE id=$1", [ids.director]);
    await expect(
      query("UPDATE users SET active=false WHERE id=$1", [second]),
    ).rejects.toThrow("LAST_DIRECTOR");
    await query("UPDATE users SET active=true WHERE id=$1", [ids.director]);
    await query(
      "INSERT INTO sessions VALUES('reset-test',$1,'csrf',now()+interval '1 day')",
      [second],
    );
    await query(
      "UPDATE users SET pin_hash=crypt('749182',gen_salt('bf',4)) WHERE id=$1",
      [second],
    );
    expect(
      await query("SELECT * FROM sessions WHERE token_hash='reset-test'"),
    ).toHaveLength(0);
  });
});
