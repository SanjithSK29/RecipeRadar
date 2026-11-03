// Demo data for RecipeRadar. Run via `npm run db:setup` (scripts/setup-db.mjs).
import { readFileSync } from "node:fs";
import { hash } from "../lib/password.ts";

const ALLERGENS = [
      "Milk",
      "Peanuts",
      "Tree nuts",
      "Wheat",
      "Soy",
      "Eggs",
      "Sesame",
      "Fish",
      "Shellfish",
];
const CUISINES = [
      "Mediterranean",
      "Indian",
      "Asian",
      "Italian",
      "Mexican",
      "International",
];
const DIETS = ["Vegan", "Vegetarian", "High protein", "Balanced"];
// [name, flavor, allergen ids]
const INGREDIENTS = [
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
// [title, description, cuisine id, diet id, kcal, protein, carbs, fat, meal, flavor, ingredient ids, photo]
const RECIPES = [
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
// [from, to, similarity]
const SUBSTITUTIONS = [
      [7, 17, 0.93],
      [9, 18, 0.88],
      [12, 19, 0.85],
      [13, 18, 0.72],
      [5, 8, 0.75],
      [22, 8, 0.65],
  [8, 15, 0.7],
];

/** True when the database holds no domain data yet. */
export async function isEmpty(client) {
  const { rows } = await client.query(
    "SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM cuisines) + (SELECT count(*) FROM ingredients) AS n",
  );
  return Number(rows[0].n) === 0;
}

/** Insert demonstration data. Caller supplies a client with owner privileges. */
export async function seed(client, env = process.env) {
  const steps = JSON.parse(
    readFileSync(new URL("../lib/sample-steps.json", import.meta.url), "utf8"),
  );
  const demoPassword = env.SEED_DEMO_PASSWORD || "RecipeRadar123!";
  const adminPassword = env.SEED_ADMIN_PASSWORD || "AdminRadar123!";
  const q = (sql, ...args) => client.query(sql, args);
  await q(
    "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user'),($4,$5,$6,'admin')",
    "Alex Morgan", "demo@reciperadar.app", hash(demoPassword),
    "RecipeRadar Admin", "admin@reciperadar.app", hash(adminPassword),
  );
  for (const n of ALLERGENS) await q("INSERT INTO allergens(name) VALUES($1)", n);
  for (const n of CUISINES) await q("INSERT INTO cuisines(name) VALUES($1)", n);
  for (const n of DIETS) await q("INSERT INTO dietary_types(name) VALUES($1)", n);
  for (const [name, flavor, allergenIds] of INGREDIENTS) {
    const { rows } = await q(
      "INSERT INTO ingredients(name,flavor,category) VALUES($1,$2,'Whole foods') RETURNING ingredient_id",
      name, flavor,
    );
    for (const a of allergenIds)
      await q("INSERT INTO ingredient_allergens VALUES($1,$2)", rows[0].ingredient_id, a);
  }
  for (const [i, r] of RECIPES.entries()) {
    const [title, description, cuisine, diet, cal, p, c, f, meal, flavor, ids, photo] = r;
    const { rows } = await q(
      `INSERT INTO recipes(title,description,instructions,prep_time_minutes,cook_time_minutes,servings,
         calories_per_serving,protein_g,carbs_g,fat_g,cuisine_id,diet_id,created_by,is_approved,image,meal_type,flavor)
       VALUES($1,$2,$3::jsonb,10,$4,2,$5,$6,$7,$8,$9,$10,1,true,$11,$12,$13) RETURNING recipe_id`,
      title, description, JSON.stringify(steps[i]), 10 + (i % 4) * 5, cal, p, c, f, cuisine, diet,
      `https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=1000&q=85`, meal, flavor,
    );
    for (const x of ids)
      await q("INSERT INTO recipe_ingredients VALUES($1,$2,100,'g')", rows[0].recipe_id, x);
  }
  for (const [a, b, s] of SUBSTITUTIONS)
    await q("INSERT INTO substitutions VALUES($1,$2,$3)", a, b, s);
  await q("INSERT INTO favorites(user_id,recipe_id) VALUES(1,1)");
}
