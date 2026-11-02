import pg from "pg";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL);
url.hostname = url.hostname.replace("-pooler", "");
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
try {
  const { rows } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname='site_requisitions_test'",
  );
  if (!rows.length) await admin.query("CREATE DATABASE site_requisitions_test");
} finally {
  await admin.end();
}
url.pathname = "/site_requisitions_test";
const run = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/database.test.ts"],
  { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: url.href } },
);
process.exitCode = run.status ?? 1;
