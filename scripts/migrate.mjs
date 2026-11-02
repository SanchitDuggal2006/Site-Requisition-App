import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const files = (await readdir(new URL("../db/", import.meta.url)))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = file.replace(".sql", "");
    const exists = await client.query(
      "SELECT to_regclass('public.schema_migrations') AS name",
    );
    if (
      exists.rows[0].name &&
      (
        await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [
          version,
        ])
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    await client.query(
      await readFile(new URL("../db/" + file, import.meta.url), "utf8"),
    );
    await client.query("COMMIT");
    console.log("Applied " + version);
  }
  console.log("Database schema is current.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
