import { and, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { Filters } from "@/lib/filters";
import { scopeCondition } from "./access";
import type { Db } from "./db/client";
import { categories, entries, entryTags, tags } from "./db/schema";

/**
 * WHERE clause for the global filter bar: scope (access-checked) + date range + optional filters.
 * Pass `range: null` to drop the date range (e.g. for multi-month trend widgets that set their own).
 */
export async function entryConditions(
  db: Db,
  userId: string,
  filters: Filters,
  range: { from: string; to: string } | null = { from: filters.from, to: filters.to },
): Promise<SQL> {
  const conds: (SQL | undefined)[] = [await scopeCondition(db, userId, filters.scope)];

  if (range) conds.push(gte(entries.date, range.from), lte(entries.date, range.to));

  if (filters.categoryId) {
    // A parent filter matches the parent and all of its children.
    const ids = db
      .select({ id: categories.id })
      .from(categories)
      .where(or(eq(categories.id, filters.categoryId), eq(categories.parentId, filters.categoryId)));
    conds.push(inArray(entries.categoryId, ids));
  }
  if (filters.memberId) conds.push(eq(entries.ownerId, filters.memberId));
  if (filters.paymentMethod) conds.push(eq(entries.paymentMethod, filters.paymentMethod));
  if (filters.type) conds.push(eq(entries.type, filters.type));
  if (filters.tag) {
    conds.push(
      sql`exists (select 1 from ${entryTags} join ${tags} on ${tags.id} = ${entryTags.tagId}
                  where ${entryTags.entryId} = ${entries.id} and ${tags.name} = ${filters.tag})`,
    );
  }
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(entries.description, pattern), ilike(entries.merchant, pattern)));
  }
  return and(...conds)!;
}
