-- RecipeRadar migration 002: stored functions and procedures (PL/pgSQL / SQL).

-- Calories for a number of portions; NULL for invalid input.
CREATE FUNCTION fn_portion_calories(calories NUMERIC, portions NUMERIC) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN calories IS NULL OR portions IS NULL OR portions < 0 THEN NULL
              ELSE round(calories * portions, 2) END
$$;

-- Jaccard similarity between two flavor descriptors ("creamy bright" vs "smooth fresh").
CREATE FUNCTION fn_flavor_similarity(a TEXT, b TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  WITH x AS (SELECT DISTINCT w FROM regexp_split_to_table(lower(coalesce(a, '')), '[^a-z0-9]+') AS w WHERE w <> ''),
       y AS (SELECT DISTINCT w FROM regexp_split_to_table(lower(coalesce(b, '')), '[^a-z0-9]+') AS w WHERE w <> ''),
       u AS (SELECT w FROM x UNION SELECT w FROM y)
  SELECT CASE WHEN (SELECT count(*) FROM u) = 0 THEN 0::numeric
              ELSE round((SELECT count(*) FROM x JOIN y USING (w))::numeric / (SELECT count(*) FROM u), 4) END
$$;

-- Cosine similarity between two equal-length vectors; 0 for zero vectors.
CREATE FUNCTION fn_cosine_similarity(a DOUBLE PRECISION[], b DOUBLE PRECISION[]) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN s.aa = 0 OR s.bb = 0 THEN 0 ELSE s.dot / sqrt(s.aa * s.bb) END
  FROM (SELECT sum(x * y) AS dot, sum(x * x) AS aa, sum(y * y) AS bb FROM unnest(a, b) AS t(x, y)) AS s
$$;

-- Vector similarity search inside the database: top-k stored embeddings by cosine similarity.
CREATE FUNCTION fn_search_vectors(query DOUBLE PRECISION[], k INTEGER DEFAULT 8)
RETURNS TABLE (recipe_id INTEGER, score DOUBLE PRECISION, payload JSONB)
LANGUAGE sql STABLE AS $$
  SELECT v.recipe_id, fn_cosine_similarity(query, v.embedding), v.payload
  FROM vector_documents v
  ORDER BY 2 DESC, v.recipe_id
  LIMIT greatest(k, 1)
$$;

-- Allergens contained in a recipe (through its ingredients).
CREATE FUNCTION fn_recipe_allergens(p_recipe_id INTEGER)
RETURNS TABLE (allergen_id INTEGER, name TEXT)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT a.allergen_id, a.name
  FROM recipe_ingredients ri
  JOIN ingredient_allergens ia USING (ingredient_id)
  JOIN allergens a USING (allergen_id)
  WHERE ri.recipe_id = p_recipe_id
$$;

-- Approved recipes containing none of a user's recorded allergens (correlated NOT EXISTS).
CREATE FUNCTION fn_safe_recipes(p_user_id INTEGER)
RETURNS TABLE (recipe_id INTEGER, title TEXT, meal_type TEXT)
LANGUAGE sql STABLE AS $$
  SELECT r.recipe_id, r.title, r.meal_type
  FROM recipes r
  WHERE r.is_approved
    AND NOT EXISTS (
      SELECT 1
      FROM recipe_ingredients ri
      JOIN ingredient_allergens ia USING (ingredient_id)
      JOIN user_allergens ua USING (allergen_id)
      WHERE ri.recipe_id = r.recipe_id AND ua.user_id = p_user_id)
$$;

-- Generate a seven-day, three-meal plan that respects the user's diet goal, allergens and
-- calorie target. Runs as the caller, so row-level security and grants still apply.
CREATE PROCEDURE sp_generate_meal_plan(p_user_id INTEGER, p_start DATE, INOUT p_plan_id INTEGER DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  v_goal TEXT;
  v_target INTEGER;
  v_types TEXT[] := ARRAY['Breakfast', 'Lunch', 'Dinner'];
  v_type TEXT;
  v_ids INTEGER[];
  v_pool JSONB := '{}'::jsonb;
  v_day INTEGER;
  v_pick INTEGER;
BEGIN
  IF p_start IS NULL THEN
    RAISE EXCEPTION 'Choose a valid start date' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF rr_uid() IS NULL THEN
    -- Direct call by the table owner (psql, tests); application calls always carry rr.user_id.
    SELECT diet_goal, daily_calorie_target INTO v_goal, v_target FROM users WHERE user_id = p_user_id;
  ELSE
    IF p_user_id <> rr_uid() THEN
      RAISE EXCEPTION 'You can only generate plans for yourself' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT diet_goal, daily_calorie_target INTO v_goal, v_target FROM my_profile WHERE user_id = p_user_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Candidate recipes per meal type, closest to one third of the daily target first.
  FOREACH v_type IN ARRAY v_types LOOP
    SELECT array_agg(r.recipe_id ORDER BY abs(r.calories_per_serving - v_target / 3.0), r.recipe_id)
      INTO v_ids
    FROM recipes r
    JOIN dietary_types d USING (diet_id)
    WHERE r.is_approved AND r.meal_type = v_type
      AND (v_goal = 'Balanced' OR d.name = v_goal)
      AND NOT EXISTS (
        SELECT 1 FROM recipe_ingredients ri
        JOIN ingredient_allergens ia USING (ingredient_id)
        JOIN user_allergens ua USING (allergen_id)
        WHERE ri.recipe_id = r.recipe_id AND ua.user_id = p_user_id);
    IF v_ids IS NULL THEN
      RAISE EXCEPTION 'Not enough recipes match your diet and allergens for all three meals. Add matching recipes or adjust your profile.'
        USING ERRCODE = 'no_data_found';
    END IF;
    v_pool := v_pool || jsonb_build_object(v_type, to_jsonb(v_ids));
  END LOOP;

  INSERT INTO meal_plans (user_id, plan_name, start_date, end_date)
  VALUES (p_user_id, 'Your feel-good week', p_start, p_start + 6)
  RETURNING plan_id INTO p_plan_id;

  FOR v_day IN 0..6 LOOP
    FOREACH v_type IN ARRAY v_types LOOP
      SELECT array_agg(value::integer) INTO v_ids FROM jsonb_array_elements_text(v_pool -> v_type) AS value;
      v_pick := v_ids[1 + (v_day % least(cardinality(v_ids), 3))];
      INSERT INTO meal_plan_recipes (plan_id, recipe_id, meal_date, meal_type, servings_planned)
      SELECT p_plan_id, r.recipe_id, p_start + v_day, v_type,
             round(v_target / 3.0 / r.calories_per_serving, 2)
      FROM recipes r WHERE r.recipe_id = v_pick;
    END LOOP;
  END LOOP;
END $$;

-- Record a rating and return the recipe's refreshed average (transactional helper).
CREATE FUNCTION fn_rate_recipe(p_user_id INTEGER, p_recipe_id INTEGER, p_value INTEGER, p_review TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql AS $$
DECLARE v_avg NUMERIC;
BEGIN
  INSERT INTO ratings (user_id, recipe_id, rating_value, review_text)
  VALUES (p_user_id, p_recipe_id, p_value, p_review)
  ON CONFLICT (user_id, recipe_id)
  DO UPDATE SET rating_value = EXCLUDED.rating_value, review_text = EXCLUDED.review_text, created_at = now();
  SELECT avg_rating INTO v_avg FROM recipes WHERE recipe_id = p_recipe_id;
  RETURN v_avg;
END $$;
