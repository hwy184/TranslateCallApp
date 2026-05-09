import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distMigrationsDir = join(__dirname, "migrations");
const srcMigrationsDir = join(process.cwd(), "src", "db", "migrations");

async function resolveMigrationsDir(): Promise<string> {
  try {
    await access(distMigrationsDir);
    return distMigrationsDir;
  } catch {
    return srcMigrationsDir;
  }
}

async function ensureMigrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  await ensureMigrationTable();
  const migrationsDir = await resolveMigrationsDir();
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
    if (exists.rowCount && exists.rowCount > 0) {
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf-8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
      await pool.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${version}`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

run()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("[migrate] failed", error);
    await pool.end();
    process.exit(1);
  });
