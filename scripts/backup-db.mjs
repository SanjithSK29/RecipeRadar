// Plain-SQL backup of the database with pg_dump:  npm run db:backup
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
if (!process.env.DATABASE_ADMIN_URL) throw Error("DATABASE_ADMIN_URL is not set");
mkdirSync("backups", { recursive: true });
const target = `backups/reciperadar-${Date.now()}.sql`;
const result = spawnSync(
  "pg_dump",
  ["--no-owner", "--file", target, process.env.DATABASE_ADMIN_URL],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(target);
