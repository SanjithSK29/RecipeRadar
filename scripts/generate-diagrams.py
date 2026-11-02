from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/figures';OUT.mkdir(parents=True,exist_ok=True)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
ft=ImageFont.truetype(BOLD,19); fb=ImageFont.truetype(FONT,15); fm=ImageFont.truetype(BOLD,15); fs=ImageFont.truetype(FONT,13)
data=json.loads((ROOT/'db/model-contract.json').read_text())
extra={'ingredient_allergens':['ingredient_id PK,FK','allergen_id PK,FK'],'sessions':['token PK','user_id FK','expires_at'],'vector_sync_outbox':['outbox_id PK','recipe_id','operation','payload JSON','attempts','last_error'],'vector_documents':['recipe_id PK,FK','embedding JSON[128]','payload JSON','updated_at']}
db=__import__('sqlite3').connect(ROOT/'data/reciperadar.sqlite')
tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
attrs={}
for table in tables:
 info=db.execute(f'PRAGMA table_info("{table}")').fetchall()
 fks=db.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()
 pk={r[1] for r in info if r[5]}
 fk={r[3] for r in fks}
 attrs[table]=[r[1]+(' PK' if r[1] in pk else '')+(' FK' if r[1] in fk else '') for r in info]
# Full relational schema card sheet, on a clean light background.
W,H=2320,2070; im=Image.new('RGB',(W,H),'#f7f8f4');d=ImageDraw.Draw(im);d.text((58,30),'RecipeRadar relational schema',font=ImageFont.truetype(BOLD,34),fill='#294f3f');d.text((58,78),'17 STRICT tables · primary keys (PK) · foreign keys (FK) · composite keys shown on their components',font=fb,fill='#738073')
cols=4;cw=540;ch=355;gx=28;gy=27;startx=58;starty=130
cards=list(attrs.items())
relations=[('users','user_allergens'),('allergens','user_allergens'),('ingredients','ingredient_allergens'),('allergens','ingredient_allergens'),('users','recipes'),('cuisines','recipes'),('dietary_types','recipes'),('recipes','recipe_ingredients'),('ingredients','recipe_ingredients'),('users','ratings'),('recipes','ratings'),('users','favorites'),('recipes','favorites'),('users','meal_plans'),('meal_plans','meal_plan_recipes'),('recipes','meal_plan_recipes'),('ingredients','substitutions'),('recipes','vector_documents'),('recipes','vector_sync_outbox'),('users','sessions')]
positions={name:(startx+i%cols*(cw+gx)+cw/2,starty+i//cols*(ch+gy)+ch/2) for i,(name,_) in enumerate(cards)}
for a,b in relations:
 if a in positions and b in positions:
  x1,y1=positions[a];x2,y2=positions[b];d.line((x1,y1,x2,y2),fill='#ccd5c9',width=2)
for i,(name,fields) in enumerate(cards):
 x=startx+i%cols*(cw+gx);y=starty+i//cols*(ch+gy)
 d.rounded_rectangle((x,y,x+cw,y+ch),radius=14,fill='white',outline='#cbd7c9',width=2)
 d.rounded_rectangle((x,y,x+cw,y+48),radius=14,fill='#315b46');d.rectangle((x,y+32,x+cw,y+48),fill='#315b46')
 d.text((x+18,y+12),name,font=ft,fill='white')
 if name in data: fields=[str(f) for f in fields]
 else: fields=[str(f) for f in fields]
 lineh=26
 for j,f in enumerate(fields[:11]):
  d.text((x+18,y+60+j*lineh),str(f),font=fm if 'PK' in str(f) else fs,fill='#38483e')
  if j>=10 and len(fields)>11:
   d.text((x+20,y+60+(j+1)*lineh),f'+ {len(fields)-11} more attributes',font=fs,fill='#798679');break
im.save(OUT/'relational-schema.png',optimize=True)
# ER overview isolates the 13 domain entities and their relationships.
er_entities=['users','allergens','user_allergens','cuisines','dietary_types','ingredients','ingredient_allergens','recipes','recipe_ingredients','ratings','favorites','meal_plans','meal_plan_recipes','substitutions','sessions']
er_edges=[('users','user_allergens','1:N'),('allergens','user_allergens','1:N'),('ingredients','ingredient_allergens','1:N'),('allergens','ingredient_allergens','1:N'),('users','recipes','1:N'),('cuisines','recipes','1:N'),('dietary_types','recipes','1:N'),('recipes','recipe_ingredients','1:N'),('ingredients','recipe_ingredients','1:N'),('users','ratings','1:N'),('recipes','ratings','1:N'),('users','favorites','1:N'),('recipes','favorites','1:N'),('users','meal_plans','1:N'),('meal_plans','meal_plan_recipes','1:N'),('recipes','meal_plan_recipes','1:N'),('ingredients','substitutions','1:N')]
we=1530;he=1050; er=Image.new('RGB',(we,he),'#fbfcf9');ed=ImageDraw.Draw(er);ed.text((40,22),'RecipeRadar entity relationship model',font=ImageFont.truetype(BOLD,28),fill='#294f3f')
locations={name:(40+(i%4)*375,100+(i//4)*205) for i,name in enumerate(er_entities)}
# links first
for a,b,c in er_edges:
 x1,y1=locations[a];x2,y2=locations[b];ed.line((x1+80,y1+36,x2+5,y2+30),fill='#a8b7a9',width=2)
weak={'user_allergens','ingredient_allergens','recipe_ingredients','ratings','favorites','meal_plan_recipes'}
for name,(x,y) in locations.items():
 selected=attrs.get(name,[]);boxh=126
 ed.rounded_rectangle((x,y,x+345,y+boxh),radius=9,fill='white',outline='#92a897',width=2)
 if name in weak: ed.rounded_rectangle((x+5,y+5,x+340,y+121),radius=7,outline='#92a897',width=1)
 ed.rounded_rectangle((x,y,x+345,y+34),radius=9,fill='#315b46');ed.rectangle((x,y+24,x+345,y+34),fill='#315b46');ed.text((x+10,y+8),name,font=fm,fill='white')
 keys=[s for s in selected if 'PK' in s or 'FK' in s]
 for idx,label in enumerate(keys[:3]):
  ed.text((x+10,y+43+idx*23),label,font=fs,fill='#52665a')
# add edge legend for unambiguous cardinality notation
ed.rounded_rectangle((35,925,1490,978),radius=8,fill='#eaf0e6');ed.text((52,943),'1:N relationships · double-border weak/associative entities · associative entities resolve M:N links',font=fs,fill='#405746')
er.save(OUT/'er-diagram.png',optimize=True)
# Editable draw.io source with all tables and FK edges.
import xml.etree.ElementTree as ET
mx=ET.Element('mxfile',{'host':'app.diagrams.net','modified':'2026-11-02T00:00:00.000Z','agent':'RecipeRadar DBMS project','version':'24.7.17'});diagram=ET.SubElement(mx,'diagram',{'id':'reciperadar-erd','name':'RecipeRadar ERD'});model=ET.SubElement(diagram,'mxGraphModel',{'dx':'1600','dy':'1000','grid':'1','gridSize':'10','guides':'1','tooltips':'1','connect':'1','arrows':'1','fold':'1','page':'1','pageScale':'1','pageWidth':'1600','pageHeight':'1100','math':'0','shadow':'0'});root=ET.SubElement(model,'root');ET.SubElement(root,'mxCell',{'id':'0'});ET.SubElement(root,'mxCell',{'id':'1','parent':'0'})
coords={name:locations.get(name,(50+(i%4)*390,110+(i//4)*220)) for i,name in enumerate(er_entities)}
for i,name in enumerate(er_entities,2):
 fields=attrs[name];label=f'<b>{name.upper()}</b><hr/>'+ '<br/>'.join(fields[:9]);cell=ET.SubElement(root,'mxCell',{'id':str(i),'value':label,'style':'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#315b46;fontColor=#293d30;align=left;verticalAlign=top;spacing=8;','vertex':'1','parent':'1'});x,y=coords[name];ET.SubElement(cell,'mxGeometry',{'x':str(x),'y':str(y),'width':'250','height':'150','as':'geometry'})
idmap={n:str(i+2) for i,n in enumerate(er_entities)}
for j,(a,b,c) in enumerate(er_edges,50):
 cell=ET.SubElement(root,'mxCell',{'id':str(j),'value':c,'style':'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#839783;endArrow=ERmany;startArrow=ERone;','edge':'1','parent':'1','source':idmap[a],'target':idmap[b]});ET.SubElement(cell,'mxGeometry',{'relative':'1','as':'geometry'})
ET.ElementTree(mx).write(OUT/'reciperadar-erd.drawio',encoding='utf-8',xml_declaration=True)
print('wrote diagrams',im.size,er.size)
