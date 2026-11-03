from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
OUT = DOCS / 'RecipeRadar_DBMS_Project_Report.docx'
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.62); sec.bottom_margin = Inches(.62)
sec.left_margin = Inches(.72); sec.right_margin = Inches(.72)
sec.header_distance = Inches(.28); sec.footer_distance = Inches(.3)

NAVY = '244B3A'; GREEN = '315B46'; PALE = 'EAF0E6'; WHITE = 'FFFFFF'; INK = '24352B'; MUTED = '637267'
styles = doc.styles
styles['Normal'].font.name = 'Aptos'; styles['Normal'].font.size = Pt(9.5); styles['Normal'].font.color.rgb = RGBColor.from_string(INK)
styles['Normal'].paragraph_format.space_after = Pt(4)
for name, size in [('Title',31),('Heading 1',21),('Heading 2',13),('Heading 3',10)]:
    st=styles[name]; st.font.name='Aptos Display' if name in ('Title','Heading 1') else 'Aptos'; st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=RGBColor.from_string(NAVY); st.paragraph_format.space_before=Pt(7);st.paragraph_format.space_after=Pt(5)

# Running header and page-number field
header = sec.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r=header.add_run('RECIPERADAR  |  DBMS LEVEL 3 PROJECT'); r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string(MUTED)
footer = sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=footer.add_run('RecipeRadar Database Project  •  ');r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string(MUTED)
fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');footer._p.append(fld)

def shade(cell, color):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd');shd.set(qn('w:fill'),color);tcPr.append(shd)

def set_cell(cell, text, bold=False, color=INK, size=8.5):
    cell.text=''
    p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(1);p.paragraph_format.space_before=Pt(1)
    r=p.add_run(str(text));r.bold=bold;r.font.name='Aptos';r.font.size=Pt(size);r.font.color.rgb=RGBColor.from_string(color)
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER

def table(headers, rows, widths=None, font=8.3):
    t=doc.add_table(rows=1, cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.style='Table Grid';t.autofit=False
    for i,h in enumerate(headers):set_cell(t.rows[0].cells[i],h,True,WHITE,font);shade(t.rows[0].cells[i],GREEN)
    for n,row in enumerate(rows):
        cells=t.add_row().cells
        for i,value in enumerate(row):set_cell(cells[i],value,False,INK,font);shade(cells[i], 'F3F6F1' if n%2==0 else WHITE)
    if widths:
        for row in t.rows:
            for i,w in enumerate(widths): row.cells[i].width=Inches(w)
    doc.add_paragraph().paragraph_format.space_after=Pt(0)
    return t

def para(text='', boldlead=None, italic=False):
    p=doc.add_paragraph();p.paragraph_format.keep_together=True
    if boldlead and text.startswith(boldlead):
        p.add_run(boldlead).bold=True;p.add_run(text[len(boldlead):])
    else:
        r=p.add_run(text);r.italic=italic
    return p

def bullets(items, level=0):
    for item in items:
        p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2');p.paragraph_format.space_after=Pt(2);p.paragraph_format.keep_together=True;p.add_run(item)

def heading(text, level=1):
    doc.add_heading(text,level=level)

def image(path, width=6.85, caption=None):
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_after=Pt(2);p.add_run().add_picture(str(DOCS/path),width=Inches(width))
    if caption:
        c=doc.add_paragraph(caption);c.alignment=WD_ALIGN_PARAGRAPH.CENTER;c.paragraph_format.space_after=Pt(4)
        for r in c.runs:r.italic=True;r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string(MUTED)

def code(text, size=8):
    p=doc.add_paragraph();p.paragraph_format.left_indent=Inches(.13);p.paragraph_format.right_indent=Inches(.13);p.paragraph_format.space_before=Pt(2);p.paragraph_format.space_after=Pt(5)
    pPr=p._p.get_or_add_pPr();shd=OxmlElement('w:shd');shd.set(qn('w:fill'),'F0F3EF');pPr.append(shd)
    r=p.add_run(text);r.font.name='Consolas';r.font.size=Pt(size);r.font.color.rgb=RGBColor.from_string('26372D')

def page(): doc.add_page_break()

# Cover
p=doc.add_paragraph();p.paragraph_format.space_before=Pt(85);p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p.add_run('RecipeRadar');r.bold=True;r.font.size=Pt(37);r.font.color.rgb=RGBColor.from_string(NAVY)
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p.add_run('DBMS Level 3 Laboratory Project');r.font.size=Pt(20);r.font.color.rgb=RGBColor.from_string(GREEN)
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_before=Pt(18)
r=p.add_run('A database-centered recipe discovery and meal-planning application');r.font.size=Pt(13);r.font.color.rgb=RGBColor.from_string(MUTED)
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_before=Pt(32)
r=p.add_run('Prepared for PES1UG24AM270  ·  PES1UG24AM250');r.font.size=Pt(12);r.bold=True
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
p.add_run('Next.js 16  ·  PostgreSQL  ·  TypeScript  ·  In-database vector search (optional Qdrant)').font.size=Pt(10)
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_before=Pt(90)
r=p.add_run('Submission report and implementation evidence');r.font.size=Pt(11);r.font.color.rgb=RGBColor.from_string(MUTED)
page()

# Table of contents
heading('Table of Contents')
toc=[('1','Introduction and Problem Statement','3'),('2','User Requirements and Technology Stack','4'),('3','Entity Relationship Model','5–6'),('4','Relational Model','7–8'),('5','SQL DDL Statements','9'),('6','SQL DML Statements','10–11'),('7','NoSQL and Vector Database Commands','12'),('8','Results (incl. roles, RLS and testing)','13–15'),('9','Next.js Project Tree Structure','16'),('10','Application Code and Demo Screenshots','17–18'),('11','Evaluation Rubrics and Completion Status','19')]
table(['Sl. No.','Topic','Page'],toc,[.72,5.1,.65],9)
para('Artifact map',boldlead='Artifact map')
bullets(['Editable ERD: docs/figures/reciperadar-erd.drawio','SQL source: db/migrations/*.sql (DDL, routines, roles) and db/queries.sql','Live database audit: docs/database-verification.json','Screenshots: docs/screenshots/','Detailed attribute reconciliation: docs/database-audit.md'])
para('Page numbers refer to this rendered report. Figures and tables are sourced from the checked-in project files or a live PostgreSQL database.',italic=True)
page()

# 1
heading('1 Introduction and Problem Statement')
heading('Introduction',2)
para('RecipeRadar helps people discover recipes that fit their tastes, ingredients, cuisine, dietary category, calorie goals, and recorded allergies. It also lets a signed-in user save favorites, submit ratings, and generate date-bounded meal plans with scaled nutrition and shopping lists.')
heading('Problem Statement',2)
para('Recipe discovery data is often fragmented across recipes, ingredient lists, diet labels, user preferences, reviews, and weekly plans. Duplicated or weakly validated records can produce orphan ingredients, inconsistent rating averages, unsafe allergy matches, or incorrect meal totals. RecipeRadar centralizes these related records in a constrained relational database and exposes a Next.js interface and API that use the same database rules.')
heading('Database objectives',2)
bullets(['Represent recipe, ingredient, cuisine, diet, user, allergy, review, favorite, substitution, and meal-plan data with keys and relationships.','Enforce valid values, ownership, referential integrity, and derived values at the database or authenticated API boundary.','Demonstrate SQL joins, nested and recursive queries, transactions, triggers, views, user-defined functions, and a persistent vector-search feature.'])
para('Scope note: this is a local academic demonstration. Nutrition values and allergy coverage are illustrative and should not be treated as clinical guidance.')
page()

# 2
heading('2 User Requirements and Technology Stack')
table(['Role','Requirements'],[
 ('Visitor','Browse approved recipes; search and filter by cuisine, diet, time, calories, ingredients, and flavor.'),
 ('Registered user','Register/login; manage preferences and allergens; save favorites; submit ratings; create and delete meal plans; create recipe drafts.'),
 ('Administrator','Review and approve/reject submitted recipes; manage account roles; inspect vector-index status.'),
], [1.45,5.05],9)
heading('Technology choices',2)
table(['Layer','Technology','Database rationale'],[
 ('Frontend/API','Next.js 16 App Router, React 19, TypeScript','One TypeScript application with server-side Route Handlers and persistent server runtime.'),
 ('Relational store','PostgreSQL 15+ (node-postgres)','Mandatory SQL engine for the course: keys, transactions, PL/pgSQL triggers/functions/procedures, views, CTEs, full-text search, roles, GRANT/REVOKE and row-level security.'),
 ('Vector store','float8[128] vectors in PostgreSQL; optional Qdrant','Embeddings live beside the relational data they describe; cosine ranking runs in SQL (fn_search_vectors); an outbox keeps an optional Qdrant service in sync.'),
 ('Authentication','scrypt hashes and opaque cookie sessions','Only password hashes and hashed session-token identifiers are stored. Each request then runs under a least-privilege database role.'),
], [.95,2.35,3.25],8)
heading('User-facing quality requirements',2)
bullets(['Private operations check the authenticated session and record ownership on the server.','Foreign keys and transactions protect writes even when the UI is bypassed.','Authorization is enforced by PostgreSQL itself: GRANT/REVOKE, column-level privileges and row-level security policies for the roles rr_guest, rr_user and rr_admin.'])
para('Run locally: start PostgreSQL, copy .env.example to .env.local, run npm install, npm run db:setup, then npm run dev. Open http://localhost:3000. Setup applies the versioned migrations and seeds demonstration data only into an empty database.')
page()

# 3 first page
heading('3 Entity Relationship Model')
heading('Entities',2)
table(['Entity','Role / key'],[
 ('users','Strong entity; user_id'),('allergens','Strong entity; allergen_id'),('cuisines','Strong entity; cuisine_id'),('dietary_types','Strong entity; diet_id'),('ingredients','Strong entity; ingredient_id'),('recipes','Strong entity; recipe_id'),('meal_plans','Strong entity; plan_id'),('substitutions','Recursive relationship; ingredient_id_from + ingredient_id_to'),
 ('user_allergens','Weak/associative; user_id + allergen_id'),('ingredient_allergens','Weak/associative extension; ingredient_id + allergen_id'),('recipe_ingredients','Weak/associative; recipe_id + ingredient_id'),('ratings','Associative; user_id + recipe_id'),('favorites','Associative; user_id + recipe_id'),('meal_plan_recipes','Weak/associative; plan_id + meal_date + meal_type'),('sessions','Authentication-support entity; token'),('audit_log','Trigger-written audit trail of role and moderation changes'),
], [2.05,4.45],8.2)
heading('Non-simple and composite attributes',2)
bullets(['Recipe instructions are an ordered JSON array of cooking steps rather than a single simple value.','Recipe flavor descriptors and ingredient flavor descriptors support multi-term discovery and vectorization.','Recipe nutrition is grouped into calories, protein, carbohydrates, and fat; meal totals are derived by plan date and servings.','Recipe ingredients carry quantity and unit as relationship attributes on the recipe–ingredient association.','User allergy preferences and ingredient allergen mappings are many-to-many sets, not comma-separated text.'])
para('The weak/associative structures use composite keys and explicit non-null foreign keys. The ER overview marks them with double borders. Favorites appears in the supplied relational model even though it is absent from the supplied ER drawing; the implementation retains it.')
page()
heading('Entity Relationship Diagram Snapshot')
image(Path('figures/er-diagram.png'),6.8,'Figure 1. RecipeRadar ER overview. Double-bordered boxes are weak or associative structures; the editable draw.io source is provided separately.')
para('The diagram shows the source domain and the ingredient-allergen and session extensions. The outbox and vector-document storage tables are implementation support structures and are shown in the relational schema instead of the conceptual food-domain ER overview.')

# 4
page();heading('4 Relational Model')
heading('Relations added beyond the source ER entities',2)
bullets(['ingredient_allergens(ingredient_id, allergen_id) resolves which named allergen each ingredient contains.','sessions(token, user_id, expires_at) supports authenticated sessions without storing raw cookie tokens.','vector_sync_outbox(outbox_id, recipe_id, operation, payload, attempts, last_error, created_at) durably queues index updates and delete tombstones.','vector_documents(recipe_id, embedding float8[128], payload jsonb, updated_at) stores the vector index inside PostgreSQL, with dimension and JSON-type checks.','audit_log(audit_id, table_name, record_id, action, old_value, new_value, actor_user_id, db_role, changed_at) is written by triggers when a role or recipe approval changes.'])
heading('Keys and constraints',2)
para('All source relations and their displayed attributes are retained. Join relations use composite primary keys; recipe foreign keys connect cuisine, diet, and creator. The meal entry key is (plan_id, meal_date, meal_type), enforcing one recipe per plan slot while allowing the same recipe on different dates. The substitutions relation references ingredients twice with directional roles.')
para('The implemented schema strengthens nullability, validates lengths and domains, checks recipe-step JSON, verifies calendar dates, and declares explicit delete behavior. Rating averages and allergen flags are trigger-maintained derived attributes. The last administrator cannot be demoted (trigger).')
page();heading('Relational Schema Diagram')
image(Path('figures/relational-schema.png'),6.9,'Figure 2. Complete light-background relational schema. PK and FK marks appear on each key component; all 18 tables are included.')
para('The diagram is generated from PostgreSQL catalog metadata by scripts/generate-diagrams.py. The editable ER model is docs/figures/reciperadar-erd.drawio; the exact PDF-to-schema mapping and deliberate differences are documented in docs/database-audit.md.')

# 5
page();heading('5 SQL DDL Statements')
para('The canonical SQL DDL is the versioned migration set in db/migrations: 001_schema.sql (tables, keys, constraints, indexes, triggers, views), 002_routines.sql (functions and the stored procedure), 003_full_text_search.sql (ALTER TABLE + GIN index) and 004_roles_and_security.sql (roles, GRANT/REVOKE, row-level security). npm run db:setup applies them in order and records each in schema_migrations.')
bullets(['18 tables with primary/foreign keys, composite keys, UNIQUE (case-insensitive via lower() indexes), NOT NULL, CHECK, NUMERIC(p,s), DATE/TIMESTAMPTZ, JSONB and float8[] columns, and 40+ indexes.','12 PL/pgSQL triggers maintain rating averages and allergen flags, bound meal dates to their plan, validate recipe steps, protect the last administrator and write the audit log.','Four views: recipe allergen details, daily meal-plan nutrition, serving-scaled shopping list and the caller-only my_profile.','ALTER TABLE adds a generated tsvector column with a GIN index (migration 003); DROP is used by the migration tests on a scratch table.','Roles rr_guest, rr_user, rr_admin and the rr_app login role with GRANT/REVOKE, column-level grants and 23 row-level security policies.'])
image(Path('screenshots/code-schema.png'),6.35,'Figure 3. DDL source excerpt from db/migrations/001_schema.sql showing keys, CHECK constraints and identity columns.')
para('The complete DDL, not only this excerpt, is part of the submission repository.')

# 6
page();heading('6 SQL DML Statements')
para('db/queries.sql (runnable with psql) contains 17 demonstrations: SELECT, INSERT, UPDATE, DELETE, joins, GROUP BY/HAVING, subqueries, correlated NOT EXISTS, a standard CTE, two recursive CTEs, a window function, function calls, full-text and vector search, and a role-based access demonstration.')
heading('Representative DML and query coverage',2)
bullets(['INSERT/UPDATE/DELETE run in a transaction that is rolled back, so sample data is unchanged.','Correlated NOT EXISTS excludes recipes containing allergens recorded by a user (also packaged as fn_safe_recipes).','A recursive CTE follows chains of ingredient substitutions (for example Chicken → Tofu → Lentils) with a depth limit and cycle guard; another generates all dates in a plan.','A standard CTE joins active plans to the daily-nutrition view; a window function ranks recipes by calories within each meal type.'])
heading('Stored procedure, functions and triggers',2)
para('sp_generate_meal_plan(user, start_date) is a PL/pgSQL stored procedure: it reads the caller’s diet goal and calorie target, filters out allergen conflicts, picks the recipes closest to one third of the daily target for each meal type and inserts 21 meal rows. It runs as the calling role, so privileges and row-level security still apply. Functions: fn_portion_calories, fn_flavor_similarity, fn_cosine_similarity, fn_search_vectors, fn_recipe_allergens, fn_safe_recipes, fn_search_recipes (full-text) and fn_rate_recipe.')
image(Path('screenshots/code-procedure.png'),6.15,'Figure 4a. Stored procedure sp_generate_meal_plan.')
image(Path('screenshots/code-queries.png'),6.15,'Figure 4b. SQL example source excerpt from db/queries.sql.')

# 7
page();heading('7 NoSQL and Vector Database Commands')
para('Each approved recipe has a normalized 128-dimensional vector and JSON payload. Text combines title, description, cuisine, diet, meal type, ingredients, and curated flavor terms. A deterministic hash embedding with a small synonym map supports reproducible cosine-similarity ranking; it is a baseline feature-hashing method, not a trained model.')
heading('Persistence and update flow',2)
bullets(['Default backend: vector_documents stores a float8[128] embedding and JSONB payload in PostgreSQL (CHECK: one-dimensional, 128 values). fn_search_vectors(query, k) ranks by cosine similarity inside the database.','Optional dedicated backend: set QDRANT_URL to use a Qdrant collection (cosine distance) kept in sync through the same outbox.','vector_sync_outbox records recipe upserts and deletion tombstones in the same transaction as the recipe change. Failed Qdrant writes retain their attempt count and error for retry.','Only approved recipes are discoverable; user drafts remain private until an administrator approves them.','Embedding method: deterministic feature hashing of title, description, cuisine, diet, meal type, ingredients and flavor tags (SHA-256 token hashing into 128 signed buckets, L2-normalised) with a small synonym map. Metric: cosine similarity.'])
heading('Vector RUD and search commands',2)
code('POST /api/vector  {"action":"upsert","recipe_id":3}\nPOST /api/vector  {"action":"read","recipe_id":3}\nPOST /api/vector  {"action":"search","query":"creamy bright citrus","limit":8}\nPOST /api/vector  {"action":"delete","recipe_id":3}\nGET  /api/vector  → backend, indexed count, and pending outbox count',7.4)
para('Direct SQL: SELECT * FROM fn_search_vectors(ARRAY[...128 floats...]::float8[], 5);   SELECT recipe_id, cardinality(embedding), payload->>\'title\' FROM vector_documents;   Full-text: SELECT * FROM fn_search_recipes(\'creamy coconut\');')
image(Path('screenshots/resulting-vector-index.png'),6.6,'Figure 5. Vector-document rows in PostgreSQL: 12 approved recipes, each with 128 values and JSONB metadata.')

# 8
page();heading('8 Results')
para('The database was created with npm run db:setup on PostgreSQL. The audit (npm run db:audit, docs/database-verification.json) checks that rating and allergen caches match their sources, meal dates fall inside plan ranges, every recipe has ingredients, emails are unique case-insensitively, there are no self-substitutions, at least one administrator exists, every approved recipe is indexed and row-level security is enabled on all user-data tables.')
image(Path('screenshots/resulting-recipes.png'),6.6,'Figure 6. Join query output from PostgreSQL showing the 12 approved recipes.')
heading('Roles and row-level security',2)
image(Path('screenshots/resulting-roles.png'),6.6,'Figure 7. Privilege matrix per database role (from has_table_privilege / has_any_column_privilege).')
image(Path('screenshots/resulting-policies.png'),6.6,'Figure 8. Row-level security policies from pg_policies.')
image(Path('screenshots/code-roles-rls.png'),6.25,'Figure 9. GRANT statements and policies in db/migrations/004_roles_and_security.sql.')
heading('Testing results',2)
para('npm test runs 18 database tests against a real PostgreSQL server in a throwaway database: constraints, referential actions, every trigger, functions, the stored procedure, in-database vector search, full-text search, the DDL lifecycle, and the guest/user/admin/login role boundaries including row-level security. npm run test:api runs two HTTP suites against the running app: accounts, sessions, ownership, favorites, ratings, recipe CRUD, plan generation and deletion, moderation with audit, vector read/update/delete/search, full-text search and the last-administrator rule. All pass.')
image(Path('screenshots/test-results.png'),6.4,'Figure 10. Test output (docs/test-results.txt).')

# 9
page();heading('9 Next.js Project Tree Structure')
para('The complete source inventory is available in docs/project-tree.txt. Major implementation files:')
table(['Path','Purpose'],[
 ('app/page.tsx','Next.js client interface for discovery, search, plans, preferences, and admin studio.'),
 ('app/api/[...path]/route.ts','Authenticated API, validation, ownership, role checks, business writes, and vector operations.'),
 ('lib/db.ts','PostgreSQL pool, per-request role switching (SET LOCAL ROLE + rr.user_id), typed query helpers and savepoint transactions.'),
 ('lib/password.ts','Salted scrypt password hashing and verification.'),
 ('lib/vector.ts','Embeddings, in-database cosine search, optional Qdrant integration, synchronization outbox.'),
 ('db/migrations/','Versioned SQL: schema, routines, full-text search, roles and row-level security.'),
 ('db/queries.sql','Runnable SQL examples for DML, joins, nested queries, CTEs, procedures and roles.'),
 ('scripts/','Migration runner, seed data, setup, audit, pg_dump backup, diagram/evidence/report generation and admin provisioning.'),
 ('tests/','Database tests (real PostgreSQL) and HTTP API smoke tests.'),
 ('compose.yaml','PostgreSQL 17 + app; secrets come from .env.'),
 ('docs/figures/','ER overview, editable draw.io source, and relational diagram.'),
 ('docs/screenshots/','Application, code, and populated result evidence images.'),
], [2.15,4.35],8.1)
heading('Top-level tree',2)
code('app/  db/  docs/  lib/  scripts/  tests/\nDockerfile  compose.yaml  next.config.ts  package.json  tsconfig.json\nREADME.md  .env.example  db/migrations/  db/queries.sql  docs/RecipeRadar_DBMS_Project_Report.docx',8.2)
para('Credentials live only in environment variables (.env files are git-ignored; .env.example documents them).')

# 10
page();heading('10 Application Code and Demo Screenshots')
para('The application is a Next.js interface backed by Route Handlers and the PostgreSQL database described above. The screenshot shows database-backed recipe cards, filters, allergy toggle, meal planner, saved recipes, ingredient swaps, preferences, and vector flavor search navigation.')
image(Path('screenshots/application-home.png'),6.75,'Figure 11. RecipeRadar discovery screen with recipes loaded from the PostgreSQL-backed API.')
page();heading('Application Code and Role Based Access')
para('Authorization is layered. The API authenticates the session cookie, then runs the whole request in ONE transaction under a database role: rr_guest (anonymous, read-only), rr_user (signed in) or rr_admin (administrator). PostgreSQL enforces what each role can do with GRANT/REVOKE, column-level privileges (a user cannot update users.role or recipes.is_approved) and row-level security (a user sees and edits only their own favorites, ratings, allergies, plans and recipes; unapproved recipes are visible only to their author and administrators). The API additionally validates input and ownership, so a mistake in either layer is not enough to expose data.')
image(Path('screenshots/code-admin-rbac.png'),6.25,'Figure 12. Admin route handlers in app/api/[...path]/route.ts; the database independently rejects non-admin writes.')
para('Registration always creates the user role. A trigger prevents removing the last administrator and another trigger records every role change and recipe approval in audit_log with the acting user. The demo administrator is seeded on a fresh database; to promote a real account run npm run db:promote-admin -- email (owner connection only).')

# 11
page();heading('11 Evaluation Rubrics and Completion Status')
para('Status below describes artifacts and implementation in this repository. It is not a prediction of marks. A completed item means its code or report evidence exists; runtime limitations are called out explicitly.')
rows=[
 ('Database design','ER model and relational schema with keys, relationships, and constraints','5','Complete','ER image, editable draw.io, 18-table relational image, mapping audit.'),
 ('Database creation','SQL DDL with constraints','4','Complete','PostgreSQL migrations 001-004: keys, CHECK/UNIQUE/NOT NULL, indexes, triggers, views, ALTER/DROP.'),
 ('Database creation','NoSQL/vector database creation','4','Complete','float8[128] vector store in PostgreSQL with in-database cosine search; optional Qdrant service.'),
 ('Database creation','Technology justification','1','Complete','PostgreSQL + in-database vectors rationale in report and README.'),
 ('SQL operations','DML operations','4','Complete','Insert, update, delete in db/queries.sql (rolled back) and working APIs.'),
 ('SQL operations','Nested/correlated/recursive and join queries','4','Complete','JOIN, subquery, correlated NOT EXISTS, CTE, two recursive CTEs, window function.'),
 ('Advanced concepts','Procedure/function, trigger, CTE','6','Complete','sp_generate_meal_plan procedure, 9 functions, 12 triggers, CTEs; all exercised by tests.'),
 ('NoSQL/vector','Vector RUD and search','7','Complete','Create/read/update/delete/search via /api/vector; cosine search in fn_search_vectors. Qdrant path not exercised.'),
 ('Web integration','Next.js interface','3','Complete','Database-backed discovery, planner, favorites, preferences and admin screens.'),
 ('Web integration','Backend/API/database integration','2','Complete','Route Handlers use node-postgres with DATABASE_URL from the environment.'),
 ('Security','Authentication and two-role database RBAC','4','Complete','Session auth; rr_guest/rr_user/rr_admin roles, GRANT/REVOKE, column privileges, RLS, audit log.'),
 ('Documentation','Documentation and Git/GitHub','2','Documentation complete','README, report, diagrams, tree, SQL and audit. Contribution evidence = per-member Git commits.'),
 ('Originality','Individual contribution and viva','4','Student demonstration','Evaluated by the instructor from the viva and the commit history.'),
]
table(['Rubric area','Criterion','Max','Status','Evidence / boundary'],rows,[.82,1.48,.35,1.12,3.23],6.7)
para('Verification: 18 database tests and both HTTP API suites pass against PostgreSQL 18; the production build and TypeScript check pass; the database audit reports no failed checks. Qdrant was not launched (Docker is unavailable in the build environment), so only the in-database vector backend was exercised.',italic=True)

# Final metadata and save
doc.core_properties.title='RecipeRadar DBMS Level 3 Project Report'
doc.core_properties.subject='Database design, implementation, SQL, vector search, and Next.js integration'
doc.core_properties.author='PES1UG24AM270 and PES1UG24AM250'
doc.core_properties.keywords='DBMS, PostgreSQL, Next.js, relational schema, vector database'
doc.save(OUT)
print(OUT)
