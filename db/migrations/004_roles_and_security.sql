-- RecipeRadar migration 004: database roles, GRANT/REVOKE, and row-level security.
-- Requires PostgreSQL 15+ (security_invoker views).
--
-- Role model (all NOLOGIN group roles; the app logs in as rr_app and switches with
-- SET LOCAL ROLE for each request, so the database itself enforces the policy):
--   rr_guest  anonymous visitor      read-only access to approved/public data
--   rr_user   signed-in user         guest + manage own favorites, ratings, plans, recipes
--   rr_admin  administrator          user + moderate recipes, manage roles, read audit log
--   rr_app    login role (NOINHERIT) sessions + registration; may SET ROLE to the three above

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_guest') THEN CREATE ROLE rr_guest NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_user')  THEN CREATE ROLE rr_user NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_admin') THEN CREATE ROLE rr_admin NOLOGIN; END IF;
END $$;

GRANT rr_guest TO rr_user;
GRANT rr_user TO rr_admin;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_app') THEN
    GRANT rr_guest, rr_user, rr_admin TO rr_app;
  END IF;
END $$;

-- Start from nothing: no implicit access for PUBLIC.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO rr_guest, rr_user, rr_admin;

-- Views run with the caller's privileges so row-level security still applies.
ALTER VIEW recipe_allergen_details SET (security_invoker = true);
ALTER VIEW meal_plan_daily_nutrition SET (security_invoker = true);
ALTER VIEW meal_plan_shopping_list SET (security_invoker = true);

-- ---------------------------------------------------------------- rr_guest
GRANT SELECT ON cuisines, dietary_types, allergens, ingredients, ingredient_allergens,
  substitutions, recipes, recipe_ingredients, ratings, recipe_allergen_details TO rr_guest;
GRANT SELECT (user_id, name) ON users TO rr_guest;
GRANT EXECUTE ON FUNCTION fn_portion_calories(NUMERIC, NUMERIC), fn_flavor_similarity(TEXT, TEXT),
  fn_cosine_similarity(DOUBLE PRECISION[], DOUBLE PRECISION[]), fn_recipe_allergens(INTEGER),
  fn_search_recipes(TEXT, INTEGER), rr_uid() TO rr_guest;

-- ---------------------------------------------------------------- rr_user
GRANT SELECT, INSERT, DELETE ON user_allergens, favorites TO rr_user;
GRANT SELECT, INSERT, DELETE ON meal_plans, meal_plan_recipes TO rr_user;
GRANT SELECT ON meal_plan_daily_nutrition, meal_plan_shopping_list, my_profile TO rr_user;
GRANT INSERT, UPDATE (rating_value, review_text, created_at), DELETE ON ratings TO rr_user;
GRANT UPDATE (name, diet_goal, daily_calorie_target, age) ON users TO rr_user;
GRANT INSERT (title, description, instructions, prep_time_minutes, cook_time_minutes, servings,
  calories_per_serving, protein_g, carbs_g, fat_g, cuisine_id, diet_id, created_by, meal_type, image, flavor)
  ON recipes TO rr_user;
GRANT UPDATE (title, description, instructions, prep_time_minutes, cook_time_minutes, servings,
  calories_per_serving, protein_g, carbs_g, fat_g, cuisine_id, diet_id, meal_type, image, flavor)
  ON recipes TO rr_user;
GRANT DELETE ON recipes TO rr_user;
GRANT INSERT, UPDATE, DELETE ON recipe_ingredients TO rr_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON vector_sync_outbox, vector_documents TO rr_user;
GRANT EXECUTE ON FUNCTION fn_safe_recipes(INTEGER), fn_search_vectors(DOUBLE PRECISION[], INTEGER),
  fn_rate_recipe(INTEGER, INTEGER, INTEGER, TEXT) TO rr_user;
GRANT EXECUTE ON PROCEDURE sp_generate_meal_plan(INTEGER, DATE, INTEGER) TO rr_user;

-- ---------------------------------------------------------------- rr_admin
GRANT SELECT (user_id, name, email, role, age, diet_goal, daily_calorie_target, created_at) ON users TO rr_admin;
GRANT UPDATE (role) ON users TO rr_admin;
GRANT UPDATE (is_approved) ON recipes TO rr_admin;
GRANT SELECT ON audit_log TO rr_admin;

-- ---------------------------------------------------------------- rr_app (pre-authentication)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_app') THEN
    GRANT USAGE ON SCHEMA public TO rr_app;
    GRANT SELECT ON users TO rr_app;
    GRANT INSERT (name, email, password_hash) ON users TO rr_app;
    GRANT SELECT, INSERT, DELETE ON sessions TO rr_app;
  END IF;
END $$;

-- Identity columns need sequence access for every role that inserts.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rr_user, rr_admin;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'rr_app') THEN
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rr_app;
  END IF;
END $$;

-- ---------------------------------------------------------------- row-level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_read ON users FOR SELECT TO rr_guest, rr_app USING (true);
CREATE POLICY users_register ON users FOR INSERT TO rr_app WITH CHECK (role = 'user');
CREATE POLICY users_update_self ON users FOR UPDATE TO rr_user
  USING (user_id = rr_uid()) WITH CHECK (user_id = rr_uid());
CREATE POLICY users_update_admin ON users FOR UPDATE TO rr_admin USING (true) WITH CHECK (true);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipes_read_approved ON recipes FOR SELECT TO rr_guest, rr_app USING (is_approved);
CREATE POLICY recipes_read_own ON recipes FOR SELECT TO rr_user USING (created_by = rr_uid());
CREATE POLICY recipes_read_admin ON recipes FOR SELECT TO rr_admin USING (true);
CREATE POLICY recipes_insert_own ON recipes FOR INSERT TO rr_user
  WITH CHECK (created_by = rr_uid() AND NOT is_approved);
CREATE POLICY recipes_update_own ON recipes FOR UPDATE TO rr_user
  USING (created_by = rr_uid()) WITH CHECK (created_by = rr_uid());
CREATE POLICY recipes_update_admin ON recipes FOR UPDATE TO rr_admin USING (true) WITH CHECK (true);
CREATE POLICY recipes_delete_own ON recipes FOR DELETE TO rr_user USING (created_by = rr_uid());
CREATE POLICY recipes_delete_admin ON recipes FOR DELETE TO rr_admin USING (true);

-- Ingredient rows are visible exactly when their recipe is (the subquery is itself filtered).
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_ingredients_read ON recipe_ingredients FOR SELECT TO rr_guest, rr_app
  USING (EXISTS (SELECT 1 FROM recipes r WHERE r.recipe_id = recipe_ingredients.recipe_id));
CREATE POLICY recipe_ingredients_write_own ON recipe_ingredients FOR ALL TO rr_user
  USING (EXISTS (SELECT 1 FROM recipes r WHERE r.recipe_id = recipe_ingredients.recipe_id AND r.created_by = rr_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM recipes r WHERE r.recipe_id = recipe_ingredients.recipe_id AND r.created_by = rr_uid()));
CREATE POLICY recipe_ingredients_write_admin ON recipe_ingredients FOR ALL TO rr_admin
  USING (true) WITH CHECK (true);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ratings_read ON ratings FOR SELECT TO rr_guest, rr_app USING (true);
CREATE POLICY ratings_insert_own ON ratings FOR INSERT TO rr_user
  WITH CHECK (user_id = rr_uid()
    AND EXISTS (SELECT 1 FROM recipes r WHERE r.recipe_id = ratings.recipe_id AND r.is_approved));
CREATE POLICY ratings_update_own ON ratings FOR UPDATE TO rr_user
  USING (user_id = rr_uid()) WITH CHECK (user_id = rr_uid());
CREATE POLICY ratings_delete_own ON ratings FOR DELETE TO rr_user USING (user_id = rr_uid());

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY favorites_own ON favorites FOR ALL TO rr_user
  USING (user_id = rr_uid()) WITH CHECK (user_id = rr_uid());

ALTER TABLE user_allergens ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_allergens_own ON user_allergens FOR ALL TO rr_user
  USING (user_id = rr_uid()) WITH CHECK (user_id = rr_uid());

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY meal_plans_own ON meal_plans FOR ALL TO rr_user
  USING (user_id = rr_uid()) WITH CHECK (user_id = rr_uid());

ALTER TABLE meal_plan_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY meal_plan_recipes_own ON meal_plan_recipes FOR ALL TO rr_user
  USING (EXISTS (SELECT 1 FROM meal_plans p WHERE p.plan_id = meal_plan_recipes.plan_id AND p.user_id = rr_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM meal_plans p WHERE p.plan_id = meal_plan_recipes.plan_id AND p.user_id = rr_uid()));
