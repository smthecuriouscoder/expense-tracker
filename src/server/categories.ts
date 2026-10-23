import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CategoryOption } from "@/lib/categories";
import type { Db } from "./db/client";
import { categories, entries } from "./db/schema";
import { forbidden, invalid, notFound } from "./errors";

const parent = alias(categories, "parent");

/** All active categories, parents first then children, in display order. */
export async function listCategories(db: Db): Promise<CategoryOption[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      kind: categories.kind,
      parentId: categories.parentId,
      parentName: parent.name,
      isCustom: categories.isCustom,
      isFallback: categories.isFallback,
      createdBy: categories.createdBy,
    })
    .from(categories)
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .where(isNull(categories.deletedAt))
    .orderBy(
      asc(sql`coalesce(${parent.sort}, ${categories.sort})`),
      asc(sql`${categories.parentId} is not null`),
      // Keep "Other" last within its parent.
      asc(categories.isFallback),
      asc(categories.sort),
      asc(categories.name),
    );
  return rows;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Users may add custom children under existing parents only. Custom categories are global. */
export async function addCustomSubcategory(db: Db, userId: string, parentId: string, rawName: string) {
  const name = rawName.trim();
  if (name.length < 2 || name.length > 40) throw invalid("Category name must be 2–40 characters.");
  const [p] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, parentId), isNull(categories.deletedAt)));
  if (!p || p.parentId) throw invalid("Pick a top-level category as the parent.");

  const [duplicate] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.parentId, parentId), isNull(categories.deletedAt), sql`lower(${categories.name}) = ${name.toLowerCase()}`),
    );
  if (duplicate) throw invalid(`"${name}" already exists under ${p.name}.`);

  const base = `${p.slug}.c-${slugify(name) || "custom"}`;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(sql`${categories.slug} like ${base + "%"}`);
  const slug = count === 0 ? base : `${base}-${count + 1}`;

  const [created] = await db
    .insert(categories)
    .values({ slug, name, parentId, kind: p.kind, isCustom: true, createdBy: userId, sort: 100 })
    .returning();
  return created;
}

/**
 * Soft-deletes a custom category after moving all of its entries (from every user) to `reassignToId`.
 * Preset categories can't be deleted so the LLM's closed list and fallbacks stay stable.
 * Allowed for the category's creator and the app admin.
 */
export async function deleteCustomCategory(
  db: Db,
  actor: { id: string; isAppAdmin: boolean },
  categoryId: string,
  reassignToId: string,
) {
  if (categoryId === reassignToId) throw invalid("Pick a different category to move entries to.");
  return db.transaction(async (tx) => {
    const [cat] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)));
    if (!cat) throw notFound("Category not found.");
    if (!cat.isCustom) throw forbidden("Preset categories can't be deleted.");
    if (cat.createdBy !== actor.id && !actor.isAppAdmin) throw forbidden("Only its creator or the app admin can delete this category.");

    const [target] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, reassignToId), isNull(categories.deletedAt)));
    if (!target || !target.parentId) throw invalid("Entries must be moved to a subcategory.");
    if (target.kind !== cat.kind) throw invalid("Entries must be moved to a category of the same kind.");

    const moved = await tx
      .update(entries)
      .set({ categoryId: reassignToId, updatedAt: new Date() })
      .where(eq(entries.categoryId, categoryId))
      .returning({ id: entries.id });
    await tx.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, categoryId));
    return { moved: moved.length };
  });
}
