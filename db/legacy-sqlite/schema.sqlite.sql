-- RecipeRadar schema v4. SQLite 3.37+ STRICT tables; Node 24 bundles SQLite.
-- All original model attributes remain. Extensions are documented in docs/database-audit.md.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(email) BETWEEN 3 AND 255 AND email=trim(email) AND instr(email,'@')>1),
  password_hash TEXT NOT NULL CHECK(length(password_hash) BETWEEN 1 AND 255),
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  age INTEGER CHECK(age BETWEEN 1 AND 120),
  diet_goal TEXT NOT NULL DEFAULT 'Balanced' CHECK(diet_goal IN ('Balanced','Vegan','Vegetarian','High protein')),
  daily_calorie_target INTEGER NOT NULL DEFAULT 2000 CHECK(daily_calorie_target BETWEEN 800 AND 6000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(datetime(created_at) IS NOT NULL)
) STRICT;

CREATE TABLE allergens (
  allergen_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 50),
  severity TEXT NOT NULL DEFAULT 'High' CHECK(severity IN ('Low','Moderate','High','Severe'))
) STRICT;

CREATE TABLE user_allergens (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(allergen_id) ON DELETE RESTRICT,
  PRIMARY KEY(user_id,allergen_id)
) STRICT;

CREATE TABLE cuisines (
  cuisine_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 50)
) STRICT;

CREATE TABLE dietary_types (
  diet_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 50)
) STRICT;

CREATE TABLE ingredients (
  ingredient_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 100),
  category TEXT CHECK(length(category)<=50),
  unit TEXT NOT NULL DEFAULT 'g' CHECK(length(trim(unit)) BETWEEN 1 AND 20),
  is_common_allergen INTEGER NOT NULL DEFAULT 0 CHECK(is_common_allergen IN (0,1)),
  flavor TEXT NOT NULL DEFAULT 'savory' CHECK(length(trim(flavor)) BETWEEN 1 AND 100)
) STRICT;

-- Necessary extension: identifies WHICH allergens each ingredient contains.
CREATE TABLE ingredient_allergens (
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(allergen_id) ON DELETE RESTRICT,
  PRIMARY KEY(ingredient_id,allergen_id)
) STRICT;

CREATE TABLE recipes (
  recipe_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  description TEXT,
  instructions TEXT NOT NULL CHECK(CASE WHEN json_valid(instructions) THEN json_type(instructions)='array' AND json_array_length(instructions)>0 ELSE 0 END),
  prep_time_minutes INTEGER NOT NULL DEFAULT 10 CHECK(prep_time_minutes BETWEEN 0 AND 10080),
  cook_time_minutes INTEGER NOT NULL DEFAULT 15 CHECK(cook_time_minutes BETWEEN 0 AND 10080),
  servings INTEGER NOT NULL CHECK(servings BETWEEN 1 AND 1000),
  calories_per_serving REAL NOT NULL CHECK(calories_per_serving>0 AND calories_per_serving<=999999.99 AND round(calories_per_serving,2)=calories_per_serving),
  protein_g REAL NOT NULL DEFAULT 0 CHECK(protein_g BETWEEN 0 AND 9999.99 AND round(protein_g,2)=protein_g),
  carbs_g REAL NOT NULL DEFAULT 0 CHECK(carbs_g BETWEEN 0 AND 9999.99 AND round(carbs_g,2)=carbs_g),
  fat_g REAL NOT NULL DEFAULT 0 CHECK(fat_g BETWEEN 0 AND 9999.99 AND round(fat_g,2)=fat_g),
  avg_rating REAL NOT NULL DEFAULT 0 CHECK(avg_rating BETWEEN 0 AND 5),
  total_views INTEGER NOT NULL DEFAULT 0 CHECK(total_views>=0),
  cuisine_id INTEGER NOT NULL REFERENCES cuisines(cuisine_id) ON DELETE RESTRICT,
  diet_id INTEGER NOT NULL REFERENCES dietary_types(diet_id) ON DELETE RESTRICT,
  created_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  is_approved INTEGER NOT NULL DEFAULT 1 CHECK(is_approved IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(datetime(created_at) IS NOT NULL),
  image TEXT,
  meal_type TEXT NOT NULL DEFAULT 'Lunch' CHECK(meal_type IN ('Breakfast','Lunch','Dinner')),
  flavor TEXT NOT NULL DEFAULT 'savory' CHECK(length(trim(flavor)) BETWEEN 1 AND 100)
) STRICT;

CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK(quantity>0 AND quantity<=999999.99 AND round(quantity,2)=quantity),
  unit TEXT NOT NULL DEFAULT 'g' CHECK(length(trim(unit)) BETWEEN 1 AND 20),
  PRIMARY KEY(recipe_id,ingredient_id)
) STRICT;

CREATE TABLE ratings (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  rating_value INTEGER NOT NULL CHECK(rating_value BETWEEN 1 AND 5),
  review_text TEXT CHECK(length(review_text)<=2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(datetime(created_at) IS NOT NULL),
  PRIMARY KEY(user_id,recipe_id)
) STRICT;

CREATE TABLE favorites (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(datetime(saved_at) IS NOT NULL),
  PRIMARY KEY(user_id,recipe_id)
) STRICT;

CREATE TABLE meal_plans (
  plan_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL CHECK(length(trim(plan_name)) BETWEEN 1 AND 100),
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND date(start_date,'+0 days') IS NOT NULL AND date(start_date,'+0 days')=start_date),
  end_date TEXT NOT NULL CHECK(length(end_date)=10 AND date(end_date,'+0 days') IS NOT NULL AND date(end_date,'+0 days')=end_date AND end_date>=start_date),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK(datetime(created_at) IS NOT NULL)
) STRICT;

CREATE TABLE meal_plan_recipes (
  plan_id INTEGER NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  meal_date TEXT NOT NULL CHECK(length(meal_date)=10 AND date(meal_date,'+0 days') IS NOT NULL AND date(meal_date,'+0 days')=meal_date),
  meal_type TEXT NOT NULL CHECK(meal_type IN ('Breakfast','Lunch','Dinner')),
  servings_planned REAL NOT NULL DEFAULT 1 CHECK(servings_planned>0 AND servings_planned<=1000 AND round(servings_planned,2)=servings_planned),
  -- One recipe per date/meal slot. A recipe can repeat on different days.
  PRIMARY KEY(plan_id,meal_date,meal_type)
) STRICT;

CREATE TABLE substitutions (
  ingredient_id_from INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  ingredient_id_to INTEGER NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL CHECK(similarity_score BETWEEN 0 AND 1 AND round(similarity_score,2)=similarity_score),
  PRIMARY KEY(ingredient_id_from,ingredient_id_to),
  CHECK(ingredient_id_from<>ingredient_id_to)
) STRICT;

CREATE TABLE sessions (
  token TEXT PRIMARY KEY NOT NULL CHECK(length(token)=64 AND token NOT GLOB '*[^0-9a-f]*'),
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL CHECK(expires_at>0)
) STRICT;

-- Durable transactional outbox bridges SQLite source records to Qdrant.
-- recipe_id intentionally has no FK so delete tombstones survive row deletion.
CREATE TABLE vector_sync_outbox (
  outbox_id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
  payload TEXT CHECK(payload IS NULL OR json_valid(payload)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(recipe_id,operation)
) STRICT;
CREATE TABLE vector_documents (
  recipe_id INTEGER PRIMARY KEY NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  embedding TEXT NOT NULL CHECK(json_valid(embedding) AND json_type(embedding)='array' AND json_array_length(embedding)=128),
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object'),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX idx_user_allergen_reverse ON user_allergens(allergen_id);
CREATE INDEX idx_ingredient_allergen_reverse ON ingredient_allergens(allergen_id);
CREATE INDEX idx_recipe_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipes_creator ON recipes(created_by);
CREATE INDEX idx_recipes_cuisine ON recipes(cuisine_id);
CREATE INDEX idx_recipes_diet ON recipes(diet_id,is_approved);
CREATE INDEX idx_rating_recipe ON ratings(recipe_id);
CREATE INDEX idx_favorites_recipe ON favorites(recipe_id);
CREATE INDEX idx_plan_user ON meal_plans(user_id,start_date);
CREATE INDEX idx_plan_recipe ON meal_plan_recipes(recipe_id);
CREATE INDEX idx_substitution_target ON substitutions(ingredient_id_to);
CREATE INDEX idx_session_user ON sessions(user_id);
CREATE INDEX idx_session_expiry ON sessions(expires_at);
CREATE INDEX idx_vector_outbox_created ON vector_sync_outbox(created_at);
CREATE INDEX idx_vector_payload_diet ON vector_documents(json_extract(payload,'$.diet'));

-- Maintain both OLD and NEW recipes when a rating is reassigned via SQL.
CREATE TRIGGER rating_insert AFTER INSERT ON ratings BEGIN
  UPDATE recipes SET avg_rating=(SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=NEW.recipe_id) WHERE recipe_id=NEW.recipe_id;
END;
CREATE TRIGGER rating_update AFTER UPDATE ON ratings BEGIN
  UPDATE recipes SET avg_rating=COALESCE((SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=OLD.recipe_id),0) WHERE recipe_id=OLD.recipe_id;
  UPDATE recipes SET avg_rating=COALESCE((SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=NEW.recipe_id),0) WHERE recipe_id=NEW.recipe_id;
END;
CREATE TRIGGER rating_delete AFTER DELETE ON ratings BEGIN
  UPDATE recipes SET avg_rating=COALESCE((SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=OLD.recipe_id),0) WHERE recipe_id=OLD.recipe_id;
END;
CREATE TRIGGER rating_cache_insert BEFORE INSERT ON recipes WHEN NEW.avg_rating<>0 BEGIN
  SELECT RAISE(ABORT,'avg_rating is maintained by rating triggers');
END;
CREATE TRIGGER rating_cache_update BEFORE UPDATE OF avg_rating ON recipes
WHEN NEW.avg_rating<>COALESCE((SELECT round(AVG(rating_value),2) FROM ratings WHERE recipe_id=NEW.recipe_id),0) BEGIN
  SELECT RAISE(ABORT,'avg_rating is maintained by rating triggers');
END;

CREATE TRIGGER allergen_mapping_insert AFTER INSERT ON ingredient_allergens BEGIN
  UPDATE ingredients SET is_common_allergen=1 WHERE ingredient_id=NEW.ingredient_id;
END;
CREATE TRIGGER allergen_mapping_update AFTER UPDATE ON ingredient_allergens BEGIN
  UPDATE ingredients SET is_common_allergen=EXISTS(SELECT 1 FROM ingredient_allergens WHERE ingredient_id=OLD.ingredient_id) WHERE ingredient_id=OLD.ingredient_id;
  UPDATE ingredients SET is_common_allergen=1 WHERE ingredient_id=NEW.ingredient_id;
END;
CREATE TRIGGER allergen_mapping_delete AFTER DELETE ON ingredient_allergens BEGIN
  UPDATE ingredients SET is_common_allergen=EXISTS(SELECT 1 FROM ingredient_allergens WHERE ingredient_id=OLD.ingredient_id) WHERE ingredient_id=OLD.ingredient_id;
END;
CREATE TRIGGER allergen_flag_insert BEFORE INSERT ON ingredients WHEN NEW.is_common_allergen<>0 BEGIN
  SELECT RAISE(ABORT,'Create ingredient first, then add its allergen mappings');
END;
CREATE TRIGGER allergen_flag_update BEFORE UPDATE OF is_common_allergen ON ingredients
WHEN NEW.is_common_allergen<>EXISTS(SELECT 1 FROM ingredient_allergens WHERE ingredient_id=NEW.ingredient_id) BEGIN
  SELECT RAISE(ABORT,'is_common_allergen is maintained by allergen mappings');
END;

CREATE TRIGGER meal_date_insert BEFORE INSERT ON meal_plan_recipes
WHEN NOT EXISTS(SELECT 1 FROM meal_plans WHERE plan_id=NEW.plan_id AND NEW.meal_date BETWEEN start_date AND end_date) BEGIN
  SELECT RAISE(ABORT,'Meal date must be within its plan date range');
END;
CREATE TRIGGER meal_date_update BEFORE UPDATE OF plan_id,meal_date ON meal_plan_recipes
WHEN NOT EXISTS(SELECT 1 FROM meal_plans WHERE plan_id=NEW.plan_id AND NEW.meal_date BETWEEN start_date AND end_date) BEGIN
  SELECT RAISE(ABORT,'Meal date must be within its plan date range');
END;
CREATE TRIGGER plan_date_update BEFORE UPDATE OF start_date,end_date ON meal_plans
WHEN EXISTS(SELECT 1 FROM meal_plan_recipes WHERE plan_id=OLD.plan_id AND meal_date NOT BETWEEN NEW.start_date AND NEW.end_date) BEGIN
  SELECT RAISE(ABORT,'Plan dates cannot exclude existing meals');
END;

-- Database-side reports: application and viva queries can share the same logic.
CREATE VIEW recipe_allergen_details AS
SELECT DISTINCT ri.recipe_id,i.ingredient_id,i.name ingredient,a.allergen_id,a.name allergen
FROM recipe_ingredients ri JOIN ingredients i USING(ingredient_id)
JOIN ingredient_allergens ia USING(ingredient_id) JOIN allergens a USING(allergen_id);

CREATE VIEW meal_plan_daily_nutrition AS
SELECT p.plan_id,p.user_id,m.meal_date,
 round(SUM(r.calories_per_serving*m.servings_planned),2) calories,
 round(SUM(r.protein_g*m.servings_planned),2) protein_g,
 round(SUM(r.carbs_g*m.servings_planned),2) carbs_g,
 round(SUM(r.fat_g*m.servings_planned),2) fat_g
FROM meal_plans p JOIN meal_plan_recipes m USING(plan_id) JOIN recipes r USING(recipe_id)
GROUP BY p.plan_id,p.user_id,m.meal_date;

-- In the app, quantities and shopping totals are standardized to grams.
CREATE VIEW meal_plan_shopping_list AS
SELECT p.plan_id,p.user_id,i.ingredient_id,i.name ingredient,ri.unit,
 round(SUM(ri.quantity*m.servings_planned/r.servings),2) quantity
FROM meal_plans p JOIN meal_plan_recipes m USING(plan_id) JOIN recipes r USING(recipe_id)
JOIN recipe_ingredients ri USING(recipe_id) JOIN ingredients i USING(ingredient_id)
GROUP BY p.plan_id,p.user_id,i.ingredient_id,ri.unit;

CREATE TRIGGER recipe_steps_insert BEFORE INSERT ON recipes
WHEN json_valid(NEW.instructions) AND EXISTS(SELECT 1 FROM json_each(NEW.instructions) WHERE type<>'text' OR length(trim(value))=0 OR length(value)>2000) BEGIN
  SELECT RAISE(ABORT,'Instructions must contain nonempty text steps of at most 2000 characters');
END;
CREATE TRIGGER recipe_steps_update BEFORE UPDATE OF instructions ON recipes
WHEN json_valid(NEW.instructions) AND EXISTS(SELECT 1 FROM json_each(NEW.instructions) WHERE type<>'text' OR length(trim(value))=0 OR length(value)>2000) BEGIN
  SELECT RAISE(ABORT,'Instructions must contain nonempty text steps of at most 2000 characters');
END;
