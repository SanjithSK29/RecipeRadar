// HTTP-level checks for roles, moderation, vector search/RUD and full-text search.
// Requires a running app with the demo accounts (npm run db:setup && npm run dev).
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://localhost:3000";
function client() {
  let cookie = "";
  return async (path, body) => {
    const r = await fetch(base + "/api/" + path, {
      method: body ? "POST" : "GET",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), Cookie: cookie, Origin: base },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const c = r.headers.get("set-cookie");
    if (c) cookie = c.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
}
const admin = client();
const user = client();
const guest = client();
const stamp = Date.now();

// --- guest: read-only
assert.equal((await guest("bootstrap")).status, 200);
assert.equal((await guest("admin/recipes")).status, 400, "guest must not reach admin data");
assert.equal((await guest("favorite", { recipe_id: 1 })).status, 400, "guest cannot write");

// --- full-text search (tsvector + GIN) works for anonymous visitors
const fts = await guest("search?q=creamy%20coconut");
assert.equal(fts.status, 200);
assert.ok(fts.data.some((r) => r.title.includes("coconut")), "full-text search ranks matching recipes");
assert.ok(fts.data[0].rank > 0);

// --- sign in as admin and as a fresh user
assert.equal((await admin("auth", { mode: "login", email: "admin@reciperadar.app", password: process.env.SEED_ADMIN_PASSWORD || "AdminRadar123!" })).status, 200);
const email = `rbac-${stamp}@example.test`;
assert.equal((await user("auth", { mode: "register", name: "Role Test", email, password: "TestPassword123!" })).status, 200);
assert.equal((await user("bootstrap")).data.user.role, "user", "registration always creates a plain user");

// --- a plain user cannot use admin endpoints (application check AND database grants)
assert.equal((await user("admin/recipes")).status, 400);
const self = (await user("bootstrap")).data.user.user_id;
assert.equal((await user("admin/role", { user_id: self, role: "admin" })).status, 400);
assert.equal((await user("bootstrap")).data.user.role, "user");

// --- moderation: user submits, stays hidden until the admin approves
const ing = (await user("bootstrap")).data.ingredients[0].ingredient_id;
const draft = {
  title: `RBAC test dish ${stamp}`, description: "Pending review", instructions: ["Mix", "Serve"],
  prep_time_minutes: 5, cook_time_minutes: 5, servings: 2, calories_per_serving: 300,
  protein_g: 10, carbs_g: 30, fat_g: 8, cuisine_id: 1, diet_id: 1, meal_type: "Lunch",
  ingredients: [{ ingredient_id: ing, quantity: 100 }],
};
assert.equal((await user("recipe", draft)).status, 200);
const mine = (await user("bootstrap")).data.recipes.find((r) => r.title === draft.title);
assert.ok(mine && !mine.is_approved, "new recipes start unapproved");
assert.ok(!(await guest("bootstrap")).data.recipes.some((r) => r.recipe_id === mine.recipe_id), "drafts are invisible to others");
const pending = await admin("admin/recipes");
assert.ok(pending.data.pending.some((r) => r.recipe_id === mine.recipe_id));
assert.equal((await user("admin/review", { recipe_id: mine.recipe_id, approved: true })).status, 400, "user cannot approve");
assert.equal((await admin("admin/review", { recipe_id: mine.recipe_id, approved: true })).status, 200);
assert.ok((await guest("bootstrap")).data.recipes.some((r) => r.recipe_id === mine.recipe_id), "approved recipes become public");
assert.ok((await admin("admin/recipes")).data.audit.some((a) => a.table_name === "recipes" && a.record_id === mine.recipe_id), "moderation is audited");

// --- vector search and read/update/delete
const hits = await user("vector", { action: "search", query: "creamy bright avocado", limit: 5 });
assert.equal(hits.status, 200);
assert.ok(hits.data.results.length > 0 && hits.data.results[0].score >= hits.data.results.at(-1).score);
const vec = await user("vector", { action: "read", recipe_id: mine.recipe_id });
assert.equal(vec.data.result.vector.length, 128);
assert.equal((await user("vector", { action: "upsert", recipe_id: mine.recipe_id })).status, 200);
assert.equal((await user("vector", { action: "read", recipe_id: 1 })).status, 400, "cannot manage others' vectors");
assert.equal((await user("vector", { action: "delete", recipe_id: mine.recipe_id })).status, 200);
assert.equal((await user("vector", { action: "read", recipe_id: mine.recipe_id })).status, 400, "deleted vector is gone");

// --- the last administrator cannot be demoted (database trigger)
const adminId = (await admin("bootstrap")).data.user.user_id;
const demote = await admin("admin/role", { user_id: adminId, role: "user" });
assert.equal(demote.status, 400);
assert.match(demote.data.error, /last administrator/);
console.log("RBAC smoke passed: guest/user/admin roles, moderation + audit, vector RUD, full-text search, last-admin rule.");
