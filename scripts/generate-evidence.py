from pathlib import Path
import csv, io, os, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

def query(sql):
    """Run SQL with psql against DATABASE_ADMIN_URL and return the data rows (no header)."""
    out = subprocess.run(['psql', os.environ['DATABASE_ADMIN_URL'], '-X', '--csv', '-t', '-c', sql],
                         capture_output=True, text=True, check=True).stdout
    return [tuple(r) for r in csv.reader(io.StringIO(out))]

SERVER = query('SHOW server_version')[0][0]

def table_image(path, title, subtitle, headers, rows, widths):
    row_h = 42
    height = 155 + row_h * (len(rows) + 1) + 48
    image = Image.new('RGB', (1920, height), '#f6f7f4')
    draw = ImageDraw.Draw(image)
    draw.text((52, 28), title, font=ImageFont.truetype(BOLD, 31), fill='#264b3a')
    draw.text((52, 73), subtitle, font=ImageFont.truetype(FONT, 17), fill='#647267')
    x0, y0 = 52, 125
    x = x0
    for label, width in zip(headers, widths):
        draw.rectangle((x, y0, x + width, y0 + row_h), fill='#315b46')
        draw.text((x + 12, y0 + 11), label, font=ImageFont.truetype(BOLD, 15), fill='white')
        x += width
    y = y0 + row_h
    for index, row in enumerate(rows):
        fill = '#ffffff' if index % 2 == 0 else '#edf2eb'
        x = x0
        for value, width in zip(row, widths):
            draw.rectangle((x, y, x + width, y + row_h), fill=fill, outline='#d4ddd3')
            text = str(value)
            font = ImageFont.truetype(FONT, 14)
            while draw.textbbox((0, 0), text, font=font)[2] > width - 24 and len(text) > 4:
                text = text[:-4] + '…'
            draw.text((x + 12, y + 12), text, font=font, fill='#27372d')
            x += width
        y += row_h
    draw.text((52, height - 34), f'Query output from the local PostgreSQL {SERVER} database', font=ImageFont.truetype(FONT, 14), fill='#738073')
    image.save(OUT / path, optimize=True)

table_image('resulting-recipes.png', 'SQL query result · approved recipes',
            'Join: recipes → cuisines → dietary_types | filters to approved records',
            ['recipe_id', 'title', 'cuisine', 'diet', 'kcal / serving', 'rating'],
            query("""SELECT r.recipe_id, r.title, c.name, d.name, round(r.calories_per_serving), to_char(r.avg_rating,'FM0.00')
                     FROM recipes r JOIN cuisines c USING(cuisine_id) JOIN dietary_types d USING(diet_id)
                     WHERE r.is_approved ORDER BY r.recipe_id LIMIT 12"""),
            [120, 520, 290, 260, 240, 240])

table_image('resulting-vector-index.png', 'Vector documents stored in PostgreSQL',
            'Vector evidence: float8[128] embeddings + JSONB payload; search runs in fn_search_vectors() (cosine)',
            ['recipe_id', 'dimensions', 'title', 'cuisine', 'diet', 'updated_at'],
            query("""SELECT recipe_id, cardinality(embedding), payload->>'title', payload->>'cuisine', payload->>'diet',
                            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') FROM vector_documents ORDER BY recipe_id"""),
            [135, 150, 500, 300, 250, 335])

# Privilege matrix: which role may do what on which table (S=select I=insert U=update D=delete; lowercase = some columns only).
matrix = []
for t in ['users', 'recipes', 'recipe_ingredients', 'ratings', 'favorites', 'user_allergens', 'meal_plans',
          'meal_plan_recipes', 'vector_documents', 'sessions', 'audit_log']:
    row = [t]
    for role in ['rr_guest', 'rr_user', 'rr_admin', 'rr_app']:
        sel = query(f"""SELECT has_table_privilege('{role}','{t}','SELECT'), has_any_column_privilege('{role}','{t}','SELECT'),
                               has_table_privilege('{role}','{t}','INSERT'), has_any_column_privilege('{role}','{t}','INSERT'),
                               has_table_privilege('{role}','{t}','UPDATE'), has_any_column_privilege('{role}','{t}','UPDATE'),
                               has_table_privilege('{role}','{t}','DELETE')""")[0]
        flags = ''
        for letter, full, any_, in [('S', sel[0], sel[1]), ('I', sel[2], sel[3]), ('U', sel[4], sel[5])]:
            flags += letter if full == 't' else (letter.lower() if any_ == 't' else '-')
        flags += 'D' if sel[6] == 't' else '-'
        row.append(flags)
    rls = query(f"SELECT relrowsecurity FROM pg_class WHERE relname='{t}'")[0][0]
    row.append('on' if rls == 't' else 'off')
    matrix.append(tuple(row))
table_image('resulting-roles.png', 'Database roles and privileges (GRANT / REVOKE)',
            'S select · I insert · U update · D delete · lowercase = only some columns (column-level GRANT) · RLS = row-level security',
            ['table', 'rr_guest', 'rr_user', 'rr_admin', 'rr_app (login)', 'RLS'],
            matrix, [330, 260, 260, 260, 300, 190])

table_image('resulting-policies.png', 'Row-level security policies (pg_policies)',
            'Policies are enforced by PostgreSQL for the role the API switches to on each request',
            ['table', 'policy', 'command', 'applies to roles'],
            query("SELECT tablename, policyname, cmd, array_to_string(roles, ', ') FROM pg_policies ORDER BY tablename, policyname LIMIT 26"),
            [330, 480, 200, 810])

# Source-code and test-output excerpts as readable evidence images with path and line numbers.
def code_image(filename, out, title, first, last):
    lines = (ROOT / filename).read_text().splitlines()[first-1:last]
    line_h, margin = 27, 28
    image = Image.new('RGB', (1720, 112 + line_h * len(lines) + 28), '#101a17')
    draw = ImageDraw.Draw(image)
    draw.text((margin, 19), title, font=ImageFont.truetype(BOLD, 22), fill='#b9dec4')
    draw.text((margin, 54), f'{filename}  ·  lines {first}–{last}', font=ImageFont.truetype(FONT, 14), fill='#98aaa0')
    for idx, line in enumerate(lines):
        y = 96 + idx * line_h
        draw.text((margin, y), f'{first+idx:>4}', font=ImageFont.truetype(MONO, 15), fill='#70847a')
        draw.text((90, y), line[:170], font=ImageFont.truetype(MONO, 15), fill='#e1e9e4')
    image.save(OUT / out, optimize=True)

def text_image(source, out, title, max_lines=60):
    lines = Path(source).read_text().splitlines()[:max_lines]
    line_h, margin = 27, 28
    image = Image.new('RGB', (1720, 112 + line_h * len(lines) + 28), '#101a17')
    draw = ImageDraw.Draw(image)
    draw.text((margin, 19), title, font=ImageFont.truetype(BOLD, 22), fill='#b9dec4')
    for idx, line in enumerate(lines):
        draw.text((margin, 70 + idx * line_h), line[:170], font=ImageFont.truetype(MONO, 15),
                  fill='#8ee0a0' if line.startswith('✔') or 'passed' in line else '#e1e9e4')
    image.save(OUT / out, optimize=True)

code_image('db/migrations/001_schema.sql', 'code-schema.png', 'Database DDL · constraints and relationships', 1, 50)
code_image('db/queries.sql', 'code-queries.png', 'SQL DML, joins, nested queries, CTEs and functions', 41, 80)
code_image('db/migrations/002_routines.sql', 'code-procedure.png', 'Stored procedure sp_generate_meal_plan (PL/pgSQL)', 65, 112)
code_image('db/migrations/004_roles_and_security.sql', 'code-roles-rls.png', 'Roles, GRANT/REVOKE and row-level security', 40, 85)
code_image('app/api/[...path]/route.ts', 'code-admin-rbac.png', 'Backend API · admin-only moderation and role-based authorization', 224, 247)
if (ROOT / 'docs/test-results.txt').exists():
    text_image(str(ROOT / 'docs/test-results.txt'), 'test-results.png', 'Test results · npm test (database) and npm run test:api (HTTP)', 29)
print('Evidence images written:', ', '.join(p.name for p in sorted(OUT.glob('*.png'))))
