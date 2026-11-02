import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://localhost:3000";
let cookie = "";
async function call(path, body) {
  const r = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
      Origin: base,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const c = r.headers.get("set-cookie");
  if (c) cookie = c.split(";")[0];
  const data = await r.json();
  return { status: r.status, data };
}
const boot = await call("bootstrap");
assert.equal(boot.status, 200);
assert.equal(boot.data.recipes.length >= 12, true);
assert.equal((await call("plans")).status, 400);
const email = `test-${Date.now()}@example.test`;
assert.equal(
  (
    await call("auth", {
      mode: "register",
      name: "API Test",
      email,
      password: "TestPassword123!",
    })
  ).status,
  200,
);
assert.equal(
  (
    await call("profile", {
      name: "API Test",
      diet_goal: "Balanced",
      daily_calorie_target: 2100,
      allergens: [2],
    })
  ).status,
  200,
);
let b = (await call("bootstrap")).data;
assert.ok(b.recipes.find((r) => r.title.includes("Peanut")).conflicts.length);
assert.equal((await call("favorite", { recipe_id: 1 })).status, 200);
assert.ok((await call("bootstrap")).data.recipes[0].favorite);
assert.equal(
  (
    await call("rating", {
      recipe_id: 1,
      rating: 5,
      review: "Integration test review",
    })
  ).status,
  200,
);
assert.equal(
  (await call("rating", { recipe_id: 1, rating: 6, review: "" })).status,
  400,
);
assert.equal((await call("recipe-delete", { recipe_id: 1 })).status, 400);
assert.equal((await call("plan", { start_date: "2026-11-02" })).status, 200);
const plans = (await call("plans")).data;
assert.equal(plans[0].meals.length, 21);
for (const m of plans[0].meals) {
  assert.equal(
    b.recipes.find((r) => r.recipe_id === m.recipe_id).conflicts.length,
    0,
  );
}
for (const date of new Set(plans[0].meals.map((m) => m.meal_date))) {
  const kcal = plans[0].meals
    .filter((m) => m.meal_date === date)
    .reduce((s, m) => s + m.calories_per_serving * m.servings_planned, 0);
  assert.ok(Math.abs(kcal - 2100) < 15);
}
const recipe = {
  title: "API test bowl",
  description: "Test",
  instructions: ["Cook and serve"],
  prep_time_minutes: 10,
  cook_time_minutes: 15,
  servings: 2,
  calories_per_serving: 450,
  protein_g: 20,
  carbs_g: 40,
  fat_g: 10,
  cuisine_id: 1,
  diet_id: 1,
  meal_type: "Lunch",
  ingredients: [{ ingredient_id: 1, quantity: 200 }],
};
assert.equal((await call("recipe", recipe)).status, 200);
b = (await call("bootstrap")).data;
let r = b.recipes.find((r) => r.title === recipe.title);
assert.ok(r);
assert.equal(
  (
    await call("recipe", {
      ...recipe,
      recipe_id: r.recipe_id,
      title: "Updated test bowl",
    })
  ).status,
  200,
);
assert.equal(
  (await call("recipe-delete", { recipe_id: r.recipe_id })).status,
  200,
);
assert.equal(
  (await call("plan-delete", { plan_id: plans[0].plan_id })).status,
  200,
);
assert.equal((await call("auth", { mode: "logout" })).status, 200);
assert.equal((await call("plans")).status, 400);
assert.equal(
  (await call("auth", { mode: "login", email, password: "wrong-pass" })).status,
  400,
);
console.log(
  "API smoke passed: accounts, sessions, ownership, favorites, rating validation, allergen-aware planning, calorie totals, recipe CRUD and plan deletion.",
);
