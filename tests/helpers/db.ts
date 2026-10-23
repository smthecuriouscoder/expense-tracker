import { eq } from "drizzle-orm";
import { connect, type Db } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { allowedEmails, categories, groups } from "@/server/db/schema";
import { upsertUserOnSignIn } from "@/server/users";
import type { EntryInput } from "@/lib/entry-input";

/** Fresh in-memory Postgres (PGlite) with migrations + seed applied. */
export async function createTestDb(): Promise<Db> {
  const { db, migrate } = await connect("pglite:memory");
  await migrate();
  await seedDatabase(db, { adminEmail: "admin@example.com" });
  return db;
}

export async function createUser(db: Db, email: string, name = email.split("@")[0]) {
  await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  const user = await upsertUserOnSignIn(db, { email, name }, "admin@example.com");
  if (!user) throw new Error("user not created");
  return user;
}

export async function categoryId(db: Db, slug: string): Promise<string> {
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!c) throw new Error(`no category ${slug}`);
  return c.id;
}

export async function defaultGroupId(db: Db): Promise<string> {
  const [g] = await db.select({ id: groups.id }).from(groups).where(eq(groups.isDefault, true));
  return g.id;
}

export function entry(overrides: Partial<EntryInput> & Pick<EntryInput, "categoryId">): EntryInput {
  return {
    type: "expense",
    amountMinor: 10_000,
    date: "2026-10-10",
    description: "Test",
    merchant: null,
    paymentMethod: null,
    tags: [],
    groupId: null,
    rawText: null,
    ...overrides,
  };
}
