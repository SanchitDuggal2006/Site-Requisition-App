import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createApp } from "../server/index";
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(
  (await readFile("db/001_initial.sql", "utf8")).replaceAll(
    "PERFORM pg_advisory_xact_lock(774201);",
    "",
  ),
);
const query = async (q: string, p: any[] = []) => {
  const result = await db.query(q, p);
  return result.rows as any[];
};
const site = crypto.randomUUID();
await query("INSERT INTO sites(id,name) VALUES($1,'Pilot - Sample Site')", [
  site,
]);
for (const [n, role] of [
  "DIRECTOR",
  "MANAGER",
  "SUPERVISOR",
  "PURCHASE",
].entries()) {
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO users(id,name,phone,role,pin_hash,must_change_pin) VALUES($1,$2,$3,$4,crypt('681429',gen_salt('bf',4)),false)",
    [id, "Test " + role.toLowerCase(), "+91900000000" + n, role],
  );
  if (["MANAGER", "SUPERVISOR"].includes(role))
    await query("INSERT INTO assignments VALUES($1,$2)", [id, site]);
}
const app = createApp(query);
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1:4173");
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const response = await app.fetch(
        new Request(url, {
          method: req.method,
          headers: req.headers as HeadersInit,
          ...(body.length ? { body, duplex: "half" } : {}),
        } as RequestInit),
        { DATABASE_URL: "", BUSINESS_TZ: "Asia/Kolkata" },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = resolve("dist", "." + decodeURIComponent(url.pathname));
    if (
      !file.startsWith(resolve("dist") + requireSeparator()) &&
      file !== resolve("dist")
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (url.pathname === "/" || !extname(file))
      file = resolve("dist/index.html");
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Test server error");
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Isolated sample app listening on 4173"),
);
function requireSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}
