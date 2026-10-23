// Applies pending migrations from ./drizzle, then runs the idempotent seed.
// Usage: pnpm db:migrate   (reads DATABASE_URL and ADMIN_EMAIL from .env.local)
import { config } from "dotenv";
import { connect } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const { db, migrate } = await connect(url);
  await migrate();
  await seedDatabase(db, { adminEmail: process.env.ADMIN_EMAIL });
  console.log("Migrations applied and seed data ensured.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
