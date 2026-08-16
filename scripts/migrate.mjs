import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is required");
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const directory = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(directory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

await db.execute(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

for (const file of files) {
  const applied = await db.execute({
    sql: "SELECT 1 FROM _migrations WHERE name = ?",
    args: [file],
  });
  if (applied.rows.length) {
    console.log(`Skipped ${file} (already applied)`);
    continue;
  }
  const sql = await readFile(path.join(directory, file), "utf8");
  await db.executeMultiple(sql);
  await db.execute({
    sql: "INSERT INTO _migrations (name) VALUES (?)",
    args: [file],
  });
  console.log(`Applied ${file}`);
}

db.close();
