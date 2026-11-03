-- RecipeRadar migration 003: full-text search, added with ALTER TABLE.
-- Demonstrates ALTER (generated column), CREATE INDEX (GIN) and a search function.

ALTER TABLE recipes
  ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(flavor, '')), 'C')
  ) STORED;

CREATE INDEX idx_recipes_search ON recipes USING GIN (search_vector);

-- Ranked full-text search over approved recipes.
CREATE FUNCTION fn_search_recipes(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (recipe_id INTEGER, title TEXT, rank REAL)
LANGUAGE sql STABLE AS $$
  SELECT r.recipe_id, r.title, ts_rank(r.search_vector, q) AS rank
  FROM recipes r, websearch_to_tsquery('english', p_query) AS q
  WHERE r.is_approved AND r.search_vector @@ q
  ORDER BY rank DESC, r.recipe_id
  LIMIT greatest(p_limit, 1)
$$;
