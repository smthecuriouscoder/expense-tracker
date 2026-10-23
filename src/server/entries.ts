import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { entryInputSchema, type EntryInput, type ValidEntryInput } from "@/lib/entry-input";
import type { Filters } from "@/lib/filters";
import { assertCanPlaceInGroup, getEditableEntry } from "./access";
import type { Db } from "./db/client";
import { categories, entries, entryTags, groups, tags, users } from "./db/schema";
import { entryConditions } from "./entry-conditions";
import { invalid } from "./errors";

function parseInput(input: EntryInput): ValidEntryInput {
  const result = entryInputSchema.safeParse(input);
  if (!result.success) throw invalid(result.error.issues[0]?.message ?? "Invalid entry.");
  return result.data;
}

async function assertValidCategory(db: Db, input: ValidEntryInput) {
  const [cat] = await db
    .select({ kind: categories.kind, parentId: categories.parentId })
    .from(categories)
    .where(and(eq(categories.id, input.categoryId), isNull(categories.deletedAt)));
  if (!cat || !cat.parentId) throw invalid("Pick a subcategory.");
  const expectedKind = input.type === "income" ? "income" : "expense";
  if (cat.kind !== expectedKind) throw invalid(`Pick an ${expectedKind} category for this entry.`);
}

async function setTags(db: Db, entryId: string, names: string[]) {
  await db.delete(entryTags).where(eq(entryTags.entryId, entryId));
  if (names.length === 0) return;
  await db
    .insert(tags)
    .values(names.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });
  const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.name, names));
  await db.insert(entryTags).values(rows.map((t) => ({ entryId, tagId: t.id })));
}

/** Validates and saves a batch atomically: either every entry is saved or none is. */
export async function createEntries(db: Db, userId: string, inputs: EntryInput[]): Promise<string[]> {
  if (inputs.length === 0) throw invalid("Nothing to save.");
  if (inputs.length > 50) throw invalid("Save at most 50 entries at once.");
  const valid = inputs.map(parseInput);
  for (const input of valid) {
    await assertValidCategory(db, input);
    await assertCanPlaceInGroup(db, userId, input.type, input.groupId);
  }
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const { tags: tagNames, ...input } of valid) {
      const [row] = await tx
        .insert(entries)
        .values({ ...input, ownerId: userId })
        .returning({ id: entries.id });
      await setTags(tx, row.id, tagNames);
      ids.push(row.id);
    }
    return ids;
  });
}

export async function updateEntry(db: Db, userId: string, entryId: string, input: EntryInput) {
  const existing = await getEditableEntry(db, userId, entryId);
  if (existing.deletedAt) throw invalid("Restore this entry before editing it.");
  const parsed = parseInput(input);
  await assertValidCategory(db, parsed);
  await assertCanPlaceInGroup(db, userId, parsed.type, parsed.groupId);
  const { tags: tagNames, ...rest } = parsed;
  // rawText is the original input and is never overwritten by edits (undefined = column left unchanged).
  const changes = { ...rest, rawText: undefined };
  await db.transaction(async (tx) => {
    await tx
      .update(entries)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(entries.id, entryId));
    await setTags(tx, entryId, tagNames);
  });
}

export async function softDeleteEntry(db: Db, userId: string, entryId: string) {
  await getEditableEntry(db, userId, entryId);
  await db.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, entryId));
}

export async function restoreEntry(db: Db, userId: string, entryId: string) {
  const entry = await getEditableEntry(db, userId, entryId);
  // The owner may have left the group since deleting; don't resurrect into a group they can't see.
  await assertCanPlaceInGroup(db, userId, entry.type, entry.groupId);
  await db.update(entries).set({ deletedAt: null }).where(eq(entries.id, entryId));
}

const parentCategory = alias(categories, "parent_category");

const tagsAgg = sql<string[]>`coalesce(
  (select array_agg(${tags.name} order by ${tags.name}) from ${entryTags}
   join ${tags} on ${tags.id} = ${entryTags.tagId} where ${entryTags.entryId} = ${entries.id}),
  '{}'::text[])`;

const listColumns = {
  id: entries.id,
  ownerId: entries.ownerId,
  ownerName: users.name,
  ownerActive: users.active,
  groupId: entries.groupId,
  groupName: groups.name,
  type: entries.type,
  amountMinor: entries.amountMinor,
  categoryId: entries.categoryId,
  categoryName: categories.name,
  categorySlug: categories.slug,
  parentCategoryName: parentCategory.name,
  date: entries.date,
  description: entries.description,
  merchant: entries.merchant,
  paymentMethod: entries.paymentMethod,
  rawText: entries.rawText,
  tags: tagsAgg,
};

function listQuery(db: Db) {
  return db
    .select(listColumns)
    .from(entries)
    .innerJoin(users, eq(users.id, entries.ownerId))
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(parentCategory, eq(parentCategory.id, categories.parentId))
    .leftJoin(groups, eq(groups.id, entries.groupId));
}

export type EntryRow = Awaited<ReturnType<ReturnType<typeof listQuery>["execute"]>>[number];

export const PAGE_SIZE = 50;

export async function listEntries(db: Db, userId: string, filters: Filters, page = 1) {
  const where = await entryConditions(db, userId, filters);
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const [rows, [{ count }]] = await Promise.all([
    listQuery(db).where(where).orderBy(desc(entries.date), desc(entries.createdAt)).limit(PAGE_SIZE).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(entries).where(where),
  ]);
  return { rows, total: count, page, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)) };
}

/** A single entry for the edit form (owner only, not deleted). */
export async function getEntryForEdit(db: Db, userId: string, entryId: string): Promise<EntryRow> {
  await getEditableEntry(db, userId, entryId);
  const [row] = await listQuery(db).where(and(eq(entries.id, entryId), isNull(entries.deletedAt)));
  if (!row) throw invalid("This entry was deleted.");
  return row;
}

/** The user's most recently soft-deleted entries (for a restore view). */
export async function listDeletedEntries(db: Db, userId: string) {
  return listQuery(db)
    .where(and(eq(entries.ownerId, userId), isNotNull(entries.deletedAt)))
    .orderBy(desc(entries.deletedAt))
    .limit(20);
}
