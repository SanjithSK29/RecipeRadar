// Versioned SQL migration runner shared by `npm run db:setup` and the tests.
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../db/migrations/", import.meta.url);

/** Create/refresh the rr_app login role. The password comes from the environment, never from source. */
async function ensureAppRole(client, password) {
  const { rows } = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'rr_app'",
  );
  if (!rows.length && !password)
    throw new Error(
      "RR_APP_PASSWORD must be set to create the rr_app login role",
    );
  if (password) {
    const verb = rows.length ? "ALTER" : "CREATE";
    const { rows: stmt } = await client.query(
      `SELECT format('${verb} ROLE rr_app LOGIN NOINHERIT PASSWORD %L', $1::text) AS sql`,
      [password],
    );
    await client.query(stmt[0].sql);
  }
}

/**
 * Apply every migration in db/migrations that is not yet recorded in schema_migrations.
 * Each file runs in its own transaction. Returns the list of versions applied.
 */
export async function migrate(client, { appPassword } = {}) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await client.query("SELECT version FROM schema_migrations")).rows.map(
      (r) => r.version,
    ),
  );
  const applied = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    if (file.startsWith("004_")) await ensureAppRole(client, appPassword);
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(new URL(file, DIR), "utf8"));
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  if (appPassword && !applied.some((f) => f.startsWith("004_")))
    await ensureAppRole(client, appPassword);
  return applied;
}
