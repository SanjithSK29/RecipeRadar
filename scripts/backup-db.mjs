import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
const source =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data/reciperadar.sqlite");
const directory = path.join(path.dirname(source), "backups");
mkdirSync(directory, { recursive: true });
const target = path.join(directory, `snapshot-${Date.now()}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  console.log(target);
} finally {
  db.close();
}
