-- RecipeRadar: example queries for a DBMS demonstration.
-- 1. Recipe discovery: a multi-table join.
SELECT r.recipe_id, r.title, c.name AS cuisine, d.name AS diet,
       r.calories_per_serving, r.avg_rating
FROM recipes r JOIN cuisines c USING(cuisine_id)
JOIN dietary_types d USING(diet_id)
WHERE r.is_approved = 1 ORDER BY r.avg_rating DESC;

-- 2. Recipes excluding all recorded allergens for user 1 (NOT EXISTS).
SELECT r.recipe_id, r.title FROM recipes r
WHERE NOT EXISTS (
 SELECT 1 FROM recipe_ingredients ri
 JOIN ingredient_allergens ia USING(ingredient_id)
 JOIN user_allergens ua USING(allergen_id)
 WHERE ri.recipe_id = r.recipe_id AND ua.user_id = 1
);

-- 3. Ingredient-level allergen explanation.
SELECT r.title, i.name AS ingredient, a.name AS allergen
FROM recipes r JOIN recipe_ingredients ri USING(recipe_id)
JOIN ingredients i USING(ingredient_id)
JOIN ingredient_allergens ia USING(ingredient_id)
JOIN allergens a USING(allergen_id);

-- 4. Daily meal-plan calorie totals (aggregation).
SELECT p.plan_name, m.meal_date,
 ROUND(SUM(r.calories_per_serving * m.servings_planned)) AS total_kcal
FROM meal_plans p JOIN meal_plan_recipes m USING(plan_id)
JOIN recipes r USING(recipe_id)
WHERE p.user_id = 1 GROUP BY p.plan_id, m.meal_date;

-- 5. Shopping list: recipe quantities are for a full recipe.
SELECT i.name, CEIL(SUM(ri.quantity * m.servings_planned / r.servings)) AS grams
FROM meal_plan_recipes m JOIN meal_plans p USING(plan_id)
JOIN recipes r USING(recipe_id)
JOIN recipe_ingredients ri USING(recipe_id)
JOIN ingredients i USING(ingredient_id)
WHERE p.user_id=1 GROUP BY i.ingredient_id;

-- 6. Highest-rated recipes, only with actual reviews.
SELECT r.title, COUNT(*) AS reviews, ROUND(AVG(t.rating_value),2) AS rating
FROM ratings t JOIN recipes r USING(recipe_id)
GROUP BY r.recipe_id HAVING COUNT(*) > 0 ORDER BY rating DESC;

-- 7. Substitutions without the user's recorded allergens.
SELECT a.name AS original, b.name AS replacement, s.similarity_score
FROM substitutions s
JOIN ingredients a ON a.ingredient_id=s.ingredient_id_from
JOIN ingredients b ON b.ingredient_id=s.ingredient_id_to
WHERE NOT EXISTS (
 SELECT 1 FROM ingredient_allergens ia JOIN user_allergens ua USING(allergen_id)
 WHERE ia.ingredient_id=b.ingredient_id AND ua.user_id=1
) ORDER BY s.similarity_score DESC;


-- 8. CTE: active plans with their daily nutrition totals.
WITH active_plans AS (
 SELECT plan_id,user_id,plan_name FROM meal_plans WHERE is_active=1
)
SELECT p.plan_name,n.meal_date,n.calories,n.protein_g,n.carbs_g,n.fat_g
FROM active_plans p JOIN meal_plan_daily_nutrition n USING(plan_id)
ORDER BY p.plan_name,n.meal_date;

-- 9. Recursive CTE: generate the seven dates in a plan (SQLite).
WITH RECURSIVE plan_days(plan_id,meal_date,end_date) AS (
 SELECT plan_id,start_date,end_date FROM meal_plans WHERE plan_id=:plan_id
 UNION ALL
 SELECT plan_id,date(meal_date,'+1 day'),end_date FROM plan_days
 WHERE meal_date<end_date
) SELECT plan_id,meal_date FROM plan_days ORDER BY meal_date;

-- 10. SQL user-defined functions registered by lib/db.ts.
SELECT title,reciperadar_portion_calories(calories_per_serving,2) AS two_serving_kcal
FROM recipes WHERE recipe_id=:recipe_id;
SELECT reciperadar_flavor_similarity('creamy bright','smooth fresh') AS descriptor_similarity;

-- 11. DML examples (use a transaction; IDs below identify demo rows).
BEGIN IMMEDIATE;
INSERT INTO favorites(user_id,recipe_id) VALUES(1,1) ON CONFLICT DO NOTHING;
UPDATE users SET diet_goal='Vegan' WHERE user_id=1;
DELETE FROM favorites WHERE user_id=1 AND recipe_id=1;
ROLLBACK; -- Demonstration only: leaves sample data unchanged.

-- Parameterized record create/update/delete is implemented in /api/recipe.
-- Approved recipe create/update enqueues an atomic outbox row; vector_sync_outbox
-- workers UPSERT the corresponding Qdrant point. Recipe removal queues its tombstone.
