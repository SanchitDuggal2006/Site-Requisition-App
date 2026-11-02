import pg from "pg";
import { phoneSchema, pinSchema } from "../server/domain";
const name = process.env.ADMIN_NAME?.trim();
if (!name) throw new Error("Set ADMIN_NAME");
const phone = phoneSchema.parse(process.env.ADMIN_PHONE),
  pin = pinSchema.parse(process.env.ADMIN_PIN);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(774201)");
  const { rows } = await client.query(
    "SELECT id FROM users WHERE role='DIRECTOR' AND active",
  );
  if (rows.length)
    throw new Error("An active director exists. Use the app to add another.");
  await client.query(
    "INSERT INTO users(name,phone,role,pin_hash) VALUES($1,$2,'DIRECTOR',crypt($3,gen_salt('bf',12)))",
    [name, phone, pin],
  );
  await client.query("COMMIT");
  console.log("Initial director created; PIN change required at first login.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
