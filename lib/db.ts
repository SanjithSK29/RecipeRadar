import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { migrate } from "./migrations.ts";
export function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verify(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!/^[0-9a-f]{32}$/.test(salt || "") || !/^[0-9a-f]{128}$/.test(key || ""))
    return false;
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
const filename =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data/reciperadar.sqlite");
if (filename !== ":memory:")
  mkdirSync(path.dirname(filename), { recursive: true });
export const db = new DatabaseSync(filename);
db.exec(
  "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON;",
);
db.function("reciperadar_portion_calories", (calories, portions) => {
  const c = Number(calories),
    p = Number(portions);
  return Number.isFinite(c) && Number.isFinite(p) && p >= 0
    ? Math.round(c * p * 100) / 100
    : null;
});
db.function("reciperadar_flavor_similarity", (left, right) => {
  const a = new Set(
    String(left ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const b = new Set(
    String(right ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const u = new Set([...a, ...b]);
  return u.size
    ? Math.round(([...a].filter((x) => b.has(x)).length / u.size) * 10000) /
        10000
    : 0;
});
migrate(db, filename);
export const all = (sql: string, ...args: any[]) =>
  db.prepare(sql).all(...args) as any[];
export const one = (sql: string, ...args: any[]) =>
  db.prepare(sql).get(...args) as any;
export const run = (sql: string, ...args: any[]) =>
  db.prepare(sql).run(...args);
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
if (
  !one("SELECT user_id FROM users LIMIT 1") &&
  !one("SELECT cuisine_id FROM cuisines LIMIT 1") &&
  !one("SELECT ingredient_id FROM ingredients LIMIT 1")
) {
  transaction(() => {
    run(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      "Alex Morgan",
      "demo@reciperadar.app",
      hash("RecipeRadar123!"),
      "user",
    );
    run(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      "RecipeRadar Admin",
      "admin@reciperadar.app",
      hash("AdminRadar123!"),
      "admin",
    );
    for (const n of [
      "Milk",
      "Peanuts",
      "Tree nuts",
      "Wheat",
      "Soy",
      "Eggs",
      "Sesame",
      "Fish",
      "Shellfish",
    ])
      run("INSERT INTO allergens(name) VALUES(?)", n);
    for (const n of [
      "Mediterranean",
      "Indian",
      "Asian",
      "Italian",
      "Mexican",
      "International",
    ])
      run("INSERT INTO cuisines(name) VALUES(?)", n);
    for (const n of ["Vegan", "Vegetarian", "High protein", "Balanced"])
      run("INSERT INTO dietary_types(name) VALUES(?)", n);
    const ingredients: [string, string, number[]][] = [
      ["Chickpeas", "earthy", []],
      ["Quinoa", "nutty", []],
      ["Tomato", "bright", []],
      ["Spinach", "earthy", []],
      ["Chicken", "savory", []],
      ["Rice", "mild", []],
      ["Peanut butter", "nutty", [2]],
      ["Tofu", "mild", [5]],
      ["Yogurt", "tangy", [1]],
      ["Oats", "earthy", []],
      ["Banana", "sweet", []],
      ["Pasta", "mild", [4]],
      ["Feta", "tangy", [1]],
      ["Avocado", "creamy", []],
      ["Lentils", "earthy", []],
      ["Coconut milk", "creamy", []],
      ["Sunflower butter", "nutty", []],
      ["Coconut yogurt", "tangy", []],
      ["Rice noodles", "mild", []],
      ["Egg", "savory", [6]],
      ["Broccoli", "earthy", []],
      ["Salmon", "savory", [8]],
      ["Sesame", "nutty", [7]],
      ["Almond", "nutty", [3]],
      ["Shrimp", "savory", [9]],
    ];
    ingredients.forEach(([n, f, a]) => {
      const id = Number(
        run(
          "INSERT INTO ingredients(name,flavor,category,is_common_allergen) VALUES(?,?,?,?)",
          n,
          f,
          "Whole foods",
          0,
        ).lastInsertRowid,
      );
      a.forEach((x) =>
        run("INSERT INTO ingredient_allergens VALUES(?,?)", id, x),
      );
    });
    const recipes: any[] = [
      [
        "Mediterranean sunshine bowl",
        "A little sunshine, a lot of goodness. Roasted chickpeas, fluffy quinoa and a bright tomato finish.",
        1,
        1,
        480,
        19,
        62,
        17,
        "Lunch",
        "earthy bright",
        [1, 2, 3, 4],
        "1540420773420-3366772f4999",
      ],
      [
        "Creamy coconut lentil curry",
        "Comfort in a bowl, with warming spices and slow-simmered lentils.",
        2,
        1,
        520,
        23,
        69,
        16,
        "Dinner",
        "creamy earthy",
        [15, 16, 3, 6],
        "1603894584373-5ac82b2ae398",
      ],
      [
        "Green goddess avocado plate",
        "Your morning greens, reimagined with creamy avocado and a soft egg.",
        6,
        2,
        360,
        16,
        32,
        19,
        "Breakfast",
        "creamy bright",
        [14, 20, 4],
        "1525351484163-7529414344d8",
      ],
      [
        "Peanut tofu crunch bowl",
        "Golden tofu, crisp broccoli and a rich, nutty peanut dressing.",
        3,
        1,
        550,
        31,
        48,
        25,
        "Lunch",
        "nutty savory",
        [8, 7, 21, 6],
        "1512621776951-a57141f2eefd",
      ],
      [
        "Lemon herb chicken & rice",
        "A weeknight favorite with juicy chicken and fragrant rice.",
        1,
        3,
        610,
        45,
        58,
        18,
        "Dinner",
        "savory bright",
        [5, 6, 3, 21],
        "1547592180-85f173990554",
      ],
      [
        "Banana overnight oats",
        "Slow mornings start here. Creamy oats with banana and yogurt.",
        6,
        2,
        390,
        18,
        61,
        10,
        "Breakfast",
        "sweet creamy",
        [10, 11, 9],
        "1517673400267-0251440c45dc",
      ],
      [
        "Roasted tomato & feta pasta",
        "Sweet roasted tomatoes meet tangy feta in this easy favorite.",
        4,
        2,
        580,
        22,
        72,
        22,
        "Dinner",
        "tangy bright",
        [12, 13, 3, 4],
        "1473093226795-af9932fe5856",
      ],
      [
        "Smoky chickpea rice bowl",
        "Colorful, satisfying and packed with plant-powered goodness.",
        5,
        1,
        490,
        20,
        70,
        13,
        "Lunch",
        "savory earthy",
        [1, 6, 14, 3],
        "1511690743698-d9d85f2fbf38",
      ],
      [
        "Coconut banana breakfast bowl",
        "A bright dairy-free breakfast topped with wholesome oats.",
        6,
        1,
        410,
        12,
        64,
        14,
        "Breakfast",
        "sweet creamy",
        [18, 11, 10],
        "1490645935967-10de6ba17061",
      ],
      [
        "Ginger salmon rice bowl",
        "Flaky salmon and tender greens with a fresh ginger finish.",
        3,
        3,
        620,
        42,
        55,
        24,
        "Dinner",
        "savory bright",
        [22, 6, 21, 23],
        "1467003909585-2f8a72700288",
      ],
      [
        "Garden quinoa salad",
        "Fresh, crisp and colorful. A feel-good lunch for any day.",
        1,
        1,
        430,
        17,
        58,
        14,
        "Lunch",
        "bright earthy",
        [2, 3, 14, 4],
        "1505576399279-565b52d4ac71",
      ],
      [
        "Savory breakfast rice",
        "A nourishing start with fluffy rice, egg and fresh spinach.",
        3,
        2,
        440,
        21,
        52,
        17,
        "Breakfast",
        "savory earthy",
        [6, 20, 4],
        "1498837167922-ddd27525d352",
      ],
    ];
    recipes.forEach((r, i) => {
      const [
        title,
        description,
        cuisine,
        diet,
        cal,
        p,
        c,
        f,
        meal,
        flavor,
        ids,
        photo,
      ] = r;
      const instructions = JSON.stringify(
        JSON.parse(
          readFileSync(
            path.join(process.cwd(), "lib/sample-steps.json"),
            "utf8",
          ),
        )[i],
      );
      const id = Number(
        run(
          "INSERT INTO recipes(title,description,instructions,prep_time_minutes,cook_time_minutes,servings,calories_per_serving,protein_g,carbs_g,fat_g,cuisine_id,diet_id,created_by,image,meal_type,flavor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          title,
          description,
          instructions,
          10,
          10 + (i % 4) * 5,
          2,
          cal,
          p,
          c,
          f,
          cuisine,
          diet,
          1,
          `https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=1000&q=85`,
          meal,
          flavor,
        ).lastInsertRowid,
      );
      ids.forEach((x: number) =>
        run("INSERT INTO recipe_ingredients VALUES(?,?,?,?)", id, x, 100, "g"),
      );
    });
    for (const [a, b, s] of [
      [7, 17, 0.93],
      [9, 18, 0.88],
      [12, 19, 0.85],
      [13, 18, 0.72],
      [5, 8, 0.75],
      [22, 8, 0.65],
    ])
      run("INSERT INTO substitutions VALUES(?,?,?)", a, b, s);
    run("INSERT INTO favorites(user_id,recipe_id) VALUES(1,1)");
  });
}
export function recipes(userId?: number, includeMine = false) {
  const allergies = userId
    ? all("SELECT allergen_id FROM user_allergens WHERE user_id=?", userId).map(
        (a) => a.allergen_id,
      )
    : [];
  return all(
    "SELECT r.*,c.name cuisine,d.name diet FROM recipes r JOIN cuisines c USING(cuisine_id) JOIN dietary_types d USING(diet_id) WHERE is_approved=1 OR (?=1 AND created_by=?) ORDER BY recipe_id",
    includeMine ? 1 : 0,
    userId ?? 0,
  )
    .map((r) => ({
      ...r,
      instructions: JSON.parse(r.instructions),
      ingredients: all(
        "SELECT i.*,ri.quantity,ri.unit FROM recipe_ingredients ri JOIN ingredients i USING(ingredient_id) WHERE recipe_id=?",
        r.recipe_id,
      ),
      allergens: all(
        "SELECT DISTINCT a.* FROM recipe_ingredients ri JOIN ingredient_allergens ia USING(ingredient_id) JOIN allergens a USING(allergen_id) WHERE recipe_id=?",
        r.recipe_id,
      ),
      favorite: !!(
        userId &&
        one(
          "SELECT 1 FROM favorites WHERE user_id=? AND recipe_id=?",
          userId,
          r.recipe_id,
        )
      ),
    }))
    .map((r) => ({
      ...r,
      conflicts: r.allergens.filter((a: any) =>
        allergies.includes(a.allergen_id),
      ),
    }));
}
