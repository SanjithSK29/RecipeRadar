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
p.add_run('Next.js 16  ·  SQLite  ·  TypeScript  ·  Local vector search with optional Qdrant').font.size=Pt(10)
p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_before=Pt(90)
r=p.add_run('Submission report and implementation evidence');r.font.size=Pt(11);r.font.color.rgb=RGBColor.from_string(MUTED)
page()

# Table of contents
heading('Table of Contents')
toc=[('1','Introduction and Problem Statement','3'),('2','User Requirements and Technology Stack','4'),('3','Entity Relationship Model','5–6'),('4','Relational Model','7–8'),('5','SQL DDL Statements','9'),('6','SQL DML Statements','10'),('7','NoSQL and Vector Database Commands','11'),('8','Results','12'),('9','Next.js Project Tree Structure','13'),('10','Application Code and Demo Screenshots','14–15'),('11','Evaluation Rubrics and Completion Status','16')]
table(['Sl. No.','Topic','Page'],toc,[.72,5.1,.65],9)
para('Artifact map',boldlead='Artifact map')
bullets(['Editable ERD: docs/figures/reciperadar-erd.drawio','SQL source: db/schema.sql and db/queries.sql','Live database audit: docs/database-verification.json','Screenshots: docs/screenshots/','Detailed attribute reconciliation: docs/database-audit.md'])
para('Page numbers refer to this rendered report. Figures and tables are sourced from the checked-in project files or the local SQLite database snapshot.',italic=True)
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
 ('Relational store','SQLite STRICT, Node.js 24 node:sqlite','Real SQL keys, transactions, triggers, views, JSON/date checks, and no separate local server.'),
 ('Vector store','SQLite JSON-vector default; optional Qdrant','Persistent 128-D vectors, cosine ranking, CRUD, and an outbox; Qdrant is available for a dedicated service.'),
 ('Authentication','scrypt hashes and opaque cookie sessions','Only password hashes and hashed session-token identifiers are stored.'),
], [.95,2.35,3.25],8)
heading('User-facing quality requirements',2)
bullets(['Private operations check the authenticated session and record ownership on the server.','Foreign keys and transactions protect writes even when the UI is bypassed.','The migration runner backs up before upgrading and rejects invalid legacy data without silently discarding it.'])
para('Run locally with Node.js 24+: npm install, then npm run dev. Open http://localhost:3000. A fresh empty database is seeded; an existing database is preserved.')
page()

# 3 first page
heading('3 Entity Relationship Model')
heading('Entities',2)
table(['Entity','Role / key'],[
 ('users','Strong entity; user_id'),('allergens','Strong entity; allergen_id'),('cuisines','Strong entity; cuisine_id'),('dietary_types','Strong entity; diet_id'),('ingredients','Strong entity; ingredient_id'),('recipes','Strong entity; recipe_id'),('meal_plans','Strong entity; plan_id'),('substitutions','Recursive relationship; ingredient_id_from + ingredient_id_to'),
 ('user_allergens','Weak/associative; user_id + allergen_id'),('ingredient_allergens','Weak/associative extension; ingredient_id + allergen_id'),('recipe_ingredients','Weak/associative; recipe_id + ingredient_id'),('ratings','Associative; user_id + recipe_id'),('favorites','Associative; user_id + recipe_id'),('meal_plan_recipes','Weak/associative; plan_id + meal_date + meal_type'),('sessions','Authentication-support entity; token'),
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
bullets(['ingredient_allergens(ingredient_id, allergen_id) resolves which named allergen each ingredient contains.','sessions(token, user_id, expires_at) supports authenticated sessions without storing raw cookie tokens.','vector_sync_outbox(outbox_id, recipe_id, operation, payload, attempts, last_error, created_at) durably queues index updates and delete tombstones.','vector_documents(recipe_id, embedding, payload, updated_at) persists local vector records with JSON checks.'])
heading('Keys and constraints',2)
para('All source relations and their displayed attributes are retained. Join relations use composite primary keys; recipe foreign keys connect cuisine, diet, and creator. The meal entry key is (plan_id, meal_date, meal_type), enforcing one recipe per plan slot while allowing the same recipe on different dates. The substitutions relation references ingredients twice with directional roles.')
para('The implemented schema strengthens nullability, validates lengths and domains, checks recipe-step JSON, verifies calendar dates, and declares explicit delete behavior. Rating averages and allergen flags are trigger-maintained derived attributes.')
page();heading('Relational Schema Diagram')
image(Path('figures/relational-schema.png'),6.9,'Figure 2. Complete light-background relational schema. PK and FK marks appear on each key component; all 17 STRICT tables are included.')
para('The diagram is generated from SQLite table metadata by scripts/generate-diagrams.py. The editable ER model is docs/figures/reciperadar-erd.drawio; the exact PDF-to-schema mapping and deliberate differences are documented in docs/database-audit.md.')

# 5
page();heading('5 SQL DDL Statements')
para('The canonical SQL DDL is db/schema.sql. It creates 17 STRICT tables, explicit primary/foreign keys, composite keys, unique constraints, range checks, JSON and date validation, and 15 secondary indexes.')
bullets(['15 triggers maintain review-rating caches, ingredient-allergen flags, plan-date bounds, and valid recipe-step arrays.','Three views provide recipe allergen details, daily meal-plan nutrition, and a serving-scaled shopping list.','PRAGMA foreign_keys = ON enables relationship enforcement for the connection.','The migration runner records schema version 4 and wraps rebuild/restore in a transaction after creating a consistent backup.'])
image(Path('screenshots/code-schema.png'),6.35,'Figure 3. DDL source excerpt from db/schema.sql showing STRICT tables, role validation, and composite foreign keys.')
para('The complete DDL, not only this excerpt, is part of the submission repository.')

# 6
page();heading('6 SQL DML Statements')
para('db/queries.sql contains representative SELECT, INSERT, UPDATE, DELETE, joins, grouped queries, correlated subqueries, common table expressions, recursive date generation, and SQLite UDF calls.')
heading('Representative DML and query coverage',2)
bullets(['INSERT/UPDATE/DELETE are shown inside a BEGIN IMMEDIATE transaction; ROLLBACK leaves the sample database unchanged.','A multi-table JOIN returns recipe, cuisine, and diet labels.','Correlated NOT EXISTS excludes recipes containing allergens recorded by a user.','A standard CTE joins active plans to daily nutrition; a recursive CTE generates all dates in a plan.','Registered SQL functions calculate portion-scaled calories and descriptor overlap.'])
para('Advanced database concepts: triggers and views are native SQLite DDL. SQLite does not support stored-procedure DDL. Multi-step transactional server functions provide procedure-like behavior in the API, while connection-registered SQL UDFs cover function behavior. This engine limitation is explicit.')
image(Path('screenshots/code-queries.png'),6.15,'Figure 4. SQL example source excerpt from db/queries.sql.')

# 7
page();heading('7 NoSQL and Vector Database Commands')
para('Each approved recipe has a normalized 128-dimensional vector and JSON payload. Text combines title, description, cuisine, diet, meal type, ingredients, and curated flavor terms. A deterministic hash embedding with a small synonym map supports reproducible cosine-similarity ranking; it is a baseline feature-hashing method, not a trained model.')
heading('Persistence and update flow',2)
bullets(['Default local backend: vector_documents stores embeddings and JSON payloads in SQLite with JSON type/length checks; cosine ranking is computed by the application.','Optional dedicated backend: Docker Compose starts Qdrant collection reciperadar_recipes with cosine distance and a named persistent volume.','vector_sync_outbox records recipe upserts and deletion tombstones transactionally. Failed Qdrant writes retain their attempt count and error for retry.','Only approved recipes are discoverable; user drafts remain private until approved.'])
heading('Vector RUD and search commands',2)
code('POST /api/vector  {"action":"upsert","recipe_id":3}\nPOST /api/vector  {"action":"read","recipe_id":3}\nPOST /api/vector  {"action":"search","query":"creamy bright citrus","limit":8}\nPOST /api/vector  {"action":"delete","recipe_id":3}\nGET  /api/vector  → backend, indexed count, and pending outbox count',7.4)
para('Direct SQL inspection: SELECT recipe_id, json_array_length(embedding), json_extract(payload,\'$.title\') FROM vector_documents;')
image(Path('screenshots/resulting-vector-index.png'),6.6,'Figure 5. Live vector-document rows in the local database: 12 approved recipes, each with 128 values and JSON metadata.')

# 8
page();heading('8 Results')
para('The local SQLite database was upgraded to schema version 4. The integrity audit recorded a successful SQLite integrity check, enabled foreign keys, no foreign-key violations, STRICT tables, synchronized rating/allergen caches, valid plan dates, ingredient-bearing recipes, unique case-insensitive emails, and no self-substitutions.')
image(Path('screenshots/resulting-recipes.png'),6.6,'Figure 6. Join query output from the local SQLite database showing the 12 approved recipes.')
heading('Recorded data snapshot',2)
para('The point-in-time audit at docs/database-verification.json records 12 recipes, 25 ingredients, 44 recipe-ingredient associations, 10 ingredient-allergen mappings, 6 user-allergen preferences, 3 ratings, 6 favorites, 1 meal plan with 21 entries, 6 substitution links, 2 sessions, and 12 indexed vectors. Four local accounts were present; account identifiers and credentials are omitted from the report.')
para('This snapshot is environment-specific. The project ships schema and seed data, not the private live SQLite account database.')

# 9
page();heading('9 Next.js Project Tree Structure')
para('The complete source inventory is available in docs/project-tree.txt. Major implementation files:')
table(['Path','Purpose'],[
 ('app/page.tsx','Next.js client interface for discovery, search, plans, preferences, and admin studio.'),
 ('app/api/[...path]/route.ts','Authenticated API, validation, ownership, role checks, business writes, and vector operations.'),
 ('lib/db.ts','SQLite connection, functions, migrations/seed invocation, typed query helpers, and transactions.'),
 ('lib/migrations.ts','Versioned, backup-first, rollback-safe schema upgrades.'),
 ('lib/vector.ts','Embeddings, local cosine index, optional Qdrant integration, synchronization outbox.'),
 ('db/schema.sql','Canonical database DDL and database-level integrity rules.'),
 ('db/queries.sql','SQL examples for DML, joins, nested queries, CTEs, and functions.'),
 ('scripts/','Database audit/backup, diagram/evidence/report generation, and deliberate admin provisioning.'),
 ('docs/figures/','ER overview, editable draw.io source, and relational diagram.'),
 ('docs/screenshots/','Application, code, and populated result evidence images.'),
], [2.15,4.35],8.1)
heading('Top-level tree',2)
code('app/  db/  docs/  lib/  scripts/  tests/\nDockerfile  compose.yaml  next.config.ts  package.json  tsconfig.json\nREADME.md  db/schema.sql  db/queries.sql  docs/RecipeRadar_DBMS_Project_Report.docx',8.2)
para('The live SQLite database, sessions, and backups are in the ignored data/ directory so private local records are not included in Git.')

# 10
page();heading('10 Application Code and Demo Screenshots')
para('The application is a Next.js interface backed by Route Handlers and the same SQLite database used by the schema audit. The screenshot shows database-backed recipe cards, filters, allergy toggle, meal planner, saved recipes, ingredient swaps, preferences, and vector flavor search navigation.')
image(Path('screenshots/application-home.png'),6.75,'Figure 7. RecipeRadar discovery screen with recipes loaded from the SQLite-backed API.')
page();heading('Application Code and Role Based Access')
para('The API requires an authenticated session and checks the users.role value before accessing recipe moderation and role-management routes. Registration always creates the user role. The final admin cannot be demoted from the UI. Recipe ownership is derived from the session, not a client-supplied user identifier.')
image(Path('screenshots/code-admin-rbac.png'),6.25,'Figure 8. Admin route handlers and safeguards in app/api/[...path]/route.ts.')
para('A local existing account needs an owner-approved role change using npm run db:promote-admin -- your-email@example.com. A clean database seeds a demo admin. This working directory contains no administrator account: the privilege promotion was stopped by automatic review because it modifies an existing user’s authorization. The UI and API role controls are implemented; the owner must provision the chosen administrator locally.')

# 11
page();heading('11 Evaluation Rubrics and Completion Status')
para('Status below describes artifacts and implementation in this repository. It is not a prediction of marks. A completed item means its code or report evidence exists; runtime limitations are called out explicitly.')
rows=[
 ('Database design','ER model and relational schema with keys, relationships, and constraints','5','Complete','ER image, editable draw.io, 17-table relational image, mapping audit.'),
 ('Database creation','SQL DDL with constraints','4','Complete','STRICT tables, keys, checks, indexes, triggers, views; schema v4.'),
 ('Database creation','NoSQL/vector database creation','4','Complete locally','Persistent JSON-vector table and optional Qdrant Compose service; 12 vectors indexed locally.'),
 ('Database creation','Technology justification','1','Complete','SQLite and vector backend rationale in report and README.'),
 ('SQL operations','DML operations','4','Complete','Insert, update, delete, rollback examples and working APIs.'),
 ('SQL operations','Nested/correlated/recursive and join queries','4','Complete','JOIN, correlated NOT EXISTS, standard CTE, recursive CTE in db/queries.sql.'),
 ('Advanced concepts','Procedure/function, trigger, CTE','6','Partial by engine','Triggers, UDFs, CTEs, transactional server functions; SQLite has no native stored-procedure DDL.'),
 ('NoSQL/vector','Vector RUD and search','7','Implemented; local path exercised','12 vector creates/index records, read and cosine search exercised; upsert/delete routes and Qdrant path included.'),
 ('Web integration','Next.js interface','3','Complete','Database-backed discovery UI screenshot.'),
 ('Web integration','Backend/API/database integration','2','Complete','Next.js Route Handlers connect to persistent SQLite and vector layer.'),
 ('Security','Authentication and two-role database RBAC','4','Implemented; admin provisioning pending','user/admin schema, session auth, guarded admin API/UI; current local account elevation requires owner command.'),
 ('Documentation','Documentation and Git/GitHub','2','Complete','README, report, diagrams, project tree, SQL and audit artifacts.'),
 ('Originality','Individual contribution and viva','4','Student demonstration','Project work is documented; individual contribution and oral defense are evaluated by instructor.'),
]
table(['Rubric area','Criterion','Max','Status','Evidence / boundary'],rows,[.82,1.48,.35,1.12,3.23],6.7)
para('Environment and verification: the Docker daemon socket is unavailable, so Qdrant was not launched; the local SQLite vector backend is populated and searched. The live account has no administrator because automatic review blocked an existing-user privilege change. The v4 database audit, TypeScript check, and final production build pass. The earlier 60-test baseline predates vector changes; the full suite was not rerun for this final revision.',italic=True)

# Final metadata and save
doc.core_properties.title='RecipeRadar DBMS Level 3 Project Report'
doc.core_properties.subject='Database design, implementation, SQL, vector search, and Next.js integration'
doc.core_properties.author='PES1UG24AM270 and PES1UG24AM250'
doc.core_properties.keywords='DBMS, SQLite, Next.js, relational schema, vector database'
doc.save(OUT)
print(OUT)
