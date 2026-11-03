-- RecipeRadar: demonstration queries (PostgreSQL). Run with:
--   psql "$DATABASE_ADMIN_URL" -f db/queries.sql
-- Everything here runs inside one transaction that is rolled back at the end,
-- so the demo data is left unchanged.
\set ON_ERROR_STOP on
BEGIN;

\echo '== 1. JOIN: recipe discovery with cuisine and diet'
SELECT r.recipe_id, r.title, c.name AS cuisine, d.name AS diet, r.calories_per_serving, r.avg_rating
FROM recipes r
JOIN cuisines c USING (cuisine_id)
JOIN dietary_types d USING (diet_id)
WHERE r.is_approved
ORDER BY r.avg_rating DESC, r.title;

\echo '== 2. Correlated NOT EXISTS: recipes free of user 1''s allergens (user 1 is allergic to peanuts here)'
INSERT INTO user_allergens VALUES (1, 2);
SELECT r.recipe_id, r.title
FROM recipes r
WHERE NOT EXISTS (
  SELECT 1
  FROM recipe_ingredients ri
  JOIN ingredient_allergens ia USING (ingredient_id)
  JOIN user_allergens ua USING (allergen_id)
  WHERE ri.recipe_id = r.recipe_id AND ua.user_id = 1);

\echo '== 3. Same result through the stored function fn_safe_recipes()'
SELECT * FROM fn_safe_recipes(1);

\echo '== 4. Ingredient-level allergen explanation (view)'
SELECT r.title, v.ingredient, v.allergen
FROM recipe_allergen_details v
JOIN recipes r USING (recipe_id)
ORDER BY r.title, v.ingredient;

\echo '== 5. GROUP BY / HAVING / aggregates: recipes with 2+ ratings'
INSERT INTO ratings (user_id, recipe_id, rating_value, review_text) VALUES (1, 3, 5, 'Great'), (2, 3, 4, 'Good');
SELECT r.title, count(*) AS reviews, round(avg(t.rating_value), 2) AS rating
FROM ratings t JOIN recipes r USING (recipe_id)
GROUP BY r.recipe_id, r.title
HAVING count(*) >= 2
ORDER BY rating DESC;

\echo '== 6. Subquery: recipes rated above the overall average'
SELECT title, avg_rating FROM recipes
WHERE avg_rating > (SELECT avg(avg_rating) FROM recipes WHERE avg_rating > 0);

\echo '== 7. Substitutions that avoid the user''s allergens'
SELECT a.name AS original, b.name AS replacement, s.similarity_score
FROM substitutions s
JOIN ingredients a ON a.ingredient_id = s.ingredient_id_from
JOIN ingredients b ON b.ingredient_id = s.ingredient_id_to
WHERE NOT EXISTS (
  SELECT 1 FROM ingredient_allergens ia JOIN user_allergens ua USING (allergen_id)
  WHERE ia.ingredient_id = b.ingredient_id AND ua.user_id = 1)
ORDER BY s.similarity_score DESC;

\echo '== 8. Recursive CTE: chains of substitutions (A -> B -> C), depth-limited, cycle-safe'
WITH RECURSIVE chain AS (
  SELECT ingredient_id_from AS start_id, ingredient_id_to AS end_id,
         ARRAY[ingredient_id_from, ingredient_id_to] AS path,
         similarity_score::numeric AS score, 1 AS depth
  FROM substitutions
  UNION ALL
  SELECT c.start_id, s.ingredient_id_to, c.path || s.ingredient_id_to,
         round(c.score * s.similarity_score, 2), c.depth + 1
  FROM chain c JOIN substitutions s ON s.ingredient_id_from = c.end_id
  WHERE s.ingredient_id_to <> ALL (c.path) AND c.depth < 3)
SELECT a.name AS start_ingredient, b.name AS end_ingredient, c.depth, c.score
FROM chain c
JOIN ingredients a ON a.ingredient_id = c.start_id
JOIN ingredients b ON b.ingredient_id = c.end_id
WHERE c.depth >= 1
ORDER BY c.depth DESC, c.score DESC
LIMIT 10;

\echo '== 9. Recursive CTE: the seven dates of a meal plan'
CALL sp_generate_meal_plan(1, DATE '2026-11-09', NULL);
WITH RECURSIVE plan_days AS (
  (SELECT plan_id, start_date AS day, end_date FROM meal_plans ORDER BY plan_id DESC LIMIT 1)
  UNION ALL
  SELECT plan_id, day + 1, end_date FROM plan_days WHERE day < end_date)
SELECT plan_id, day FROM plan_days ORDER BY day;

\echo '== 10. Standard CTE + view: daily nutrition for active plans'
WITH active_plans AS (SELECT plan_id, plan_name FROM meal_plans WHERE is_active)
SELECT p.plan_name, n.meal_date, n.calories, n.protein_g, n.carbs_g, n.fat_g
FROM active_plans p JOIN meal_plan_daily_nutrition n USING (plan_id)
ORDER BY n.meal_date;

\echo '== 11. Shopping list view (first rows)'
SELECT ingredient, unit, quantity FROM meal_plan_shopping_list ORDER BY ingredient LIMIT 8;

\echo '== 12. Window function: calorie rank within each meal type'
SELECT meal_type, title, calories_per_serving,
       rank() OVER (PARTITION BY meal_type ORDER BY calories_per_serving DESC) AS kcal_rank
FROM recipes ORDER BY meal_type, kcal_rank;

\echo '== 13. Functions: portion calories and flavor similarity'
SELECT title, fn_portion_calories(calories_per_serving, 2) AS two_serving_kcal FROM recipes WHERE recipe_id = 1;
SELECT fn_flavor_similarity('creamy bright', 'creamy earthy') AS descriptor_similarity;

\echo '== 14. Full-text search (tsvector + GIN) with ranking'
SELECT * FROM fn_search_recipes('creamy coconut');

\echo '== 15. Vector similarity search inside PostgreSQL (cosine) -- nearest to recipe 1''s own embedding'
-- vector_documents is filled by the app; load one document so the demo works from psql alone.
INSERT INTO vector_documents (recipe_id, embedding, payload)
SELECT 1, array_fill(0.0::float8, ARRAY[127]) || 1.0::float8, '{"title":"demo"}'::jsonb
ON CONFLICT (recipe_id) DO NOTHING;
SELECT recipe_id, round(score::numeric, 3) AS score
FROM fn_search_vectors(array_fill(0.0::float8, ARRAY[127]) || 1.0::float8, 3);

\echo '== 16. DML in a transaction (INSERT / UPDATE / DELETE), rolled back'
INSERT INTO favorites (user_id, recipe_id) VALUES (1, 5) ON CONFLICT DO NOTHING;
UPDATE users SET diet_goal = 'Vegan' WHERE user_id = 1;
DELETE FROM favorites WHERE user_id = 1 AND recipe_id = 5;

\echo '== 17. Role-based access control demo (the UPDATE below is meant to fail)'
\set ON_ERROR_STOP off
SET LOCAL ROLE rr_user;
SELECT set_config('rr.user_id', '1', true) AS acting_as_user;
SAVEPOINT try_promote;
UPDATE users SET role = 'admin' WHERE user_id = 1;   -- permission denied
ROLLBACK TO try_promote;
RESET ROLE;

ROLLBACK;
