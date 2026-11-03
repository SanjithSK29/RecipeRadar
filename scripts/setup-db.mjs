// Create the schema, roles and demo data:  npm run db:setup
// Needs DATABASE_ADMIN_URL (owner/superuser connection) and RR_APP_PASSWORD (for the rr_app login role).
import pg from "pg";
import { migrate } from "./migrate.mjs";
import { isEmpty, seed } from "./seed.mjs";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set (see .env.example).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const applied = await migrate(client, {
    appPassword: process.env.RR_APP_PASSWORD,
  });
  console.log(
    applied.length
      ? `Applied migrations: ${applied.join(", ")}`
      : "Schema is up to date.",
  );
  if (process.env.SEED_DEMO !== "0" && (await isEmpty(client))) {
    await client.query("BEGIN");
    try {
      await seed(client);
      await client.query("COMMIT");
      console.log("Seeded demonstration data.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
