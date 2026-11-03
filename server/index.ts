import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { digest } from "./crypto";
import {
  phoneSchema,
  pinSchema,
  requisitionSchema,
  userSchema,
  qty,
  dateSchema,
  today,
} from "./domain";
type User = {
  id: string;
  name: string;
  phone: string;
  role: string;
  must_change_pin: boolean;
};
type Env = { DATABASE_URL: string; BUSINESS_TZ: string; APP_URL?: string };
type Query = (text: string, params?: unknown[]) => Promise<any[]>;
export function createApp(override?: Query) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { user: User; csrf: string; tokenHash: string; db: Query };
  }>();
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 250000,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    const sql =
      override ??
      ((q: string, p: unknown[] = []) => neon(c.env.DATABASE_URL).query(q, p));
    c.set("db", sql);
    if (!["GET", "HEAD"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      const expected = new URL(c.req.url).origin;
      if (origin !== expected)
        return c.json({ error: "Request origin is not allowed" }, 403);
      if (!c.req.header("Content-Type")?.startsWith("application/json"))
        return c.json({ error: "JSON required" }, 415);
      const size = Number(c.req.header("Content-Length") || 0);
      if (size > 250000) return c.json({ error: "Request too large" }, 413);
    }
    if (c.req.path === "/api/login" || c.req.path === "/api/health") {
      await next();
      return;
    }
    const token = getCookie(c, "sr_session");
    if (!token) return c.json({ error: "Please sign in" }, 401);
    const tokenHash = await digest(token);
    const [session] = await sql(
      `SELECT u.id,u.name,u.phone,u.role,u.must_change_pin,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
      [tokenHash],
    );
    if (!session) return c.json({ error: "Please sign in" }, 401);
    c.set("user", session);
    c.set("csrf", session.csrf);
    c.set("tokenHash", tokenHash);
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("X-CSRF-Token") !== session.csrf
    )
      return c.json({ error: "Refresh the app and try again" }, 403);
    if (
      session.must_change_pin &&
      !["/api/me", "/api/pin", "/api/logout"].includes(c.req.path)
    )
      return c.json(
        { error: "Change your temporary PIN first", code: "CHANGE_PIN" },
        403,
      );
    await sql(
      "UPDATE sessions SET expires_at=now()+interval '30 days' WHERE token_hash=$1",
      [tokenHash],
    );
    setCookie(c, "sr_session", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
      path: "/",
      maxAge: 2592000,
    });
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof z.ZodError)
      return c.json(
        {
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    const message = err.message;
    const errors: Record<string, [string, number]> = {
      INVALID_SHIPPING_STATUS: [
        "Record dispatch before choosing In transit. Dispatched batches cannot be marked Not shipped.",
        400,
      ],
      FORBIDDEN: ["You do not have permission for this action", 403],
      CONFLICT: [
        "This was just updated by someone else. Refresh and try again.",
        409,
      ],
      LAST_DIRECTOR: [
        "Add another active director before removing this director.",
        409,
      ],
      INVALID_QUANTITY: [
        "Quantity exceeds the available balance or is invalid.",
        400,
      ],
      REASON_REQUIRED: ["A reason is required.", 400],
      DATE_IN_PAST: ["Required-by date cannot be before today.", 400],
      PIN_REQUIRED: ["A temporary PIN is required.", 400],
      NOT_FOUND: ["Record not found.", 404],
    };
    for (const [key, [text, status]] of Object.entries(errors))
      if (message.includes(key)) return c.json({ error: text }, status as 400);
    if ((err as any).code === "23505")
      return c.json(
        { error: "This mobile number or site name already exists." },
        409,
      );
    return c.json(
      { error: "Unable to complete this action. Please try again." },
      500,
    );
  });
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.post("/api/login", async (c) => {
    const body = z
      .object({ phone: phoneSchema, pin: z.string().regex(/^\d{6}$/) })
      .parse(await c.req.json());
    const sql = c.get("db");
    const ip = c.req.header("CF-Connecting-IP") || "local";
    for (const [kind, value, max] of [
      ["ip", ip, 30],
      ["phone", body.phone, 10],
    ] as const) {
      const key = kind + ":" + (await digest(value));
      const [limit] = await sql(
        `INSERT INTO login_limits(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.expires_at<now() THEN 1 ELSE login_limits.count+1 END,expires_at=CASE WHEN login_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE login_limits.expires_at END RETURNING count`,
        [key],
      );
      if (limit.count > max)
        return c.json(
          { error: "Too many attempts. Try again in 15 minutes." },
          429,
        );
    }
    const token = crypto.randomUUID() + crypto.randomUUID(),
      csrf = crypto.randomUUID();
    const result = await sql("SELECT sign_in($1,$2,$3,$4) AS ok", [
      body.phone,
      body.pin,
      await digest(token),
      csrf,
    ]);
    if (!result[0]?.ok)
      return c.json(
        {
          error:
            "Unable to sign in. Check your number and PIN, or try again after 15 minutes.",
        },
        401,
      );
    setCookie(c, "sr_session", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
      path: "/",
      maxAge: 2592000,
    });
    return c.json({ ok: true });
  });
  app.get("/api/me", (c) =>
    c.json({
      user: c.get("user"),
      csrf: c.get("csrf"),
      today: today(c.env.BUSINESS_TZ),
      timezone: c.env.BUSINESS_TZ,
    }),
  );
  app.post("/api/logout", async (c) => {
    await c.get("db")("DELETE FROM sessions WHERE token_hash=$1", [
      c.get("tokenHash"),
    ]);
    deleteCookie(c, "sr_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/pin", async (c) => {
    const p = z
      .object({ current: z.string().regex(/^\d{6}$/), pin: pinSchema })
      .parse(await c.req.json());
    if (p.current === p.pin)
      return c.json({ error: "Choose a different PIN" }, 400);
    const sql = c.get("db"),
      uid = c.get("user").id;
    const [limit] = await sql(
      `INSERT INTO login_limits(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.expires_at<now() THEN 1 ELSE login_limits.count+1 END,expires_at=CASE WHEN login_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE login_limits.expires_at END RETURNING count`,
      ["pin:" + uid],
    );
    if (limit.count > 5)
      return c.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        429,
      );
    const result = await sql(
      "UPDATE users SET pin_hash=crypt($1,gen_salt('bf',12)),must_change_pin=false WHERE id=$2 AND active AND pin_hash=crypt($3,pin_hash) RETURNING id",
      [p.pin, uid, p.current],
    );
    if (!result.length)
      return c.json({ error: "Current PIN is incorrect" }, 400);
    deleteCookie(c, "sr_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/api/sites", async (c) =>
    c.json(
      await c.get("db")(
        `SELECT s.id,s.name,s.active,s.status,s.version,(s.photo IS NOT NULL) AS has_photo,(SELECT count(*) FROM requisitions r WHERE r.site_id=s.id AND r.status='SUBMITTED' AND request_access($1,r.id))::int AS pending,(SELECT count(*) FROM requisitions r WHERE r.site_id=s.id AND request_access($1,r.id) AND EXISTS(SELECT 1 FROM events e WHERE e.requisition_id=r.id AND e.created_at>COALESCE((SELECT seen_at FROM seen WHERE user_id=$1 AND site_id=s.id),'1970-01-01')))::int AS updated FROM sites s WHERE site_access($1,s.id) ORDER BY s.active DESC,s.name`,
        [c.get("user").id],
      ),
    ),
  );
  app.post("/api/sites", async (c) => {
    if (c.get("user").role !== "DIRECTOR")
      return c.json({ error: "Director access required" }, 403);
    const p = z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(100),
        status: z
          .enum(["ACTIVE", "PIPELINE", "TO_START", "COMPLETED"])
          .default("ACTIVE"),
        version: z.number().int().nonnegative().default(0),
        photo: z
          .string()
          .max(160000)
          .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/)
          .nullable()
          .optional(),
      })
      .parse(await c.req.json());
    const rows = await c.get("db")(
      `WITH changed AS (
      INSERT INTO sites(id,name,active,status,photo) VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3<>'COMPLETED',$3,$4)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,status=excluded.status,photo=CASE WHEN $5 THEN excluded.photo ELSE sites.photo END,version=sites.version+1 WHERE sites.version=$6 RETURNING id,name,status,version
    ), logged AS (INSERT INTO events(actor_id,action,reason) SELECT $7,'SITE_UPDATED',name || ': ' || status FROM changed)
    SELECT * FROM changed`,
      [
        p.id ?? null,
        p.name,
        p.status,
        p.photo ?? null,
        p.photo !== undefined,
        p.version,
        c.get("user").id,
      ],
    );
    if (!rows.length)
      return c.json(
        { error: "This site changed. Refresh and try again." },
        409,
      );
    return c.json(rows[0]);
  });
  app.get("/api/sites/:id/photo", async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    const [row] = await c.get("db")(
      "SELECT photo FROM sites WHERE id=$1 AND site_access($2,id)",
      [id, c.get("user").id],
    );
    if (!row?.photo) return c.notFound();
    const bytes = Uint8Array.from(atob(row.photo.split(",")[1]), (x) =>
      x.charCodeAt(0),
    );
    return c.body(bytes, 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
    });
  });
  app.get("/api/units", async (c) =>
    c.json(
      (
        await c.get("db")(
          "SELECT DISTINCT unit FROM items WHERE request_access($1,requisition_id) ORDER BY unit",
          [c.get("user").id],
        )
      ).map((x) => x.unit),
    ),
  );
  app.post("/api/sites/:id/seen", async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    await c.get("db")(
      "INSERT INTO seen(user_id,site_id) SELECT $1,$2 WHERE site_access($1,$2) ON CONFLICT(user_id,site_id) DO UPDATE SET seen_at=now()",
      [c.get("user").id, id],
    );
    return c.json({ ok: true });
  });
  app.get("/api/users", async (c) => {
    if (c.get("user").role !== "DIRECTOR")
      return c.json({ error: "Director access required" }, 403);
    return c.json(
      await c.get("db")(
        `SELECT u.id,u.name,u.phone,u.role,u.active,u.must_change_pin,COALESCE((SELECT json_agg(site_id) FROM assignments WHERE user_id=u.id),'[]') AS site_ids FROM users u ORDER BY name`,
      ),
    );
  });
  app.post("/api/users", async (c) => {
    if (c.get("user").role !== "DIRECTOR")
      return c.json({ error: "Director access required" }, 403);
    const raw = await c.req.json();
    const p = userSchema.parse(raw);
    const id = z.uuid().optional().parse(raw.id);
    const hash = p.pin
      ? (
          await c.get("db")("SELECT crypt($1,gen_salt('bf',12)) AS hash", [
            p.pin,
          ])
        )[0].hash
      : null;
    const { pin, ...safe } = p;
    const [r] = await c.get("db")(
      "SELECT save_user($1,$2,$3::jsonb,$4) AS id",
      [c.get("user").id, id ?? null, JSON.stringify(safe), hash],
    );
    return c.json(r);
  });
  app.get("/api/requisitions", async (c) => {
    const site = c.req.query("site");
    if (site) z.uuid().parse(site);
    return c.json(
      await c.get("db")(
        `SELECT r.*,s.name AS site_name,u.name AS requested_name,(SELECT count(*)::int FROM items WHERE requisition_id=r.id) AS item_count,(SELECT bool_and(received+cancelled=quantity) FROM items WHERE requisition_id=r.id) AS completed FROM requisitions r JOIN sites s ON s.id=r.site_id JOIN users u ON u.id=r.requested_by WHERE request_access($1,r.id) AND ($2::uuid IS NULL OR r.site_id=$2) ORDER BY r.created_at DESC`,
        [c.get("user").id, site ?? null],
      ),
    );
  });
  app.post("/api/requisitions", async (c) => {
    const p = requisitionSchema.parse(await c.req.json());
    const [r] = await c.get("db")(
      "SELECT create_requisition($1,$2::jsonb,$3) AS id",
      [
        c.get("user").id,
        JSON.stringify(p),
        c.env.BUSINESS_TZ || "Asia/Kolkata",
      ],
    );
    return c.json(r, 201);
  });
  app.get("/api/requisitions/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id")),
      sql = c.get("db"),
      uid = c.get("user").id;
    const [r] = await sql(
      `SELECT r.*,s.name AS site_name,u.name AS requested_name FROM requisitions r JOIN sites s ON s.id=r.site_id JOIN users u ON u.id=r.requested_by WHERE r.id=$1 AND request_access($2,r.id)`,
      [id, uid],
    );
    if (!r) return c.json({ error: "Requisition not found" }, 404);
    const [items, events, batches] = await Promise.all([
      sql("SELECT * FROM item_details WHERE requisition_id=$1 ORDER BY id", [
        id,
      ]),
      sql(
        "SELECT e.*,u.name AS actor_name FROM events e JOIN users u ON u.id=e.actor_id WHERE requisition_id=$1 ORDER BY e.id",
        [id],
      ),
      sql(
        "SELECT b.* FROM order_batches b JOIN items i ON i.id=b.item_id WHERE i.requisition_id=$1 ORDER BY b.created_at,b.id",
        [id],
      ),
    ]);
    return c.json({ ...r, items, events, batches });
  });
  app.post("/api/requisitions/:id/status", async (c) => {
    const p = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
        reason: z.string().trim().max(300).default(""),
      })
      .parse(await c.req.json());
    await c.get("db")("SELECT transition_requisition($1,$2,$3,$4)", [
      c.get("user").id,
      z.uuid().parse(c.req.param("id")),
      p.status,
      p.reason,
    ]);
    return c.json({ ok: true });
  });
  app.get("/api/items", async (c) =>
    c.json(
      await c.get("db")(
        `SELECT * FROM item_details WHERE site_access($1,site_id) AND requisition_status='APPROVED' AND received+cancelled<quantity ORDER BY required_by,site_name`,
        [c.get("user").id],
      ),
    ),
  );
  app.post("/api/items/:id/action", async (c) => {
    const p = z
      .object({
        action: z.enum([
          "ORDERED",
          "DISPATCHED",
          "RECEIVED",
          "CANCELLED",
          "STATUS",
        ]),
        version: z.number().int().nonnegative(),
        quantity: qty.optional(),
        reason: z.string().trim().max(300).default(""),
        supplier: z.string().trim().max(150).default(""),
        contact: z.string().trim().max(100).default(""),
        expectedBy: dateSchema.optional(),
        batchId: z.uuid().optional(),
        shippingStatus: z
          .enum(["NOT_SHIPPED", "IN_TRANSIT", "DELAYED"])
          .optional(),
      })
      .parse(await c.req.json());
    if (p.action === "STATUS" && (!p.batchId || !p.shippingStatus))
      return c.json({ error: "Choose a batch and shipping status" }, 400);
    await c.get("db")("SELECT act_item($1,$2,$3,$4::jsonb)", [
      c.get("user").id,
      z.uuid().parse(c.req.param("id")),
      p.version,
      JSON.stringify(p),
    ]);
    return c.json({ ok: true });
  });
  app.get("/api/report", async (c) => {
    const day = dateSchema.parse(
        c.req.query("date") || today(c.env.BUSINESS_TZ),
      ),
      site = c.req.query("site");
    if (site) z.uuid().parse(site);
    const sql = c.get("db"),
      uid = c.get("user").id,
      tz = c.env.BUSINESS_TZ || "Asia/Kolkata";
    const filter =
      "request_access($1,requisition_id) AND ($2::uuid IS NULL OR site_id=$2)";
    const [raised, activity, open, siteOverview, orders] = await Promise.all([
      sql(
        `SELECT * FROM item_details WHERE ${filter} AND request_date=$3::date ORDER BY site_name,number,id`,
        [uid, site ?? null, day],
      ),
      sql(
        `SELECT e.*,u.name AS actor_name,r.number,r.site_id,s.name AS site_name,i.description FROM events e JOIN users u ON u.id=e.actor_id JOIN requisitions r ON r.id=e.requisition_id JOIN sites s ON s.id=r.site_id LEFT JOIN items i ON i.id=e.item_id WHERE request_access($1,r.id) AND ($2::uuid IS NULL OR r.site_id=$2) AND e.created_at>=($3::date::timestamp AT TIME ZONE $4) AND e.created_at<(($3::date+1)::timestamp AT TIME ZONE $4) ORDER BY e.created_at DESC`,
        [uid, site ?? null, day, tz],
      ),
      sql(
        `SELECT * FROM item_details WHERE ${filter} AND requisition_status IN ('SUBMITTED','APPROVED') AND received+cancelled<quantity ORDER BY required_by,site_name,number`,
        [uid, site ?? null],
      ),
      sql(
        `SELECT s.id,s.name,s.status,s.version,(s.photo IS NOT NULL) AS has_photo,
        count(i.id)::int AS materials,
        count(i.id) FILTER (WHERE i.requisition_status='SUBMITTED')::int AS pending,
        count(i.id) FILTER (WHERE i.item_status='DELIVERED' AND i.requisition_status='APPROVED')::int AS delivered,
        count(i.id) FILTER (WHERE i.requisition_status IN ('SUBMITTED','APPROVED') AND i.received+i.cancelled<i.quantity)::int AS open,
        count(i.id) FILTER (WHERE i.requisition_status='APPROVED' AND i.ordered_quantity+i.cancelled<i.quantity)::int AS to_order,
        count(i.id) FILTER (WHERE i.dispatched>i.received)::int AS in_transit,
        count(i.id) FILTER (WHERE i.required_by<(now() AT TIME ZONE $3)::date AND i.requisition_status IN ('SUBMITTED','APPROVED') AND i.received+i.cancelled<i.quantity)::int AS overdue
        FROM sites s LEFT JOIN item_details i ON i.site_id=s.id AND request_access($1,i.requisition_id)
        WHERE site_access($1,s.id) AND ($2::uuid IS NULL OR s.id=$2) GROUP BY s.id ORDER BY s.name`,
        [uid, site ?? null, tz],
      ),
      sql(
        `SELECT b.*,i.description,i.unit,i.number,i.site_name FROM order_batches b JOIN item_details i ON i.id=b.item_id WHERE request_access($1,i.requisition_id) AND ($2::uuid IS NULL OR i.site_id=$2) ORDER BY b.created_at DESC`,
        [uid, site ?? null],
      ),
    ]);
    const now = today(tz);
    const count = (a: string) => activity.filter((e) => e.action === a).length;
    return c.json({
      date: day,
      today: now,
      timezone: tz,
      generatedAt: new Date().toISOString(),
      siteOverview,
      orders,
      raised,
      activity,
      open,
      summary: {
        raised: new Set(raised.map((i) => i.requisition_id)).size,
        approved: count("APPROVED"),
        rejected: count("REJECTED"),
        ordered: count("ORDERED"),
        dispatches: count("DISPATCHED"),
        receipts: count("RECEIVED"),
        delivered: activity.filter(
          (e) => e.to_status === "DELIVERED" && e.from_status !== "DELIVERED",
        ).length,
        overdue: open.filter((i) => String(i.required_by).slice(0, 10) < now)
          .length,
      },
    });
  });
  return app;
}
export default createApp();
