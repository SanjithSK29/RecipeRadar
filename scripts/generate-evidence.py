from pathlib import Path
import sqlite3
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)
DB = sqlite3.connect(ROOT / 'data/reciperadar.sqlite')
DB.row_factory = sqlite3.Row
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

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
    draw.text((52, height - 34), f'Query output from the local SQLite database · schema version {DB.execute("PRAGMA user_version").fetchone()[0]}', font=ImageFont.truetype(FONT, 14), fill='#738073')
    image.save(OUT / path, optimize=True)

recipes = DB.execute('''SELECT r.recipe_id,r.title,c.name cuisine,d.name diet,
       ROUND(r.calories_per_serving) calories,printf('%.2f',r.avg_rating) rating
FROM recipes r JOIN cuisines c USING(cuisine_id)
JOIN dietary_types d USING(diet_id)
WHERE r.is_approved=1 ORDER BY r.recipe_id LIMIT 12''').fetchall()
table_image('resulting-recipes.png','SQL query result · approved recipes',
            'Join: recipes → cuisines → dietary_types | filters to approved records',
            ['recipe_id','title','cuisine','diet','kcal / serving','rating'],
            [tuple(r) for r in recipes], [120,520,290,260,240,240])

vectors = DB.execute('''SELECT recipe_id,json_array_length(embedding) dimensions,
       json_extract(payload,'$.title') title,json_extract(payload,'$.cuisine') cuisine,
       json_extract(payload,'$.diet') diet,updated_at
FROM vector_documents ORDER BY recipe_id''').fetchall()
table_image('resulting-vector-index.png','Persistent vector index rows',
            'NoSQL/vector evidence: JSON embedding dimensions and recipe payload stored in SQLite',
            ['recipe_id','dimensions','title','cuisine','diet','updated_at'],
            [tuple(r) for r in vectors], [135,150,500,300,250,335])

# Source-code excerpts presented as readable evidence images with path and line numbers.
def code_image(filename, out, title, first, last):
    lines = (ROOT / filename).read_text().splitlines()[first-1:last]
    line_h, margin = 27, 28
    width = 1720
    image = Image.new('RGB', (width, 112 + line_h * len(lines) + 28), '#101a17')
    draw = ImageDraw.Draw(image)
    draw.text((margin, 19), title, font=ImageFont.truetype(BOLD, 22), fill='#b9dec4')
    draw.text((margin, 54), f'{filename}  ·  lines {first}–{last}', font=ImageFont.truetype(FONT, 14), fill='#98aaa0')
    for idx, line in enumerate(lines):
        y = 96 + idx * line_h
        draw.text((margin, y), f'{first+idx:>4}', font=ImageFont.truetype(MONO, 15), fill='#70847a')
        draw.text((90, y), line[:170], font=ImageFont.truetype(MONO, 15), fill='#e1e9e4')
    image.save(OUT / out, optimize=True)

code_image('db/schema.sql','code-schema.png','Database DDL · constraints and relationships',1,55)
code_image('db/queries.sql','code-queries.png','SQL DML, joins, nested queries, CTEs and UDFs',51,85)
print('Evidence images written:', ', '.join(p.name for p in sorted(OUT.glob('*.png'))))
code_image('app/api/[...path]/route.ts','code-admin-rbac.png','Backend API · admin-only moderation and two-role database authorization',210,252)
