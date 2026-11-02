import { db } from "../lib/db.ts";
import { TABLES, SCHEMA_VERSION } from "../lib/migrations.ts";
import { writeFileSync } from "node:fs";
const violations = (sql) => db.prepare(sql).all();
const integrity = violations("PRAGMA integrity_check").map(
  (r) => r.integrity_check,
);
const checks = {
  integrity: integrity.length === 1 && integrity[0] === "ok",
  foreignKeysEnabled:
    db.prepare("PRAGMA foreign_keys").get().foreign_keys === 1,
  foreignKeys: violations("PRAGMA foreign_key_check").length === 0,
  schemaVersion:
    db.prepare("PRAGMA user_version").get().user_version === SCHEMA_VERSION,
  strictTables: TABLES.every(
    (t) =>
      db.prepare("SELECT strict FROM pragma_table_list WHERE name=?").get(t)
        ?.strict === 1,
  ),
  ratingCaches:
    violations(
      "SELECT r.recipe_id FROM recipes r WHERE r.avg_rating<>COALESCE((SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=r.recipe_id),0)",
    ).length === 0,
  allergenCaches:
    violations(
      "SELECT i.ingredient_id FROM ingredients i WHERE is_common_allergen<>EXISTS(SELECT 1 FROM ingredient_allergens ia WHERE ia.ingredient_id=i.ingredient_id)",
    ).length === 0,
  mealDateRanges:
    violations(
      "SELECT m.plan_id FROM meal_plan_recipes m JOIN meal_plans p USING(plan_id) WHERE m.meal_date NOT BETWEEN p.start_date AND p.end_date",
    ).length === 0,
  recipesHaveIngredients:
    violations(
      "SELECT r.recipe_id FROM recipes r WHERE NOT EXISTS(SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id=r.recipe_id)",
    ).length === 0,
  noCaseDuplicateEmails:
    violations(
      "SELECT lower(trim(email)) FROM users GROUP BY lower(trim(email)) HAVING COUNT(*)>1",
    ).length === 0,
  noSelfSubstitutions:
    violations(
      "SELECT 1 FROM substitutions WHERE ingredient_id_from=ingredient_id_to",
    ).length === 0,
};
const tables = TABLES.map((name) => ({
  name,
  rows: db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,
  foreignKeys: db.prepare(`PRAGMA foreign_key_list(${name})`).all().length,
}));
const report = {
  checkedAt: new Date().toISOString(),
  database: process.env.DATABASE_PATH || "data/reciperadar.sqlite",
  version: SCHEMA_VERSION,
  ok: Object.values(checks).every(Boolean),
  checks,
  tables,
  indexes: violations(
    "SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%'",
  ).map((r) => r.name),
  triggers: violations(
    "SELECT name FROM sqlite_schema WHERE type='trigger'",
  ).map((r) => r.name),
  views: violations("SELECT name FROM sqlite_schema WHERE type='view'").map(
    (r) => r.name,
  ),
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
db.close();
if (!report.ok) process.exitCode = 1;
