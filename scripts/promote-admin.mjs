import { DatabaseSync } from "node:sqlite";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw Error("Usage: npm run db:promote-admin -- user@example.com");
const db = new DatabaseSync(
  process.env.DATABASE_PATH || "data/reciperadar.sqlite",
);
try {
  const result = db
    .prepare("UPDATE users SET role='admin' WHERE email=? COLLATE NOCASE")
    .run(email);
  if (!result.changes)
    throw Error("No matching account; ask the person to register first.");
  console.log(`Administrator role granted to ${email}.`);
} finally {
  db.close();
}
