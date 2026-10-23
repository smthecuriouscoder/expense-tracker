// Re-runs only the idempotent seed (preset categories + admin invite).
// Usage: pnpm db:seed
import { config } from "dotenv";
import { connect } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const { db } = await connect(url);
  await seedDatabase(db, { adminEmail: process.env.ADMIN_EMAIL });
  console.log("Seed data ensured.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
