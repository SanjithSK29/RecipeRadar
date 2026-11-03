// Database tests against a real PostgreSQL server (no mocks).
//   DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
// Each run creates a throwaway database, applies db/migrations, seeds demo data, and drops it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { seed } from "../scripts/seed.mjs";

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error("Set DATABASE_ADMIN_URL to run the database tests");
const dbName = `rr_test_${Date.now()}_${process.pid}`;
const urlFor = (name) => {
  const u = new URL(adminUrl);
  u.pathname = "/" + name;
  return u.toString();
};
let root, db;

/** Run `fn` inside a transaction that is always rolled back, optionally as a role / user. */
async function sandbox(fn, { role, uid } = {}) {
  await db.query("BEGIN");
  try {
    if (role) {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query("SELECT set_config('rr.user_id', $1, true)", [String(uid ?? "")]);
    }
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}
/** Assert that a statement fails with the given SQLSTATE (inside a savepoint so the tx survives). */
async function fails(sql, code, args = []) {
  await db.query("SAVEPOINT t");
  try {
    await db.query(sql, args);
  } catch (error) {
    await db.query("ROLLBACK TO t");
    assert.equal(error.code, code, `${sql} -> ${error.code} ${error.message}`);
    return error;
  }
  assert.fail(`expected ${code} from: ${sql}`);
}
const val = async (sql, args = []) => (await db.query(sql, args)).rows[0];

before(async () => {
  root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`CREATE DATABASE ${dbName}`);
  db = new pg.Client({ connectionString: urlFor(dbName) });
  await db.connect();
  await migrate(db, { appPassword: "test-only-password" });
  await seed(db);
});
after(async () => {
  await db?.end();
  await root?.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await root?.end();
});

test("migrations are recorded, idempotent, and create the expected objects", async () => {
  assert.deepEqual(await migrate(db, { appPassword: "test-only-password" }), []);
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map((r) => r.tablename);
  for (const t of ["users", "recipes", "ingredients", "ratings", "favorites", "meal_plans", "meal_plan_recipes",
    "substitutions", "sessions", "vector_documents", "vector_sync_outbox", "audit_log", "schema_migrations"])
    assert.ok(tables.includes(t), t);
  assert.equal((await val("SELECT count(*)::int n FROM recipes")).n, 12);
});

test("constraints: CHECK, UNIQUE (case-insensitive email), NOT NULL, FK", async () => {
  await sandbox(async () => {
    await fails("INSERT INTO users(name,email,password_hash,role) VALUES('x','a@b.c','h','root')", "23514");
    await fails("INSERT INTO users(name,email,password_hash) VALUES('x','DEMO@reciperadar.app','h')", "23505");
    await fails("INSERT INTO users(name,email,password_hash) VALUES(NULL,'n@b.c','h')", "23502");
    await fails("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,6)", "23514");
    await fails("INSERT INTO recipe_ingredients VALUES(1,9999,1,'g')", "23503");
    await fails("INSERT INTO substitutions VALUES(1,1,0.5)", "23514");
    await fails("INSERT INTO recipe_ingredients VALUES(1,5,-1,'g')", "23514");
    await fails("UPDATE recipes SET instructions='[]' WHERE recipe_id=1", "23514");
    await fails("UPDATE recipes SET instructions='[\"ok\",\"\"]' WHERE recipe_id=1", "23514");
    await fails("UPDATE recipes SET instructions='[1]' WHERE recipe_id=1", "23514");
    await fails("INSERT INTO sessions VALUES('nothex',1,1)", "23514");
  });
});

test("referential actions: cascade vs restrict", async () => {
  await sandbox(async () => {
    await db.query("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,2,5)");
    await db.query("DELETE FROM recipes WHERE recipe_id=2 AND NOT EXISTS (SELECT 1 FROM meal_plan_recipes WHERE recipe_id=2)");
    assert.equal((await val("SELECT count(*)::int n FROM ratings WHERE recipe_id=2")).n, 0, "ratings cascade");
    await fails("DELETE FROM cuisines WHERE cuisine_id=1", "23001"); // ON DELETE RESTRICT
    await fails("DELETE FROM users WHERE user_id=1", "23001"); // owns recipes -> RESTRICT
  });
});

test("trigger: avg_rating follows ratings (insert, update, delete) and cannot be forged", async () => {
  await sandbox(async () => {
    await db.query("INSERT INTO users(name,email,password_hash) VALUES('R','r@x.test','h')");
    const uid = (await val("SELECT user_id FROM users WHERE email='r@x.test'")).user_id;
    const avg = async () => Number((await val("SELECT avg_rating FROM recipes WHERE recipe_id=3")).avg_rating);
    await db.query("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,3,4),($1,3,2)", [uid]);
    assert.equal(await avg(), 3);
    await db.query("UPDATE ratings SET rating_value=5 WHERE user_id=1 AND recipe_id=3");
    assert.equal(await avg(), 3.5);
    await db.query("DELETE FROM ratings WHERE user_id=$1", [uid]);
    assert.equal(await avg(), 5);
    await db.query("DELETE FROM ratings WHERE recipe_id=3");
    assert.equal(await avg(), 0);
    await fails("UPDATE recipes SET avg_rating=4.9 WHERE recipe_id=3", "23514");
  });
});

test("trigger: ingredients.is_common_allergen follows allergen mappings", async () => {
  await sandbox(async () => {
    const flag = async (id) => (await val("SELECT is_common_allergen f FROM ingredients WHERE ingredient_id=$1", [id])).f;
    assert.equal(await flag(1), false);
    await db.query("INSERT INTO ingredient_allergens VALUES(1,2)");
    assert.equal(await flag(1), true);
    await db.query("DELETE FROM ingredient_allergens WHERE ingredient_id=1");
    assert.equal(await flag(1), false);
    await fails("UPDATE ingredients SET is_common_allergen=true WHERE ingredient_id=1", "23514");
  });
});

test("trigger: meal dates stay inside the plan and plans cannot shrink past meals", async () => {
  await sandbox(async () => {
    await db.query("INSERT INTO meal_plans(plan_id,user_id,plan_name,start_date,end_date) VALUES(900,1,'T','2026-11-02','2026-11-04')");
    await fails("INSERT INTO meal_plan_recipes VALUES(900,1,'2026-11-09','Lunch',1)", "23514");
    await db.query("INSERT INTO meal_plan_recipes VALUES(900,1,'2026-11-03','Lunch',1)");
    await fails("UPDATE meal_plans SET end_date='2026-11-02' WHERE plan_id=900", "23514");
    await fails("INSERT INTO meal_plans(user_id,plan_name,start_date,end_date) VALUES(1,'bad','2026-11-05','2026-11-01')", "23514");
  });
});

test("trigger: the last administrator cannot be demoted; role changes are audited", async () => {
  await sandbox(async () => {
    await fails("UPDATE users SET role='user' WHERE role='admin'", "23514");
    await db.query("UPDATE users SET role='admin' WHERE user_id=1");
    await db.query("UPDATE users SET role='user' WHERE user_id=1");
    const rows = (await db.query("SELECT old_value,new_value FROM audit_log WHERE table_name='users' ORDER BY audit_id")).rows;
    assert.deepEqual(rows.map((r) => `${r.old_value}>${r.new_value}`), ["user>admin", "admin>user"]);
  });
});

test("functions: portion calories, flavor similarity, cosine similarity, allergen lookup", async () => {
  assert.equal(Number((await val("SELECT fn_portion_calories(480, 2) v")).v), 960);
  assert.equal((await val("SELECT fn_portion_calories(480, -1) v")).v, null);
  assert.equal(Number((await val("SELECT fn_flavor_similarity('creamy bright','creamy earthy') v")).v), 0.3333);
  assert.equal(Number((await val("SELECT fn_flavor_similarity('', '') v")).v), 0);
  const cos = async (a, b) => (await val("SELECT fn_cosine_similarity($1::float8[], $2::float8[]) v", [a, b])).v;
  assert.ok(Math.abs((await cos([1, 0, 0], [1, 0, 0])) - 1) < 1e-12);
  assert.ok(Math.abs(await cos([1, 0], [0, 1])) < 1e-12);
  assert.equal(await cos([0, 0], [1, 1]), 0);
  const names = (await db.query("SELECT name FROM fn_recipe_allergens(4) ORDER BY name")).rows.map((r) => r.name);
  assert.deepEqual(names, ["Peanuts", "Soy"]); // Peanut tofu crunch bowl
});

test("stored procedure sp_generate_meal_plan: 21 meals, diet + allergen aware, calorie targeted", async () => {
  await sandbox(async () => {
    await db.query("INSERT INTO user_allergens VALUES(1,2)"); // peanuts
    const { p_plan_id } = await val("CALL sp_generate_meal_plan(1, DATE '2026-11-09', NULL)");
    assert.equal((await val("SELECT count(*)::int n FROM meal_plan_recipes WHERE plan_id=$1", [p_plan_id])).n, 21);
    assert.equal((await val("SELECT count(*)::int n FROM meal_plan_recipes m WHERE plan_id=$1 AND recipe_id=4", [p_plan_id])).n, 0, "peanut recipe excluded");
    const days = (await db.query("SELECT calories FROM meal_plan_daily_nutrition WHERE plan_id=$1", [p_plan_id])).rows;
    assert.equal(days.length, 7);
    for (const d of days) assert.ok(Math.abs(Number(d.calories) - 2000) < 60, `kcal ${d.calories}`);
    const shopping = (await db.query("SELECT * FROM meal_plan_shopping_list WHERE plan_id=$1", [p_plan_id])).rows;
    assert.ok(shopping.length > 0 && shopping.every((s) => Number(s.quantity) > 0));
  });
  await sandbox(async () => {
    await db.query("UPDATE users SET diet_goal='Vegan' WHERE user_id=1");
    await db.query("DELETE FROM recipes WHERE recipe_id=2"); // remove a vegan dinner source
    await db.query("UPDATE recipes SET is_approved=false WHERE diet_id=1");
    const e = await fails("CALL sp_generate_meal_plan(1, DATE '2026-11-09', NULL)", "P0002");
    assert.match(e.message, /Not enough recipes/);
  });
});

test("vector search inside PostgreSQL ranks by cosine similarity", async () => {
  await sandbox(async () => {
    const unit = (i) => Array.from({ length: 128 }, (_, k) => (k === i ? 1 : 0));
    await db.query("DELETE FROM vector_documents");
    for (const [rid, i] of [[1, 0], [2, 1], [3, 2]])
      await db.query("INSERT INTO vector_documents VALUES($1,$2::float8[],'{}'::jsonb)", [rid, unit(i)]);
    const q = unit(1).map((v, k) => (k === 1 ? 1 : k === 0 ? 0.5 : 0));
    const hits = (await db.query("SELECT recipe_id,score FROM fn_search_vectors($1::float8[], 3)", [q])).rows;
    assert.deepEqual(hits.map((h) => h.recipe_id), [2, 1, 3]);
    assert.ok(hits[0].score > hits[1].score && hits[1].score > hits[2].score);
    await fails("INSERT INTO vector_documents VALUES(4,'{1,2,3}','{}')", "23514"); // wrong dimension
  });
});

test("full-text search (ALTER-added tsvector + GIN index)", async () => {
  const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='recipes' AND column_name='search_vector'")).rows;
  assert.equal(cols.length, 1);
  assert.ok((await val("SELECT count(*)::int n FROM pg_indexes WHERE indexname='idx_recipes_search'")).n === 1);
  const hits = (await db.query("SELECT title FROM fn_search_recipes('lentil curry')")).rows;
  assert.ok(hits.length >= 1 && /lentil/i.test(hits[0].title));
  assert.equal((await db.query("SELECT * FROM fn_search_recipes('zzzzqqqq')")).rowCount, 0);
});

test("DDL: CREATE / ALTER / DROP lifecycle on a scratch table", async () => {
  await sandbox(async () => {
    await db.query("CREATE TABLE ddl_demo (id INT PRIMARY KEY, label TEXT NOT NULL)");
    await db.query("ALTER TABLE ddl_demo ADD COLUMN score INT CHECK (score BETWEEN 0 AND 10)");
    await db.query("CREATE INDEX ddl_demo_score ON ddl_demo(score)");
    await fails("INSERT INTO ddl_demo VALUES(1,'a',99)", "23514");
    await db.query("ALTER TABLE ddl_demo DROP COLUMN score");
    await db.query("DROP TABLE ddl_demo");
    assert.equal((await val("SELECT to_regclass('ddl_demo') r")).r, null);
  });
});

// ---------------------------------------------------------------- roles and row-level security
test("rr_guest is read-only and cannot see unapproved recipes or password hashes", async () => {
  await sandbox(async () => {
    await db.query("RESET ROLE"); // arrange as the owner, then act as the guest
    await db.query("UPDATE recipes SET is_approved=false WHERE recipe_id=1");
    await db.query("SET LOCAL ROLE rr_guest");
    assert.equal((await val("SELECT count(*)::int n FROM recipes")).n, 11);
    await fails("INSERT INTO favorites VALUES(1,2)", "42501");
    await fails("SELECT password_hash FROM users", "42501");
    await fails("UPDATE recipes SET title='x'", "42501");
  }, { role: "rr_guest" });
});

test("rr_user: sees and changes only its own rows (row-level security)", async () => {
  await sandbox(async () => {
    await db.query("RESET ROLE"); // arrange as the owner
    await db.query("INSERT INTO users(name,email,password_hash) VALUES('Other','other@x.test','h')");
    const other = (await val("SELECT user_id FROM users WHERE email='other@x.test'")).user_id;
    await db.query("INSERT INTO favorites VALUES(1,2),($1,3)", [other]);
    await db.query("SET LOCAL ROLE rr_user"); // act as user 1
    const visible = (await db.query("SELECT user_id FROM favorites")).rows;
    assert.equal(visible.length, 2, "seeded favorite + the one just added");
    assert.ok(visible.every((f) => f.user_id === 1), "other users' favorites are invisible");
    await fails("INSERT INTO favorites VALUES($1,4)", "42501", [other]);
    assert.equal((await db.query("DELETE FROM favorites WHERE user_id=$1", [other])).rowCount, 0);
  }, { role: "rr_user", uid: 1 });
});

test("rr_user cannot self-promote, moderate, or read the audit log", async () => {
  await sandbox(async () => {
    await fails("UPDATE users SET role='admin' WHERE user_id=1", "42501");
    await fails("UPDATE recipes SET is_approved=true WHERE recipe_id=1", "42501");
    await fails("SELECT * FROM audit_log", "42501");
    await fails("SELECT password_hash FROM users", "42501");
    // Seed recipes were created by user 1, so user 1 may edit them...
    assert.equal((await db.query("UPDATE recipes SET title='Edited by owner' WHERE recipe_id=1")).rowCount, 1);
  }, { role: "rr_user", uid: 1 });
  await sandbox(async () => {
    // ...but user 2 may not touch them.
    assert.equal((await db.query("UPDATE recipes SET title='hijack' WHERE recipe_id=1")).rowCount, 0);
    assert.equal((await db.query("DELETE FROM recipes WHERE recipe_id=1")).rowCount, 0);
    await fails("INSERT INTO favorites VALUES(1,2)", "42501");
  }, { role: "rr_user", uid: 2 });
});

test("rr_user cannot create approved recipes or plan meals for someone else", async () => {
  await sandbox(async () => {
    await fails(
      `INSERT INTO recipes(title,instructions,servings,calories_per_serving,cuisine_id,diet_id,created_by,is_approved)
       VALUES('x','["a"]',1,100,1,1,1,true)`, "42501");
    const e = await fails("CALL sp_generate_meal_plan(2, DATE '2026-11-09', NULL)", "42501");
    assert.match(e.message, /only generate plans for yourself/);
    await fails("INSERT INTO meal_plans(user_id,plan_name,start_date,end_date) VALUES(2,'p','2026-11-01','2026-11-02')", "42501");
  }, { role: "rr_user", uid: 1 });
});

test("rr_admin can moderate recipes and manage roles; actions are audited with the actor", async () => {
  await sandbox(async () => {
    await db.query("UPDATE recipes SET is_approved=false WHERE recipe_id=1");
    assert.equal((await val("SELECT count(*)::int n FROM recipes WHERE NOT is_approved")).n, 1);
    const log = await val("SELECT actor_user_id, db_role, old_value, new_value FROM audit_log WHERE table_name='recipes'");
    assert.equal(log.actor_user_id, 2);
    assert.equal(log.new_value, "false");
    assert.equal((await db.query("SELECT user_id,email,role FROM users")).rowCount, 2);
    await fails("SELECT password_hash FROM users", "42501");
  }, { role: "rr_admin", uid: 2 });
});

test("rr_app (login role) reaches only users + sessions until it switches role", async () => {
  const app = new pg.Client({ connectionString: urlFor(dbName).replace(/\/\/[^@]*@/, "//rr_app:test-only-password@") });
  await app.connect();
  try {
    assert.equal((await app.query("SELECT count(*)::int n FROM users")).rows[0].n, 2);
    await assert.rejects(app.query("SELECT * FROM favorites"), { code: "42501" });
    await assert.rejects(app.query("UPDATE users SET role='admin'"), { code: "42501" });
    await assert.rejects(app.query("INSERT INTO users(name,email,password_hash,role) VALUES('a','a@a.aa','h','admin')"), { code: "42501" });
    await app.query("BEGIN");
    await app.query("SET LOCAL ROLE rr_guest");
    assert.equal((await app.query("SELECT count(*)::int n FROM recipes")).rows[0].n, 12);
    await app.query("ROLLBACK");
  } finally {
    await app.end();
  }
});
