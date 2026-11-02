# RecipeRadar database audit and diagram reconciliation

Audited against the **modified relational model (PDF page 2)** and **ER diagram (PDF page 3)** on 2 November 2026. The modified relational model is the structural reference where the two drawings differ. The initial handwritten model is a superseded draft, not a second schema to implement simultaneously.

## Verdict

The implementation preserves **all 13 named domain tables, every displayed attribute, and all 16 domain foreign-key relationships** from the modified relational model. It is **not an identical DDL transcription**: the engine, some constraints, a meal-entry key, fractional planned servings, and small supporting extensions differ intentionally. A database cannot honestly be certified to have “no flaws”; the report records the concrete rules enforced and tests performed.

The first implementation had database-level gaps. Version 2 fixes them and upgrades the existing database transactionally with a consistent backup.

## Table-by-table mapping

`db/model-contract.json` records every source attribute. Automated tests check every listed table, attribute and foreign-key edge against SQLite's schema metadata.

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

1. **SQLite engine.** The diagram's VARCHAR/DECIMAL/BOOLEAN/DATE/TIMESTAMP labels are expressed with SQLite STRICT-compatible INTEGER/REAL/TEXT plus explicit constraints. VARCHAR lengths, integer domains, boolean values and date validity are enforced rather than relying on SQLite type labels. REAL is binary floating point, not an exact fixed-point DECIMAL implementation; round-to-two-decimal checks constrain inputs. If a course requires a specific DBMS such as MySQL or PostgreSQL, this implementation needs an explicit port and cannot be submitted as that engine.
2. **Meal-entry key.** The drawing marks `(plan_id, recipe_id)` as a composite key. That prevents a recipe appearing twice in one week and does not stop two different recipes occupying the same slot. The implementation uses `(plan_id, meal_date, meal_type)` to enforce one entry per slot and permit repeated recipes. Include this change in a revised diagram when submitting the implemented design.
3. **Fractional planned servings.** The source shows INTEGER; the implementation stores positive REAL values to two decimal places. This permits 1.25 servings when scaling calories. Base recipe `servings` remains an integer.
4. **Ingredient-allergen mapping.** Added `ingredient_allergens(ingredient_id, allergen_id)`. An ingredient boolean alone cannot distinguish milk from peanuts or represent multiple allergens. Both FK columns are NOT NULL; the composite key prevents duplicates.
5. **Sessions.** Added `sessions(token, user_id, expires_at)` for login state. Only a SHA-256 hash of each random opaque cookie token is stored. This is an infrastructure table, not an invented food-domain entity.
6. **Display/planning attributes.** Added recipe image, flavor descriptors and meal_type, plus ingredient flavor. Source attributes remain intact.
7. **Stronger required values.** Some attributes drawn as nullable (for example recipe cuisine/diet/nutrition) are required for this application's filtering and planning. These are stricter application domain decisions, not exact nullability copies.
8. **ER drawing mismatch.** `favorites` appears in the modified relational model but is absent from the displayed ER drawing; it is implemented. The ER drawing appears to label one recipe-ingredient key `user_id`; the relational model correctly uses `recipe_id`. The implementation follows `recipe_id -> recipes.recipe_id`.
9. **Derived caches retained.** `avg_rating` and `is_common_allergen` are retained to match source attributes, but SQL triggers derive them from ratings and allergen mappings. Direct inconsistent edits are rejected.

## Integrity enforced inside the database

- All 15 tables are STRICT. Composite keys and required foreign keys explicitly prohibit NULLs.
- All foreign keys use explicit deletion policies. Recipe ingredients, reviews and favorites cascade when their recipe is deleted; a recipe used in a plan is restricted from deletion. Lookup rows in use cannot be removed. Deleting a user who still owns recipes is restricted.
- CHECK constraints validate nonempty names, displayed VARCHAR lengths, role/severity values, boolean domains, ratings, quantities, nutrition precision/ranges, nonnegative view counts and times, valid JSON cooking steps and calendar dates.
- A meal entry must fall within its plan. Updates to meals and plan ranges enforce the same rule.
- Rating INSERT, UPDATE and DELETE triggers maintain rounded averages. Reassigning a rating updates both old and new recipes. Cache edits cannot manufacture a rating.
- Mapping INSERT, UPDATE and DELETE triggers maintain allergen flags, including moving a mapping between ingredients.
- Thirteen explicit secondary indexes support foreign-key child lookups, filters and session cleanup, in addition to automatic primary/unique indexes.
- SQL views expose ingredient-level allergens, daily nutrition totals and shopping quantities. Shopping quantities divide full-recipe quantities by base recipe servings before scaling planned portions; units are grouped separately.
- Multi-table recipe writes, profile edits and plan generation run in transactions. Ownership is enforced by the API from authenticated sessions; database foreign keys alone are not per-user authorization.

## Migration and recovery

`lib/migrations.ts` tracks the schema with `PRAGMA user_version = 2`. A v1 upgrade:

1. Rejects unexpected tables/schema objects rather than deleting unknown data.
2. Saves a consistent `VACUUM INTO` backup under the database's `backups/` directory, including committed WAL contents.
3. Acquires a write transaction, copies all known table rows, rebuilds the schema and restores every row. Derived caches are recomputed from their source records.
4. Verifies per-table row counts and foreign keys, then commits the schema version.
5. On invalid legacy data, rolls back and retains the original database; the error identifies the backup. It never silently drops invalid records.

The original v1 DDL is preserved in `db/migrations/001-original.sql`. Do not apply that file to the current database.

```bash
npm run db:audit
npm run db:backup
npm test
```

The backup command uses SQLite's online backup API. Do not copy only the main `.sqlite` file while the application is running: committed transactions may still be in `-wal`. To inspect data, use a SQLite-aware client. To restore, stop all application processes, retain the current database and its sidecars, and restore a complete consistent snapshot before restarting; do not swap the file under live connections.

## Verification and remaining boundaries

`tests/database.test.ts` writes directly through SQL to verify constraints, triggers, cascades, views and diagram correspondence. `tests/migrations.test.ts` verifies fresh setup, idempotence, preserving legacy data, independent backup readability, rollback on invalid data and refusal to downgrade newer schemas. `tests/api-smoke.mjs` exercises accounts, authorization, recipe CRUD and allergen-aware planning through HTTP.

`docs/database-verification.json` is a point-in-time audit of the actual local database, with row counts and pass/fail checks. It contains no names, emails, passwords or session tokens. Re-run it after data changes:

```bash
npm run db:audit -- docs/database-verification.json
```

Remaining boundaries to understand and explain:

- SQL schema diagrams do not specify a trained semantic recommendation algorithm, clinical nutrition accuracy, admin screens or load guarantees. Curated flavor descriptors and sample nutrition remain demonstration data.
- Historical plan entries reference live recipes, as in the source model. Recipe edits change their displayed nutrition and shopping totals. Plans are not immutable nutrition snapshots.
- Allergen exclusion reflects mapped ingredients and the user's preferences when a plan is generated. Changing preferences, mappings or recipes can make an older plan unsuitable; regenerate it. There is no product-label or cross-contact inference.
- A parent recipe can exist without child ingredients via direct SQL; SQLite has no deferred cross-table assertion enforcing “at least one child at commit.” The application validates and inserts ingredients atomically, and `db:audit` detects empty recipes. It is misleading to claim every possible business invariant is a foreign-key constraint.
- Diet category follows the source's single `diet_id`; overlapping classifications (for example vegan AND high-protein) would require a separately agreed many-to-many redesign.
- STRICT validates lossless storage types, not the original textual representation. Numeric text that can be losslessly converted can be accepted by SQLite.
- SQLite is appropriate for a local single-server academic project. No large-scale concurrency benchmark, exact DECIMAL storage, MySQL compatibility or clinical validation is claimed.

Reference for SQLite's NULL-primary-key behavior and CHECK rules: [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html). STRICT type behavior: [SQLite STRICT tables](https://www.sqlite.org/stricttables.html).

## Recorded verification outcome

On 2 November 2026, all **60 schema/diagram/integrity/migration tests passed**. A production build and TypeScript validation completed successfully. The HTTP integration test passed against the production build on a separate port and a disposable database, leaving the user's live records untouched by that test run. The live database audit reported every recorded check as passing. This is evidence for the exercised rules, not a proof that every possible defect is absent.
