// Database consistency audit:  npm run db:audit [-- output.json]
import pg from "pg";
import { writeFileSync } from "node:fs";
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw Error("DATABASE_ADMIN_URL is not set");
const client = new pg.Client({ connectionString: url });
await client.connect();
const rows = async (sql) => (await client.query(sql)).rows;
const empty = async (sql) => (await rows(sql)).length === 0;
try {
  const checks = {
    ratingCaches: await empty(
      "SELECT recipe_id FROM recipes r WHERE avg_rating <> COALESCE((SELECT round(avg(rating_value),2) FROM ratings WHERE recipe_id=r.recipe_id),0)",
    ),
    allergenCaches: await empty(
      "SELECT ingredient_id FROM ingredients i WHERE is_common_allergen <> EXISTS(SELECT 1 FROM ingredient_allergens ia WHERE ia.ingredient_id=i.ingredient_id)",
    ),
    mealDateRanges: await empty(
      "SELECT m.plan_id FROM meal_plan_recipes m JOIN meal_plans p USING(plan_id) WHERE m.meal_date NOT BETWEEN p.start_date AND p.end_date",
    ),
    recipesHaveIngredients: await empty(
      "SELECT recipe_id FROM recipes r WHERE NOT EXISTS(SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id=r.recipe_id)",
    ),
    noCaseDuplicateEmails: await empty(
      "SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*)>1",
    ),
    noSelfSubstitutions: await empty(
      "SELECT 1 FROM substitutions WHERE ingredient_id_from=ingredient_id_to",
    ),
    atLeastOneAdmin: !(await empty("SELECT 1 FROM users WHERE role='admin'")),
    approvedRecipesIndexed: await empty(
      "SELECT recipe_id FROM recipes r WHERE is_approved AND NOT EXISTS(SELECT 1 FROM vector_documents v WHERE v.recipe_id=r.recipe_id)",
    ),
    rlsEnabledOnUserData: await empty(
      "SELECT relname FROM pg_class WHERE relname IN ('users','recipes','favorites','ratings','meal_plans','meal_plan_recipes','user_allergens','recipe_ingredients') AND NOT relrowsecurity",
    ),
  };
  const report = {
    checkedAt: new Date().toISOString(),
    server: (await rows("SELECT version()"))[0].version,
    ok: Object.values(checks).every(Boolean),
    checks,
    migrations: (await rows("SELECT version FROM schema_migrations ORDER BY version")).map((r) => r.version),
    tables: await rows(
      `SELECT c.relname AS name, c.reltuples::bigint AS approx_rows,
              (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f') AS foreign_keys
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`,
    ),
    indexes: (await rows("SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")).map((r) => r.indexname),
    triggers: (await rows("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname")).map((r) => r.tgname),
    views: (await rows("SELECT viewname FROM pg_views WHERE schemaname='public' ORDER BY viewname")).map((r) => r.viewname),
    routines: (await rows("SELECT proname || CASE prokind WHEN 'p' THEN ' (procedure)' ELSE '' END AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname NOT LIKE 'trg\\_%' ORDER BY 1")).map((r) => r.name),
    roles: await rows(
      "SELECT rolname, rolcanlogin AS can_login FROM pg_roles WHERE rolname LIKE 'rr\\_%' ORDER BY rolname",
    ),
    policies: (await rows("SELECT tablename || '.' || policyname AS p FROM pg_policies ORDER BY 1")).map((r) => r.p),
  };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await client.end();
}
