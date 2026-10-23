import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { otherSlug, PRESET_CATEGORIES } from "./category-tree";
import { allowedEmails, categories } from "./schema";

/** Idempotent: safe to run on every deploy. Inserts missing preset categories and the admin invite. */
export async function seedDatabase(db: Db, opts: { adminEmail?: string } = {}) {
  for (const [parentIndex, parent] of PRESET_CATEGORIES.entries()) {
    await db
      .insert(categories)
      .values({ slug: parent.slug, name: parent.name, kind: parent.kind, sort: parentIndex })
      .onConflictDoNothing({ target: categories.slug });
    const [{ id: parentId }] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, parent.slug));

    const children = [
      ...parent.children.map((child) => ({ slug: `${parent.slug}.${child.slug}`, name: child.name, isFallback: false })),
      { slug: otherSlug(parent.slug), name: "Other", isFallback: true },
    ];
    await db
      .insert(categories)
      .values(children.map((child, i) => ({ ...child, parentId, kind: parent.kind, sort: i })))
      .onConflictDoNothing({ target: categories.slug });
  }

  if (opts.adminEmail) {
    await db
      .insert(allowedEmails)
      .values({ email: opts.adminEmail.trim().toLowerCase() })
      .onConflictDoNothing();
  }
}
