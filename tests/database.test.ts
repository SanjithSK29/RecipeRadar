import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "rr-test-")),
  "test.sqlite",
);
const { db, run, one, recipes, transaction, hash, verify } =
  await import("../lib/db.ts");
test("password hashes are salted and verified", () => {
  const a = hash("test-password");
  assert.ok(verify("test-password", a));
  assert.ok(!verify("wrong-password", a));
  assert.notEqual(a, hash("test-password"));
});
test("ingredient allergen joins flag the correct recipes", () => {
  run("INSERT INTO user_allergens VALUES(1,2)");
  assert.ok(
    recipes(1).find((r) => r.title.includes("Peanut")).conflicts.length,
  );
  assert.equal(recipes(1).find((r) => r.recipe_id === 1).conflicts.length, 0);
});
test("rating constraints and aggregate triggers work", () => {
  run("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,4)");
  assert.equal(
    one("SELECT avg_rating FROM recipes WHERE recipe_id=1").avg_rating,
    4,
  );
  run("UPDATE ratings SET rating_value=5 WHERE user_id=1 AND recipe_id=1");
  assert.equal(
    one("SELECT avg_rating FROM recipes WHERE recipe_id=1").avg_rating,
    5,
  );
  assert.throws(() => run("UPDATE ratings SET rating_value=8"));
  run("DELETE FROM ratings");
  assert.equal(
    one("SELECT avg_rating FROM recipes WHERE recipe_id=1").avg_rating,
    0,
  );
});
test("foreign keys and transaction rollback preserve integrity", () => {
  assert.throws(() =>
    run("INSERT INTO favorites(user_id,recipe_id) VALUES(9999,1)"),
  );
  assert.throws(() =>
    transaction(() => {
      run("INSERT INTO cuisines(name) VALUES('Rollback cuisine')");
      throw Error("fail");
    }),
  );
  assert.equal(
    one("SELECT * FROM cuisines WHERE name='Rollback cuisine'"),
    undefined,
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

// Every test below writes through raw SQL: no frontend/API validation can mask a gap.
function isolated(fn: () => void) {
  db.exec("SAVEPOINT audit_test");
  try {
    fn();
  } finally {
    db.exec("ROLLBACK TO audit_test; RELEASE audit_test;");
  }
}
const planId = Number(
  run(
    "INSERT INTO meal_plans(user_id,plan_name,start_date,end_date) VALUES(1,'Audit week','2026-11-02','2026-11-08')",
  ).lastInsertRowid,
);

test("all application tables are STRICT and database integrity is clean", () => {
  const tables = db
    .prepare("PRAGMA table_list")
    .all()
    .filter((t) => !String(t.name).startsWith("sqlite_") && t.type === "table");
  assert.equal(tables.length, 17);
  assert.ok(tables.every((t) => t.strict === 1));
  assert.deepEqual(
    db
      .prepare("PRAGMA integrity_check")
      .all()
      .map((r) => r.integrity_check),
    ["ok"],
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
const joins: [string, string[], any[]][] = [
  ["user_allergens", ["user_id", "allergen_id"], [1, 1]],
  ["ingredient_allergens", ["ingredient_id", "allergen_id"], [1, 1]],
  [
    "recipe_ingredients",
    ["recipe_id", "ingredient_id", "quantity", "unit"],
    [1, 17, 100, "g"],
  ],
  ["ratings", ["user_id", "recipe_id", "rating_value"], [1, 2, 4]],
  ["favorites", ["user_id", "recipe_id"], [1, 2]],
  [
    "meal_plan_recipes",
    ["plan_id", "recipe_id", "meal_date", "meal_type", "servings_planned"],
    [planId, 1, "2026-11-02", "Lunch", 1],
  ],
  [
    "substitutions",
    ["ingredient_id_from", "ingredient_id_to", "similarity_score"],
    [1, 2, 0.8],
  ],
];
for (const [table, columns, values] of joins) {
  const keys = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((c) => Number(c.pk) > 0)
    .map((c) => c.name);
  for (const key of keys)
    test(`${table}.${key} cannot be NULL`, () =>
      isolated(() => {
        const args = [...values];
        args[columns.indexOf(String(key))] = null;
        assert.throws(() =>
          run(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
            ...args,
          ),
        );
      }));
}
for (const [label, sql, args] of [
  ["blank user name", "UPDATE users SET name='   ' WHERE user_id=1", []],
  [
    "oversize recipe title",
    "UPDATE recipes SET title=? WHERE recipe_id=1",
    ["x".repeat(201)],
  ],
  ["invalid boolean", "UPDATE recipes SET is_approved=2 WHERE recipe_id=1", []],
  [
    "fractional integer rating",
    "INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,2,3.5)",
    [],
  ],
  [
    "fractional prep time",
    "UPDATE recipes SET prep_time_minutes=1.5 WHERE recipe_id=1",
    [],
  ],
  [
    "negative nutrition",
    "UPDATE recipes SET protein_g=-1 WHERE recipe_id=1",
    [],
  ],
  [
    "missing calories",
    "UPDATE recipes SET calories_per_serving=NULL WHERE recipe_id=1",
    [],
  ],
  [
    "zero quantity",
    "UPDATE recipe_ingredients SET quantity=0 WHERE recipe_id=1",
    [],
  ],
  [
    "excess precision",
    "UPDATE recipe_ingredients SET quantity=1.123 WHERE recipe_id=1",
    [],
  ],
  [
    "missing unit",
    "UPDATE recipe_ingredients SET unit=NULL WHERE recipe_id=1",
    [],
  ],
  [
    "invalid instructions JSON",
    "UPDATE recipes SET instructions='not json' WHERE recipe_id=1",
    [],
  ],
  [
    "empty instruction array",
    "UPDATE recipes SET instructions='[]' WHERE recipe_id=1",
    [],
  ],
  [
    "nontext instruction step",
    "UPDATE recipes SET instructions='[null]' WHERE recipe_id=1",
    [],
  ],
  [
    "blank instruction step",
    `UPDATE recipes SET instructions='["   "]' WHERE recipe_id=1`,
    [],
  ],
  ["invalid age", "UPDATE users SET age=-2 WHERE user_id=1", []],
  ["self substitution", "INSERT INTO substitutions VALUES(1,1,.9)", []],
  ["invalid similarity score", "INSERT INTO substitutions VALUES(1,2,1.1)", []],
  [
    "reversed plan range",
    "UPDATE meal_plans SET end_date='2026-10-31' WHERE plan_id=?",
    [planId],
  ],
  [
    "nonexistent date",
    "UPDATE meal_plans SET start_date='2026-02-30' WHERE plan_id=?",
    [planId],
  ],
  [
    "malformed date",
    "UPDATE meal_plans SET start_date='Nov 2' WHERE plan_id=?",
    [planId],
  ],
  [
    "out-of-plan meal",
    "INSERT INTO meal_plan_recipes VALUES(?,1,'2026-11-09','Lunch',1)",
    [planId],
  ],
  [
    "null plan recipe",
    "INSERT INTO meal_plan_recipes VALUES(?,NULL,'2026-11-02','Lunch',1)",
    [planId],
  ],
  ["invalid token", "INSERT INTO sessions VALUES('bad-token',1,123)", []],
] as [string, string, any[]][])
  test(`database rejects ${label}`, () =>
    isolated(() => assert.throws(() => run(sql, ...args))));

test("email uniqueness ignores letter case", () =>
  isolated(() =>
    assert.throws(() =>
      run(
        "INSERT INTO users(name,email,password_hash) VALUES('Duplicate','DEMO@RECIPERADAR.APP','hash')",
      ),
    ),
  ));
test("rating reassignment updates BOTH recipe averages", () =>
  isolated(() => {
    run("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,4)");
    run("UPDATE ratings SET recipe_id=2 WHERE user_id=1 AND recipe_id=1");
    assert.equal(
      one("SELECT avg_rating FROM recipes WHERE recipe_id=1").avg_rating,
      0,
    );
    assert.equal(
      one("SELECT avg_rating FROM recipes WHERE recipe_id=2").avg_rating,
      4,
    );
  }));
test("average rating is rounded and cannot be forged", () =>
  isolated(() => {
    const u = Number(
      run(
        "INSERT INTO users(name,email,password_hash) VALUES('Rating test','rating@example.test','hash')",
      ).lastInsertRowid,
    );
    run("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,4)");
    run("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(?,1,5)", u);
    assert.equal(
      one("SELECT avg_rating FROM recipes WHERE recipe_id=1").avg_rating,
      4.5,
    );
    assert.throws(() =>
      run("UPDATE recipes SET avg_rating=5 WHERE recipe_id=1"),
    );
    assert.throws(() =>
      run("INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,1,5)"),
    );
  }));
test("allergen flags track insert, move, delete and reject manual drift", () =>
  isolated(() => {
    run("INSERT INTO ingredient_allergens VALUES(1,1)");
    assert.equal(
      one("SELECT is_common_allergen FROM ingredients WHERE ingredient_id=1")
        .is_common_allergen,
      1,
    );
    assert.throws(() =>
      run("UPDATE ingredients SET is_common_allergen=0 WHERE ingredient_id=1"),
    );
    run(
      "UPDATE ingredient_allergens SET ingredient_id=2 WHERE ingredient_id=1 AND allergen_id=1",
    );
    assert.equal(
      one("SELECT is_common_allergen FROM ingredients WHERE ingredient_id=1")
        .is_common_allergen,
      0,
    );
    assert.equal(
      one("SELECT is_common_allergen FROM ingredients WHERE ingredient_id=2")
        .is_common_allergen,
      1,
    );
    run(
      "DELETE FROM ingredient_allergens WHERE ingredient_id=2 AND allergen_id=1",
    );
    assert.equal(
      one("SELECT is_common_allergen FROM ingredients WHERE ingredient_id=2")
        .is_common_allergen,
      0,
    );
  }));
test("meal slots are unique, repeated recipes on different days are valid", () =>
  isolated(() => {
    run(
      "INSERT INTO meal_plan_recipes VALUES(?,1,'2026-11-02','Lunch',1)",
      planId,
    );
    assert.throws(() =>
      run(
        "INSERT INTO meal_plan_recipes VALUES(?,2,'2026-11-02','Lunch',1)",
        planId,
      ),
    );
    run(
      "INSERT INTO meal_plan_recipes VALUES(?,1,'2026-11-03','Lunch',1)",
      planId,
    );
    assert.throws(() =>
      run(
        "UPDATE meal_plans SET start_date='2026-11-03' WHERE plan_id=?",
        planId,
      ),
    );
    assert.throws(() =>
      run(
        "UPDATE meal_plan_recipes SET meal_date='2026-11-10' WHERE plan_id=?",
        planId,
      ),
    );
    assert.throws(() => run("DELETE FROM recipes WHERE recipe_id=1"));
  }));
test("shopping and nutrition views scale whole-recipe quantities correctly", () =>
  isolated(() => {
    run(
      "INSERT INTO meal_plan_recipes VALUES(?,1,'2026-11-02','Lunch',1.5)",
      planId,
    );
    assert.equal(
      one(
        "SELECT calories FROM meal_plan_daily_nutrition WHERE plan_id=?",
        planId,
      ).calories,
      720,
    );
    assert.equal(
      one(
        "SELECT quantity FROM meal_plan_shopping_list WHERE plan_id=? AND ingredient_id=1",
        planId,
      ).quantity,
      75,
    );
  }));
test("plan deletion cascades to its meals", () =>
  isolated(() => {
    run(
      "INSERT INTO meal_plan_recipes VALUES(?,1,'2026-11-02','Lunch',1)",
      planId,
    );
    run("DELETE FROM meal_plans WHERE plan_id=?", planId);
    assert.equal(
      one("SELECT COUNT(*) n FROM meal_plan_recipes WHERE plan_id=?", planId).n,
      0,
    );
  }));
test("recipe deletion cascades its ratings, favorites and ingredients", () =>
  isolated(() => {
    const rid = Number(
      run(
        "INSERT INTO recipes(title,instructions,servings,calories_per_serving,cuisine_id,diet_id,created_by) VALUES('Cascade test','[\"Cook\"]',1,100,1,1,1)",
      ).lastInsertRowid,
    );
    run("INSERT INTO recipe_ingredients VALUES(?,1,20,'g')", rid);
    run("INSERT INTO favorites(user_id,recipe_id) VALUES(1,?)", rid);
    run(
      "INSERT INTO ratings(user_id,recipe_id,rating_value) VALUES(1,?,5)",
      rid,
    );
    run("DELETE FROM recipes WHERE recipe_id=?", rid);
    for (const t of ["recipe_ingredients", "favorites", "ratings"])
      assert.equal(
        one(`SELECT COUNT(*) n FROM ${t} WHERE recipe_id=?`, rid).n,
        0,
      );
  }));
test("lookups in use cannot be deleted", () =>
  isolated(() => {
    for (const [t, k, id] of [
      ["cuisines", "cuisine_id", 1],
      ["dietary_types", "diet_id", 1],
      ["ingredients", "ingredient_id", 1],
      ["allergens", "allergen_id", 2],
    ])
      assert.throws(() => run(`DELETE FROM ${t} WHERE ${k}=?`, id));
  }));
test("malformed stored password hash fails closed", () => {
  assert.equal(verify("test", "bad hash"), false);
});

test("all 13 tables and every attribute in the modified relational diagram are preserved", () => {
  const contract = JSON.parse(readFileSync("db/model-contract.json", "utf8"));
  assert.equal(Object.keys(contract).length, 13);
  for (const [table, expected] of Object.entries(contract)) {
    const columns = new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name),
    );
    for (const column of expected as string[])
      assert.ok(columns.has(column), `${table}.${column} missing`);
  }
});
test("every original relationship has its declared foreign key", () => {
  const edges: Record<string, [string, string, string][]> = {
    user_allergens: [
      ["user_id", "users", "user_id"],
      ["allergen_id", "allergens", "allergen_id"],
    ],
    recipes: [
      ["cuisine_id", "cuisines", "cuisine_id"],
      ["diet_id", "dietary_types", "diet_id"],
      ["created_by", "users", "user_id"],
    ],
    recipe_ingredients: [
      ["recipe_id", "recipes", "recipe_id"],
      ["ingredient_id", "ingredients", "ingredient_id"],
    ],
    ratings: [
      ["user_id", "users", "user_id"],
      ["recipe_id", "recipes", "recipe_id"],
    ],
    favorites: [
      ["user_id", "users", "user_id"],
      ["recipe_id", "recipes", "recipe_id"],
    ],
    meal_plans: [["user_id", "users", "user_id"]],
    meal_plan_recipes: [
      ["plan_id", "meal_plans", "plan_id"],
      ["recipe_id", "recipes", "recipe_id"],
    ],
    substitutions: [
      ["ingredient_id_from", "ingredients", "ingredient_id"],
      ["ingredient_id_to", "ingredients", "ingredient_id"],
    ],
  };
  for (const [table, expected] of Object.entries(edges)) {
    const actual = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    for (const [from, target, to] of expected)
      assert.ok(
        actual.some(
          (f) => f.from === from && f.table === target && f.to === to,
        ),
        `${table}.${from} -> ${target}.${to} missing`,
      );
  }
});
