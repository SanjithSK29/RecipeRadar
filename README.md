# RecipeRadar

RecipeRadar is a full-stack recipe discovery and meal-planning application built as a DBMS Level 3 project. Its focus is the database: the schema, keys, referential integrity, constraints, triggers, views, SQL query set, migrations, authentication, role checks, and a persistent vector-search index are all part of the working application.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Run locally](#run-locally)
- [Database design](#database-design)
- [SQL work](#sql-work)
- [Vector database and RUD](#vector-database-and-rud)
- [Authentication and database roles](#authentication-and-database-roles)
- [API](#api)
- [Project evidence and report](#project-evidence-and-report)
- [Verification and limitations](#verification-and-limitations)

## Features

- Search and filter recipes by cuisine, diet, calories, ingredients, and flavor.
- Register and log in; save favorites, rate recipes, record allergies, and create meal plans.
- Scale nutrition and shopping-list quantities by planned servings.
- Submit recipes for admin review; administrators can approve/reject submissions and manage roles.
- Rank recipes by flavor similarity through a persistent 128-dimensional vector index.
- Safely migrate older local databases with a consistent backup and rollback on invalid data.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend and server/API | Next.js 16 App Router, React 19, TypeScript, Route Handlers |
| Relational database | SQLite 3.37+ STRICT tables, accessed with Node.js 24 `node:sqlite` |
| Vector database | SQLite JSON vector store by default; optional Qdrant service through Docker Compose |
| Authentication | Salted scrypt password hashes, random opaque session cookie, SHA-256 session-token hashes stored in SQLite |
| UI | React/CSS, Lucide icons |

SQLite is chosen for a reproducible, local, single-server academic application. It provides real relational constraints and transactions with no separate database service. Qdrant is optional for deployments that want a dedicated vector service; the default index works without Docker or an external account.

## Run locally

Requirements: Node.js 24 or newer (the application uses its built-in SQLite module).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app creates `data/reciperadar.sqlite` on first run, installs the current schema, and seeds demonstration recipes. The first empty database also creates these demonstration accounts:

- User: `demo@reciperadar.app` / `RecipeRadar123!`
- Admin: `admin@reciperadar.app` / `AdminRadar123!`

These are local demo credentials only. Do not expose them in a public deployment. The existing working database is not reset or re-seeded by code changes. To use a separate database file, set `DATABASE_PATH`.

Build and run the production server:

```bash
npm run build
npm start
```

Optional Qdrant backend (requires Docker):

```bash
docker compose up --build
```

The Compose configuration sets `QDRANT_URL` and persists Qdrant data in its named volume. Without `QDRANT_URL`, the app uses the local SQLite JSON-vector index.

## Database design

The implementation has **17 STRICT tables**: the 13 tables in the supplied modified relational model, plus `ingredient_allergens` (precise many-to-many allergy mapping), `sessions` (authentication), `vector_sync_outbox` (durable vector updates/deletions), and `vector_documents` (local vector records).

- Primary keys identify every row. Join tables use composite keys; foreign keys explicitly define delete behavior.
- `NOT NULL`, `UNIQUE`, `CHECK`, JSON/date validation, and foreign-key constraints protect data even when writes bypass the interface.
- Triggers maintain the derived recipe rating and ingredient allergen caches and ensure meal dates remain inside a plan's range.
- Views expose ingredient allergen details, per-day nutrition, and scaled shopping lists.
- Transactions group recipe edits, profile changes, plan creation, and vector outbox changes.
- The migration runner uses `PRAGMA user_version`, makes a consistent `VACUUM INTO` backup, copies data transactionally, recomputes derived values, checks row counts/FKs, and rolls back on failure.

### Diagrams and model notes

- ER overview image: [`docs/figures/er-diagram.png`](docs/figures/er-diagram.png)
- Editable draw.io model: [`docs/figures/reciperadar-erd.drawio`](docs/figures/reciperadar-erd.drawio)
- Light-background relational schema: [`docs/figures/relational-schema.png`](docs/figures/relational-schema.png)
- Source PDF attribute contract: [`db/model-contract.json`](db/model-contract.json)
- Detailed source-to-implementation reconciliation and constraints: [`docs/database-audit.md`](docs/database-audit.md)

The ER diagram has associative/weak entities `user_allergens`, `ingredient_allergens`, `recipe_ingredients`, `ratings`, `favorites`, and `meal_plan_recipes`. `favorites` is in the supplied relational model but omitted from its ER drawing; this project retains it. The meal-plan recipe key is `(plan_id, meal_date, meal_type)` so a slot cannot hold multiple recipes and a recipe can recur on another date. The exact deliberate differences are documented in the audit.

The canonical DDL is [`db/schema.sql`](db/schema.sql). Database version 4 is implemented in [`lib/migrations.ts`](lib/migrations.ts). Live data and backups are local, ignored files under `data/`; they are not committed to Git.

## SQL work

[`db/queries.sql`](db/queries.sql) contains runnable examples of:

- Multi-table joins and aggregate queries
- Correlated `NOT EXISTS` queries for allergy-aware filtering
- Shopping-list and meal nutrition queries
- A standard CTE and a recursive CTE that generates dates in a meal plan
- SQL UDFs for portion calories and flavor descriptor similarity
- Transaction-wrapped insert, update, and delete examples

The schema defines integrity triggers and three read views. SQLite does not implement SQL stored-procedure DDL. The corresponding multi-step transactional operations are implemented as server functions in `lib/db.ts` and the API Route Handler; the two SQLite UDFs are registered per application connection. The report calls out this engine-specific limitation rather than claiming a native stored procedure.

Useful commands:

```bash
npm run db:audit
npm run db:audit -- docs/database-verification.json
npm run db:backup
```

## Vector database and RUD

The vector index stores one normalized 128-number embedding and JSON recipe payload per approved recipe. Recipe title, description, cuisine, diet, meal type, ingredient names, and curated flavor tags are embedded with a deterministic feature-hashing function and synonym map. Search ranks stored vectors with cosine similarity. This is an explainable baseline, not a trained language model.

The default SQLite backend stores embeddings in `vector_documents` and uses JSON validity/length constraints. The optional Qdrant backend stores the same IDs, vectors, and payloads in collection `reciperadar_recipes` (cosine distance). The transactional `vector_sync_outbox` makes recipe changes durable before the index is updated. A synchronization failure is retained with an attempt count and error for later retry.

The API supports vector create/update, read, search, and delete operations at `POST /api/vector` (`action` values: `upsert`, `read`, `search`, `delete`); GET returns backend/index status. Approved recipe writes enqueue and synchronize an upsert; recipe deletion queues a tombstone; admin approval indexes the recipe. User-created unapproved drafts are excluded from public search.

To inspect index rows in SQLite:

```sql
SELECT recipe_id, json_array_length(embedding) AS dimensions, json_extract(payload,'$.title') AS title
FROM vector_documents ORDER BY recipe_id;
```

## Authentication and database roles

The database `users.role` column constrains values to `user` or `admin`. Registration always creates a `user`; API handlers independently check the authenticated session's role before moderation and role-management operations. Recipe ownership is also checked server-side. The last admin cannot be demoted through the application. Session cookies are HTTP-only, same-site, and contain a random token whose SHA-256 hash alone is stored in the `sessions` table.

For an existing local account, a database owner may deliberately grant admin access with:

```bash
npm run db:promote-admin -- your-email@example.com
```

Run that command only for the account you personally intend to make an administrator. This operation changes authorization privileges. A fresh database instead has the demonstration admin listed above.

## API

All write routes accept JSON and return `{ "ok": true }` or `{ "error": "..." }`. Private operations derive ownership from the session.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/bootstrap` | Recipes, lookups, current account |
| POST | `/api/auth` | Register, log in, log out |
| POST | `/api/profile` | Profile, calorie target, allergy preferences |
| POST | `/api/favorite` | Toggle a favorite |
| POST | `/api/recipe` | Submit or update an owned recipe |
| POST | `/api/recipe-delete` | Delete an owned recipe |
| POST | `/api/rating` | Add/update a 1–5 rating and review |
| GET | `/api/reviews/:id` | Public recipe reviews |
| GET | `/api/substitutions` | Ingredient substitutions and allergy conflicts |
| GET | `/api/plans` | Current account's meal plans |
| POST | `/api/plan` | Generate a meal plan |
| POST | `/api/plan-delete` | Delete an owned plan |
| GET/POST | `/api/vector` | Index status and vector RUD/search |
| GET | `/api/admin/recipes` | Admin-only pending recipes and account list |
| POST | `/api/admin/review` | Admin-only recipe approval/rejection |
| POST | `/api/admin/role` | Admin-only role assignment |

## Project evidence and report

The complete submission report and its evidence are in `docs/`. It includes the problem statement, requirements and technology rationale, entity and non-simple attribute lists, both data-model diagrams, SQL DDL/DML, vector commands, populated result tables, application screenshots, project tree, and a criterion-by-criterion rubric status. Start at [`docs/RecipeRadar_DBMS_Project_Report.docx`](docs/RecipeRadar_DBMS_Project_Report.docx) and use the artifacts it references.

## Verification and limitations

The database audit writes a privacy-safe point-in-time result to [`docs/database-verification.json`](docs/database-verification.json). Run it again after changing local data. `npm run build` validates the production frontend and server compilation; `npm test` and `npm run test:api` are also available for the automated schema and API suites.

This is an academic local application. Nutrition and sample recipes are illustrative; allergen checks cover only explicitly mapped ingredients and cannot detect package warnings or cross-contact. Flavor vectors use curated tags and deterministic feature hashing, not a trained semantic model. SQLite is not a multi-server database and does not supply native stored-procedure DDL. A production release would need secret rotation, password recovery, rate limiting, operational monitoring, and a deployment database plan.
