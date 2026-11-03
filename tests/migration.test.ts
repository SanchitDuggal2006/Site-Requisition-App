import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile } from "node:fs/promises";
it("upgrades existing orders without changing identities, totals or purchaser attribution", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    const run = async (name: string) =>
      db.exec(
        (
          await readFile(new URL("../db/" + name, import.meta.url), "utf8")
        ).replaceAll("PERFORM pg_advisory_xact_lock(774201);", ""),
      );
    await run("001_initial.sql");
    await run("002_director_lock.sql");
    const uid = crypto.randomUUID(),
      buyer = crypto.randomUUID(),
      site = crypto.randomUUID(),
      rid = crypto.randomUUID(),
      iid = crypto.randomUUID();
    await db.query(
      "INSERT INTO users(id,name,phone,pin_hash,role) VALUES($1,'Legacy owner','+919000009991','unused','DIRECTOR'),($2,'Legacy buyer','+919000009992','unused','PURCHASE')",
      [uid, buyer],
    );
    await db.query("INSERT INTO sites(id,name) VALUES($1,'Existing site')", [
      site,
    ]);
    await db.query(
      "INSERT INTO requisitions(id,site_id,requested_by,request_date,submission_key,status) VALUES($1,$2,$3,'2026-01-01',$4,'APPROVED')",
      [rid, site, uid, crypto.randomUUID()],
    );
    await db.query(
      "INSERT INTO items(id,requisition_id,description,quantity,unit,required_by,ordered,supplier,dispatched,received,cancelled,version) VALUES($1,$2,'Existing material',20,'bag','2026-01-02',true,'Existing supplier',8,5,2,4)",
      [iid, rid],
    );
    await db.query(
      "INSERT INTO events(requisition_id,item_id,actor_id,action) VALUES($1,$2,$3,'ORDERED')",
      [rid, iid, buyer],
    );
    await run("003_siteops.sql");
    const item = (await db.query<any>("SELECT * FROM items WHERE id=$1", [iid]))
      .rows[0];
    expect(Number(item.ordered_quantity)).toBe(18);
    expect(Number(item.received)).toBe(5);
    expect(item.version).toBe(4);
    const batch = (
      await db.query<any>("SELECT * FROM order_batches WHERE item_id=$1", [iid])
    ).rows[0];
    expect(batch.created_by).toBe(buyer);
    expect(Number(batch.quantity)).toBe(18);
    expect(Number(batch.dispatched)).toBe(8);
    expect(batch.expected_by).toBeNull();
  } finally {
    await db.close();
  }
}, 30000);
