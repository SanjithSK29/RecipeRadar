// Grant the admin role to an existing account:  npm run db:promote-admin -- user@example.com
// Uses the owner connection (DATABASE_ADMIN_URL). Run it only for the person who should be an administrator.
import pg from "pg";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw Error("Usage: npm run db:promote-admin -- user@example.com");
if (!process.env.DATABASE_ADMIN_URL) throw Error("DATABASE_ADMIN_URL is not set");
const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
try {
  const result = await client.query(
    "UPDATE users SET role='admin' WHERE lower(email)=$1",
    [email],
  );
  if (!result.rowCount)
    throw Error("No matching account; ask the person to register first.");
  console.log(`Administrator role granted to ${email}.`);
} finally {
  await client.end();
}
