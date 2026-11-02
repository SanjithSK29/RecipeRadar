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
