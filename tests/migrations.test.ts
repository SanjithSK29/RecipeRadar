import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate, SCHEMA_VERSION, TABLES } from "../lib/migrations.ts";
function legacy() {
  const filename = path.join(
    mkdtempSync(path.join(tmpdir(), "rr-migration-")),
    "legacy.sqlite",
  );
  const db = new DatabaseSync(filename);
  db.exec(readFileSync("db/migrations/001-original.sql", "utf8"));
  db.exec(`INSERT INTO users(user_id,name,email,password_hash) VALUES(1,'Existing user','existing@example.test','existing-hash');
 INSERT INTO allergens VALUES(1,'Milk','High');
 INSERT INTO cuisines VALUES(1,'Indian');
 INSERT INTO dietary_types VALUES(1,'Vegan');
 INSERT INTO ingredients(ingredient_id,name) VALUES(1,'Ingredient');
 INSERT INTO ingredient_allergens VALUES(1,1);
 INSERT INTO recipes(recipe_id,title,instructions,servings,calories_per_serving,cuisine_id,diet_id,created_by) VALUES(1,'Existing recipe','["Cook"]',2,400,1,1,1);
 INSERT INTO recipe_ingredients VALUES(1,1,120,'g');
 INSERT INTO favorites(user_id,recipe_id) VALUES(1,1);
 INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,4);
 INSERT INTO meal_plans(plan_id,user_id,plan_name,start_date,end_date) VALUES(1,1,'Existing plan','2026-11-02','2026-11-08');
 INSERT INTO meal_plan_recipes VALUES(1,1,'2026-11-03','Lunch',1.5);`);
  return { db, filename };
}
test("fresh migration creates all expected tables and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(migrate(db, ":memory:").version, SCHEMA_VERSION);
  assert.equal(migrate(db, ":memory:").migrated, false);
  for (const t of TABLES)
    assert.ok(
      db
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?")
        .get(t),
    );
  assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
  db.close();
});
test("legacy migration preserves records and creates an independently readable backup", () => {
  const { db, filename } = legacy();
  const counts = TABLES.map(
    (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()!.n,
  );
  const result = migrate(db, filename);
  assert.ok(result.migrated);
  assert.ok(existsSync(result.backup!));
  assert.deepEqual(
    TABLES.map((t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()!.n),
    counts,
  );
  assert.equal(
    db.prepare("SELECT password_hash FROM users").get()!.password_hash,
    "existing-hash",
  );
  assert.equal(
    db.prepare("SELECT avg_rating FROM recipes").get()!.avg_rating,
    4,
  );
  assert.equal(
    db.prepare("SELECT is_common_allergen FROM ingredients").get()!
      .is_common_allergen,
    1,
  );
  assert.equal(
    db.prepare("SELECT servings_planned FROM meal_plan_recipes").get()!
      .servings_planned,
    1.5,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const backup = new DatabaseSync(result.backup!, { readOnly: true });
  assert.equal(
    backup.prepare("SELECT name FROM users").get()!.name,
    "Existing user",
  );
  assert.equal(backup.prepare("PRAGMA user_version").get()!.user_version, 0);
  backup.close();
  db.close();
});
test("invalid legacy data aborts the migration and leaves the original schema and data intact", () => {
  const { db, filename } = legacy();
  db.exec("UPDATE users SET age=-5");
  assert.throws(() => migrate(db, filename), /migration aborted/);
  assert.equal(db.prepare("SELECT age FROM users").get()!.age, -5);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM meal_plan_recipes").get()!.n,
    1,
  );
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 0);
  assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
  assert.equal(
    db.prepare("SELECT strict FROM pragma_table_list WHERE name='users'").get()!
      .strict,
    0,
  );
  db.close();
});
test("unknown tables block automatic rebuilding", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE unexpected(secret TEXT)");
  assert.throws(() => migrate(db, ":memory:"), /unexpected tables/);
  assert.ok(
    db.prepare("SELECT name FROM sqlite_schema WHERE name='unexpected'").get(),
  );
  db.close();
});
test("newer database versions are rejected rather than downgraded", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA user_version=999");
  assert.throws(() => migrate(db, ":memory:"), /newer than this application/);
  db.close();
});
