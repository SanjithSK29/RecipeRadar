import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import {
  all,
  one,
  run,
  transaction,
  hash,
  verify,
  recipes,
} from "../../../lib/db";
import {
  bootstrapIndex,
  collectionInfo,
  deleteVector,
  getVector,
  recipeDocument,
  searchVector,
  syncOutbox,
} from "../../../lib/vector";
export const runtime = "nodejs";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
function user(req: NextRequest) {
  const token = req.cookies.get("rr_session")?.value;
  return token
    ? one(
        "SELECT u.* FROM sessions s JOIN users u USING(user_id) WHERE s.token=? AND s.expires_at>?",
        digest(token),
        Date.now(),
      )
    : null;
}
function safe(u: any) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return {
    ...rest,
    allergens: all(
      "SELECT allergen_id FROM user_allergens WHERE user_id=?",
      u.user_id,
    ).map((x) => x.allergen_id),
  };
}
function enqueueVector(recipeId: number, operation: "upsert" | "delete") {
  const point = operation === "upsert" ? recipeDocument(recipeId) : null;
  check(operation === "delete" || point, "Could not create recipe vector");
  run(
    `INSERT INTO vector_sync_outbox(recipe_id,operation,payload) VALUES(?,?,?)
     ON CONFLICT(recipe_id,operation) DO UPDATE SET payload=excluded.payload,attempts=0,last_error=NULL,created_at=CURRENT_TIMESTAMP`,
    recipeId,
    operation,
    point ? JSON.stringify(point) : null,
  );
}
function requireAdmin(u: any) {
  check(u?.role === "admin", "Administrator permission required");
}
function check(ok: any, message: string) {
  if (!ok) throw new Error(message);
}
function integer(v: any, min: number, max: number) {
  return Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
}
async function handle(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace("/api/", "");
    const u = user(req);
    const id = u?.user_id;
    if (req.method === "GET") {
      if (path === "bootstrap")
        return NextResponse.json({
          user: safe(u),
          recipes: recipes(id, !!id),
          allergens: all("SELECT * FROM allergens"),
          ingredients: all("SELECT * FROM ingredients"),
          cuisines: all("SELECT * FROM cuisines"),
          diets: all("SELECT * FROM dietary_types"),
        });
      if (path === "plans") {
        check(u, "Sign in to view your plans");
        return NextResponse.json(
          all(
            "SELECT * FROM meal_plans WHERE user_id=? ORDER BY plan_id DESC",
            id,
          ).map((p) => ({
            ...p,
            meals: all(
              "SELECT m.*,r.title,r.calories_per_serving,r.image FROM meal_plan_recipes m JOIN recipes r USING(recipe_id) WHERE plan_id=? ORDER BY meal_date,CASE m.meal_type WHEN 'Breakfast' THEN 1 WHEN 'Lunch' THEN 2 ELSE 3 END",
              p.plan_id,
            ),
          })),
        );
      }
      if (path === "admin/recipes") {
        requireAdmin(u);
        return NextResponse.json({
          pending: all(
            "SELECT r.*,u.name creator,c.name cuisine,d.name diet FROM recipes r JOIN users u ON u.user_id=r.created_by JOIN cuisines c USING(cuisine_id) JOIN dietary_types d USING(diet_id) WHERE is_approved=0 ORDER BY created_at",
          ),
          users: all(
            "SELECT user_id,name,email,role,created_at FROM users ORDER BY user_id",
          ),
        });
      }
      if (path === "vector") {
        check(u, "Sign in to use flavor search");
        await syncOutbox();
        const indexed = await bootstrapIndex();
        await syncOutbox();
        const info = await collectionInfo();
        return NextResponse.json({
          backend: info.backend,
          collection: info.result?.status,
          vectors: info.result?.points_count ?? 0,
          pending: Number(one("SELECT COUNT(*) n FROM vector_sync_outbox").n),
          indexed,
        });
      }
      if (path === "substitutions")
        return NextResponse.json(
          all(
            "SELECT s.*,a.name original,b.name replacement FROM substitutions s JOIN ingredients a ON a.ingredient_id=s.ingredient_id_from JOIN ingredients b ON b.ingredient_id=s.ingredient_id_to",
          ).map((s) => ({
            ...s,
            conflicts: id
              ? all(
                  "SELECT a.name FROM ingredient_allergens ia JOIN user_allergens ua USING(allergen_id) JOIN allergens a USING(allergen_id) WHERE ia.ingredient_id=? AND ua.user_id=?",
                  s.ingredient_id_to,
                  id,
                )
              : [],
          })),
        );
      if (path.startsWith("reviews/"))
        return NextResponse.json(
          all(
            "SELECT r.rating_value,r.review_text,r.created_at,u.name FROM ratings r JOIN users u USING(user_id) WHERE recipe_id=? ORDER BY r.created_at DESC",
            Number(path.split("/")[1]),
          ),
        );
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host"))
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
    const b = await req.json();
    if (path === "auth") {
      if (b.mode === "logout") {
        const token = req.cookies.get("rr_session")?.value;
        if (token) run("DELETE FROM sessions WHERE token=?", digest(token));
        const r = NextResponse.json({ ok: true });
        r.cookies.delete("rr_session");
        return r;
      }
      check(
        typeof b.email === "string" && typeof b.password === "string",
        "Email and password are required",
      );
      const email = b.email.trim().toLowerCase();
      check(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255,
        "Enter a valid email",
      );
      check(
        b.password.length >= 8 && b.password.length <= 128,
        "Use a password of 8–128 characters",
      );
      if (b.mode === "register") {
        check(
          typeof b.name === "string" &&
            b.name.trim().length > 0 &&
            b.name.length <= 100,
          "Enter your name",
        );
        check(
          !one("SELECT 1 FROM users WHERE email=?", email),
          "This email is already registered",
        );
        run(
          "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
          b.name.trim(),
          email,
          hash(b.password),
        );
      }
      const account = one("SELECT * FROM users WHERE email=?", email);
      check(
        account && verify(b.password, account.password_hash),
        "Incorrect email or password",
      );
      const token = randomBytes(32).toString("hex");
      run("DELETE FROM sessions WHERE expires_at<?", Date.now());
      run(
        "INSERT INTO sessions VALUES(?,?,?)",
        digest(token),
        account.user_id,
        Date.now() + 7 * 86400000,
      );
      const r = NextResponse.json({ user: safe(account) });
      r.cookies.set("rr_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 604800,
      });
      return r;
    }
    check(u, "Sign in to continue");
    if (path === "admin/review") {
      requireAdmin(u);
      check(integer(b.recipe_id, 1, Number.MAX_SAFE_INTEGER), "Invalid recipe");
      check(typeof b.approved === "boolean", "Approval must be true or false");
      check(
        one("SELECT 1 FROM recipes WHERE recipe_id=?", b.recipe_id),
        "Recipe not found",
      );
      transaction(() => {
        run(
          "UPDATE recipes SET is_approved=? WHERE recipe_id=?",
          b.approved ? 1 : 0,
          b.recipe_id,
        );
        enqueueVector(b.recipe_id, b.approved ? "upsert" : "delete");
      });
      await syncOutbox();
      return NextResponse.json({ ok: true });
    }
    if (path === "admin/role") {
      requireAdmin(u);
      check(integer(b.user_id, 1, Number.MAX_SAFE_INTEGER), "Invalid user");
      check(["user", "admin"].includes(b.role), "Role must be user or admin");
      check(
        one("SELECT 1 FROM users WHERE user_id=?", b.user_id),
        "User not found",
      );
      if (
        b.role === "user" &&
        one("SELECT role FROM users WHERE user_id=?", b.user_id)?.role ===
          "admin"
      )
        check(
          Number(one("SELECT COUNT(*) n FROM users WHERE role='admin'").n) > 1,
          "Cannot remove the last administrator",
        );
      run("UPDATE users SET role=? WHERE user_id=?", b.role, b.user_id);
      return NextResponse.json({ ok: true });
    }
    if (path === "vector") {
      const action = b.action;
      if (action === "search") {
        check(
          typeof b.query === "string" &&
            b.query.trim().length >= 2 &&
            b.query.length <= 300,
          "Enter a search of 2–300 characters",
        );
        await bootstrapIndex();
        const response: any = await searchVector(
          b.query.trim(),
          Math.min(Math.max(Number(b.limit) || 8, 1), 20),
        );
        const ids = (response.result || [])
          .map((hit: any) => Number(hit.id))
          .filter(Number.isSafeInteger);
        const visible = ids
          .map((rid: number) => ({
            recipe: recipes(id, true).find((r) => r.recipe_id === rid),
            score: response.result.find((hit: any) => Number(hit.id) === rid)
              ?.score,
          }))
          .filter(
            (item: any) =>
              item.recipe &&
              (item.recipe.is_approved || item.recipe.created_by === id),
          );
        return NextResponse.json({ results: visible });
      }
      check(integer(b.recipe_id, 1, Number.MAX_SAFE_INTEGER), "Invalid recipe");
      const recipe = one(
        "SELECT recipe_id,created_by,is_approved FROM recipes WHERE recipe_id=?",
        b.recipe_id,
      );
      check(recipe, "Recipe not found");
      check(
        u.role === "admin" || recipe.created_by === id,
        "You can only manage vectors for your recipes",
      );
      if (action === "read")
        return NextResponse.json(await getVector(Number(b.recipe_id)));
      if (action === "upsert") {
        check(recipe.is_approved, "Only approved recipes are indexed");
        await bootstrapIndex();
        await syncOutbox();
        return NextResponse.json({
          ok: true,
          vector: await getVector(Number(b.recipe_id)),
        });
      }
      if (action === "delete") {
        check(
          !one(
            "SELECT 1 FROM meal_plan_recipes WHERE recipe_id=?",
            b.recipe_id,
          ),
          "Remove this recipe from meal plans before deleting it",
        );
        transaction(() => {
          enqueueVector(Number(b.recipe_id), "delete");
          run("DELETE FROM recipes WHERE recipe_id=?", b.recipe_id);
        });
        await syncOutbox();
        return NextResponse.json({ ok: true });
      }
      throw new Error("Action must be search, read, upsert, or delete");
    }
    if (path === "profile") {
      check(
        typeof b.name === "string" &&
          b.name.trim().length > 0 &&
          b.name.length <= 100,
        "Enter a valid name",
      );
      check(
        integer(b.daily_calorie_target, 800, 6000),
        "Calorie target must be 800–6000",
      );
      check(
        ["Balanced", "Vegan", "Vegetarian", "High protein"].includes(
          b.diet_goal,
        ),
        "Choose a valid diet",
      );
      check(
        Array.isArray(b.allergens) &&
          b.allergens.every(
            (a: any) =>
              Number.isInteger(Number(a)) &&
              one("SELECT 1 FROM allergens WHERE allergen_id=?", Number(a)),
          ),
        "Invalid allergens",
      );
      transaction(() => {
        run(
          "UPDATE users SET name=?,diet_goal=?,daily_calorie_target=? WHERE user_id=?",
          b.name.trim(),
          b.diet_goal,
          Number(b.daily_calorie_target),
          id,
        );
        run("DELETE FROM user_allergens WHERE user_id=?", id);
        [...new Set(b.allergens)].forEach((a) =>
          run("INSERT INTO user_allergens VALUES(?,?)", id, Number(a)),
        );
      });
    } else if (path === "favorite") {
      check(
        one(
          "SELECT 1 FROM recipes WHERE recipe_id=? AND (is_approved=1 OR created_by=?)",
          b.recipe_id,
          id,
        ),
        "Recipe not found",
      );
      if (
        one(
          "SELECT 1 FROM favorites WHERE user_id=? AND recipe_id=?",
          id,
          b.recipe_id,
        )
      )
        run(
          "DELETE FROM favorites WHERE user_id=? AND recipe_id=?",
          id,
          b.recipe_id,
        );
      else
        run(
          "INSERT INTO favorites(user_id,recipe_id) VALUES(?,?)",
          id,
          b.recipe_id,
        );
    } else if (path === "rating") {
      check(integer(b.rating, 1, 5), "Choose a rating from 1 to 5");
      check(
        typeof b.review === "string" && b.review.length <= 2000,
        "Review is too long",
      );
      check(
        one(
          "SELECT 1 FROM recipes WHERE recipe_id=? AND is_approved=1",
          b.recipe_id,
        ),
        "Recipe not found",
      );
      run(
        "INSERT INTO ratings(user_id,recipe_id,rating_value,review_text) VALUES(?,?,?,?) ON CONFLICT(user_id,recipe_id) DO UPDATE SET rating_value=excluded.rating_value,review_text=excluded.review_text,created_at=CURRENT_TIMESTAMP",
        id,
        b.recipe_id,
        Number(b.rating),
        b.review,
      );
    } else if (path === "recipe") {
      check(
        typeof b.title === "string" &&
          b.title.trim().length > 0 &&
          b.title.length <= 200,
        "Enter a recipe title",
      );
      check(
        typeof b.description === "string" && b.description.length <= 2000,
        "Description is too long",
      );
      check(
        Array.isArray(b.instructions) &&
          b.instructions.length > 0 &&
          b.instructions.every(
            (s: any) =>
              typeof s === "string" && s.trim().length > 0 && s.length < 2000,
          ),
        "Add cooking instructions",
      );
      for (const k of [
        "prep_time_minutes",
        "cook_time_minutes",
        "protein_g",
        "carbs_g",
        "fat_g",
      ])
        check(
          Number.isFinite(Number(b[k])) &&
            Number(b[k]) >= 0 &&
            Number(b[k]) <= 2000,
          "Invalid " + k,
        );
      check(
        integer(b.servings, 1, 50) && integer(b.calories_per_serving, 1, 5000),
        "Invalid servings or calories",
      );
      check(
        one(
          "SELECT 1 FROM cuisines WHERE cuisine_id=?",
          Number(b.cuisine_id),
        ) &&
          one("SELECT 1 FROM dietary_types WHERE diet_id=?", Number(b.diet_id)),
        "Invalid cuisine or diet",
      );
      check(
        ["Breakfast", "Lunch", "Dinner"].includes(b.meal_type),
        "Invalid meal type",
      );
      check(
        Array.isArray(b.ingredients) &&
          b.ingredients.length > 0 &&
          b.ingredients.every(
            (i: any) =>
              one(
                "SELECT 1 FROM ingredients WHERE ingredient_id=?",
                Number(i.ingredient_id),
              ) &&
              Number(i.quantity) > 0 &&
              Number(i.quantity) < 100000,
          ),
        "Add valid ingredients",
      );
      transaction(() => {
        let rid = b.recipe_id;
        if (rid) {
          check(
            one(
              "SELECT 1 FROM recipes WHERE recipe_id=? AND created_by=?",
              rid,
              id,
            ),
            "You can only edit your recipes",
          );
          run("DELETE FROM recipe_ingredients WHERE recipe_id=?", rid);
          run(
            "UPDATE recipes SET title=?,description=?,instructions=?,prep_time_minutes=?,cook_time_minutes=?,servings=?,calories_per_serving=?,protein_g=?,carbs_g=?,fat_g=?,cuisine_id=?,diet_id=?,meal_type=? WHERE recipe_id=?",
            b.title,
            b.description,
            JSON.stringify(b.instructions),
            ...[
              "prep_time_minutes",
              "cook_time_minutes",
              "servings",
              "calories_per_serving",
              "protein_g",
              "carbs_g",
              "fat_g",
              "cuisine_id",
              "diet_id",
            ].map((k) => Number(b[k])),
            b.meal_type,
            rid,
          );
        } else
          rid = Number(
            run(
              "INSERT INTO recipes(title,description,instructions,prep_time_minutes,cook_time_minutes,servings,calories_per_serving,protein_g,carbs_g,fat_g,cuisine_id,diet_id,created_by,is_approved,meal_type,image,flavor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              b.title,
              b.description,
              JSON.stringify(b.instructions),
              ...[
                "prep_time_minutes",
                "cook_time_minutes",
                "servings",
                "calories_per_serving",
                "protein_g",
                "carbs_g",
                "fat_g",
                "cuisine_id",
                "diet_id",
              ].map((k) => Number(b[k])),
              id,
              0,
              b.meal_type,
              "",
              "savory",
            ).lastInsertRowid,
          );
        for (const i of b.ingredients)
          run(
            "INSERT INTO recipe_ingredients VALUES(?,?,?,?)",
            rid,
            Number(i.ingredient_id),
            Number(i.quantity),
            "g",
          );
        if (
          one("SELECT is_approved FROM recipes WHERE recipe_id=?", rid)
            ?.is_approved
        )
          enqueueVector(Number(rid), "upsert");
      });
    } else if (path === "recipe-delete") {
      check(
        one(
          "SELECT 1 FROM recipes WHERE recipe_id=? AND created_by=?",
          b.recipe_id,
          id,
        ),
        "You can only delete your recipes",
      );
      check(
        !one("SELECT 1 FROM meal_plan_recipes WHERE recipe_id=?", b.recipe_id),
        "This recipe is used in a meal plan. Remove it from plans first.",
      );
      transaction(() => {
        if (
          one("SELECT is_approved FROM recipes WHERE recipe_id=?", b.recipe_id)
            ?.is_approved
        )
          enqueueVector(Number(b.recipe_id), "delete");
        run("DELETE FROM recipes WHERE recipe_id=?", b.recipe_id);
      });
      await syncOutbox();
    } else if (path === "plan-delete") {
      run(
        "DELETE FROM meal_plans WHERE plan_id=? AND user_id=?",
        b.plan_id,
        id,
      );
    } else if (path === "plan") {
      check(
        typeof b.start_date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(b.start_date) &&
          !isNaN(Date.parse(b.start_date)) &&
          new Date(b.start_date + "T12:00:00Z").toISOString().slice(0, 10) ===
            b.start_date,
        "Choose a valid start date",
      );
      const list = recipes(id).filter(
        (r) =>
          !r.conflicts.length &&
          (u.diet_goal === "Balanced" || r.diet === u.diet_goal),
      );
      check(
        ["Breakfast", "Lunch", "Dinner"].every((t) =>
          list.some((r) => r.meal_type === t),
        ),
        "Not enough recipes match your diet and allergens for all three meals. Add matching recipes or adjust your profile.",
      );
      transaction(() => {
        const end = new Date(b.start_date + "T12:00:00Z");
        end.setUTCDate(end.getUTCDate() + 6);
        const pid = Number(
          run(
            "INSERT INTO meal_plans(user_id,plan_name,start_date,end_date) VALUES(?,?,?,?)",
            id,
            "Your feel-good week",
            b.start_date,
            end.toISOString().slice(0, 10),
          ).lastInsertRowid,
        );
        for (let d = 0; d < 7; d++) {
          const date = new Date(b.start_date + "T12:00:00Z");
          date.setUTCDate(date.getUTCDate() + d);
          for (const type of ["Breakfast", "Lunch", "Dinner"]) {
            const candidates = list
              .filter((r) => r.meal_type === type)
              .sort(
                (a, b) =>
                  Math.abs(
                    a.calories_per_serving - u.daily_calorie_target / 3,
                  ) -
                  Math.abs(b.calories_per_serving - u.daily_calorie_target / 3),
              );
            const r = candidates[d % Math.min(candidates.length, 3)];
            const servings =
              Math.round(
                (u.daily_calorie_target / 3 / r.calories_per_serving) * 100,
              ) / 100;
            run(
              "INSERT INTO meal_plan_recipes VALUES(?,?,?,?,?)",
              pid,
              r.recipe_id,
              date.toISOString().slice(0, 10),
              type,
              servings,
            );
          }
        }
      });
    } else return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
