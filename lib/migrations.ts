import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = 4;
// Parent-first copy order. Reverse order is used only while replacing v1 tables.
export const TABLES = [
  "users",
  "allergens",
  "cuisines",
  "dietary_types",
  "ingredients",
  "recipes",
  "ingredient_allergens",
  "user_allergens",
  "recipe_ingredients",
  "ratings",
  "favorites",
  "meal_plans",
  "meal_plan_recipes",
  "substitutions",
  "sessions",
  "vector_sync_outbox",
  "vector_documents",
] as const;
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

/** Atomic v1/v2/v3 -> v4 migration, with a consistent SQLite backup before replacement.
 * Invalid legacy records abort and roll back; they are never silently discarded.
 */
export function migrate(db: DatabaseSync, filename: string) {
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (version > SCHEMA_VERSION)
    throw Error("Database is newer than this application");
  if (version === SCHEMA_VERSION) return { version, migrated: false };
  const existing = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((r) => String(r.name));
  const unknown = existing.filter(
    (t) => !(TABLES as readonly string[]).includes(t),
  );
  if (unknown.length)
    throw Error("Migration stopped: unexpected tables: " + unknown.join(", "));
  const extras = db
    .prepare(
      "SELECT name,type FROM sqlite_schema WHERE (type='view' AND name NOT IN ('recipe_allergen_details','meal_plan_daily_nutrition','meal_plan_shopping_list')) OR (type='trigger' AND name NOT IN ('rating_insert','rating_update','rating_delete','rating_cache_insert','rating_cache_update','allergen_mapping_insert','allergen_mapping_update','allergen_mapping_delete','allergen_flag_insert','allergen_flag_update','meal_date_insert','meal_date_update','plan_date_update','recipe_steps_insert','recipe_steps_update')) OR (type='index' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('idx_recipe_ingredient','idx_plan_user','idx_user_allergen_reverse','idx_ingredient_allergen_reverse','idx_recipes_creator','idx_recipes_cuisine','idx_recipes_diet','idx_rating_recipe','idx_favorites_recipe','idx_plan_recipe','idx_substitution_target','idx_session_user','idx_session_expiry','idx_vector_outbox_created','idx_vector_payload_diet'))",
    )
    .all();
  if (extras.length)
    throw Error(
      "Migration stopped: unexpected schema objects: " +
        extras.map((o) => o.name).join(", "),
    );
  let backup: string | undefined;
  if (existing.length && filename !== ":memory:") {
    const directory = path.join(path.dirname(filename), "backups");
    mkdirSync(directory, { recursive: true });
    backup = path.join(
      directory,
      `before-v4-${Date.now()}-${process.pid}.sqlite`,
    );
    // VACUUM INTO includes committed WAL data, unlike copying the main .sqlite file.
    db.prepare("VACUUM INTO ?").run(backup);
  }
  db.exec("PRAGMA foreign_keys=OFF;");
  try {
    db.exec("BEGIN IMMEDIATE;");
    // Another process may have finished migrating while this connection waited.
    if (
      Number(db.prepare("PRAGMA user_version").get()!.user_version) ===
      SCHEMA_VERSION
    ) {
      db.exec("COMMIT");
      return { version: SCHEMA_VERSION, migrated: false, backup };
    }
    const rows = new Map<string, Record<string, any>[]>();
    for (const table of TABLES)
      rows.set(
        table,
        existing.includes(table)
          ? db.prepare(`SELECT * FROM ${quote(table)}`).all()
          : [],
      );
    // Views are dropped first to avoid stale references while rebuilding tables.
    for (const row of db
      .prepare("SELECT name FROM sqlite_schema WHERE type='view'")
      .all())
      db.exec(`DROP VIEW ${quote(String(row.name))}`);
    for (const table of [...TABLES].reverse())
      if (existing.includes(table)) db.exec(`DROP TABLE ${quote(table)}`);
    db.exec(readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
    for (const table of TABLES) {
      for (const original of rows.get(table)!) {
        const row = { ...original };
        // Derived caches are rebuilt from source records by SQL triggers.
        if (table === "recipes") row.avg_rating = 0;
        if (table === "ingredients") row.is_common_allergen = 0;
        const columns = Object.keys(row);
        db.prepare(
          `INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        ).run(...columns.map((c) => row[c]));
      }
      const count = Number(
        db.prepare(`SELECT COUNT(*) n FROM ${quote(table)}`).get()!.n,
      );
      if (count !== rows.get(table)!.length)
        throw Error(`Migration row count mismatch: ${table}`);
    }
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length)
      throw Error(
        "Migration foreign-key validation failed: " +
          JSON.stringify(violations),
      );
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
    return { version: SCHEMA_VERSION, migrated: true, backup };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw new Error(
      `Database migration aborted; existing data preserved${backup ? `; backup: ${backup}` : ""}. ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    db.exec("PRAGMA foreign_keys=ON;");
  }
}
