# RecipeRadar database audit and diagram reconciliation

Audited against the **modified relational model (PDF page 2)** and **ER diagram (PDF page 3)** on 2 November 2026. The modified relational model is the structural reference where the two drawings differ. The initial handwritten model is a superseded draft, not a second schema to implement simultaneously.

## Verdict

The implementation preserves **all 13 named domain tables, every displayed attribute, and all 16 domain foreign-key relationships** from the modified relational model. It is **not an identical DDL transcription**: some constraints, a meal-entry key, fractional planned servings, and small supporting extensions differ intentionally. A database cannot honestly be certified to have “no flaws”; the report records the concrete rules enforced and tests performed.

The first implementation ran on SQLite, which the course does not allow (PostgreSQL or MySQL is mandatory) and which lacks stored procedures and roles. It has been ported to PostgreSQL; the SQLite files are archived in `db/legacy-sqlite/`.

## Table-by-table mapping

`db/model-contract.json` records every source attribute. Automated checks compare these against the PostgreSQL catalog.

| Source table       | Implemented key                        | Foreign keys                   | Notes                                                                                            |
| ------------------ | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| users              | user_id                                | —                              | All 9 source attributes present; case-insensitive unique email; role, age and target constraints |
| allergens          | allergen_id                            | —                              | All source attributes; unique name; constrained severity                                         |
| user_allergens     | (user_id, allergen_id)                 | users, allergens               | Both key components explicitly NOT NULL                                                          |
| cuisines           | cuisine_id                             | —                              | Unique nonempty name                                                                             |
| dietary_types      | diet_id                                | —                              | Unique nonempty name                                                                             |
| ingredients        | ingredient_id                          | —                              | All source attributes; allergen boolean synchronized with mappings                               |
| recipes            | recipe_id                              | cuisines, dietary_types, users | All 18 source attributes; nutrition, time, servings and JSON-step checks                         |
| recipe_ingredients | (recipe_id, ingredient_id)             | recipes, ingredients           | Positive two-decimal quantity; unit required                                                     |
| ratings            | (user_id, recipe_id)                   | users, recipes                 | One integer rating (1–5) per user/recipe; bounded review                                         |
| favorites          | (user_id, recipe_id)                   | users, recipes                 | One favorite per user/recipe                                                                     |
| meal_plans         | plan_id                                | users                          | Valid ISO calendar dates; end >= start                                                           |
| meal_plan_recipes  | **(plan_id, meal_date, meal_type)**    | meal_plans, recipes            | Intentional key change; valid in-range date and positive fractional servings                     |
| substitutions      | (ingredient_id_from, ingredient_id_to) | ingredients twice              | Score 0–1; self-substitution prohibited; direction retained                                      |

## Intentional differences and drawing ambiguities

1. **Types.** The diagram's VARCHAR/DECIMAL/BOOLEAN/DATE/TIMESTAMP labels map to TEXT with length checks, `NUMERIC(p,s)`, `BOOLEAN`, `DATE` and `TIMESTAMPTZ`; money-like nutrition and quantity values are exact decimals.
2. **Meal-entry key.** The drawing marks `(plan_id, recipe_id)` as a composite key. That prevents a recipe appearing twice in one week and does not stop two recipes occupying one slot. The implementation uses `(plan_id, meal_date, meal_type)`.
3. **Fractional planned servings.** `servings_planned` is `NUMERIC(6,2)` (the source shows INTEGER) so 1.25 servings can scale calories; base recipe `servings` stays an integer.
4. **Ingredient-allergen mapping.** Added `ingredient_allergens(ingredient_id, allergen_id)`; a boolean alone cannot say *which* allergen an ingredient contains.
5. **Support tables.** `sessions` (hashed cookie tokens), `vector_documents` / `vector_sync_outbox` (vector index and durable sync queue) and `audit_log` (trigger-written trail of role and moderation changes) are infrastructure, not invented food-domain entities.
6. **Display/planning attributes.** Added recipe `image`, `flavor`, `meal_type`, a generated `search_vector` (full-text), and ingredient `flavor`. Source attributes remain intact.
7. **Stronger required values.** Some attributes drawn as nullable (recipe cuisine/diet/nutrition) are required for filtering and planning.
8. **New recipes default to unapproved** (`is_approved DEFAULT false`); only an administrator can approve.
9. **ER drawing mismatch.** `favorites` appears in the relational model but not the ER drawing, and one recipe-ingredient key is labelled `user_id` there; the implementation follows `recipe_id`.
10. **Derived caches retained.** `avg_rating` and `is_common_allergen` match the source but are derived by triggers; direct inconsistent edits are rejected.

## Integrity enforced inside the database

- Composite keys and required foreign keys are NOT NULL; every foreign key has an explicit delete policy (cascade for owned rows, restrict for lookups, plan recipes and recipe authors).
- CHECK constraints validate names, lengths, enumerations, ratings, quantities, nutrition ranges, calendar ranges, JSON cooking steps (trigger) and vector dimension.
- Triggers: rating averages (insert/update/delete), allergen flags, meal dates inside plan ranges, plans that cannot shrink past meals, last-administrator protection, audit logging.
- Views: allergen details, daily nutrition, shopping list (serving-scaled), caller-only `my_profile`; the first three use `security_invoker` so row-level security applies.
- Multi-table writes (recipe edits, profile changes, plan generation, outbox changes) run in transactions; each API request is one transaction.

## Authorization enforced by the database

Roles `rr_guest`, `rr_user`, `rr_admin` (group roles) and the `rr_app` login role; `REVOKE ALL ... FROM PUBLIC` first, then explicit `GRANT`s, column-level grants (users cannot update `role`; only admins can update `is_approved`) and 23 row-level security policies (`pg_policies`). Tests prove a user cannot self-promote, approve recipes, read another user's favorites or plans, or generate a plan for someone else, and that `rr_app` reaches only `users` and `sessions` until it switches role.

## Migration and recovery

Versioned SQL files in `db/migrations/` are applied in order by `scripts/migrate.mjs` (each in a transaction, recorded in `schema_migrations`). `npm run db:backup` takes a `pg_dump`. Moving existing SQLite data is not automated: the SQLite database held demonstration data only.
