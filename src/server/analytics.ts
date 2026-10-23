import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { addDays, addMonths, daysInclusive, endOfMonth, previousPeriod, startOfMonth } from "@/lib/dates";
import type { Filters } from "@/lib/filters";
import type { Db } from "./db/client";
import { categories, entries, entryTags, tags, users } from "./db/schema";
import { entryConditions } from "./entry-conditions";

// All dashboard numbers. Spend = expenses − refunds; income is reported separately and only in "Me" scope.
// Every query goes through entryConditions(), which enforces access control.

const spend = sql<number>`coalesce(sum(case
  when ${entries.type} = 'expense' then ${entries.amountMinor}
  when ${entries.type} = 'refund' then -${entries.amountMinor}
  else 0 end), 0)::bigint`.mapWith(Number);

const income = sql<number>`coalesce(sum(case when ${entries.type} = 'income' then ${entries.amountMinor} else 0 end), 0)::bigint`.mapWith(
  Number,
);

const notIncome = sql`${entries.type} <> 'income'`;

const parentCategory = alias(categories, "parent_category");

export type Granularity = "day" | "week" | "month";

export function pickGranularity(from: string, to: string): Granularity {
  const days = daysInclusive(from, to);
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

/** Start of the bucket containing `iso` (weeks start on Monday, like Postgres date_trunc). */
function bucketStart(iso: string, g: Granularity): string {
  if (g === "day") return iso;
  if (g === "month") return startOfMonth(iso);
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

function allBuckets(from: string, to: string, g: Granularity): string[] {
  const out: string[] = [];
  for (let b = bucketStart(from, g); b <= to; b = g === "month" ? addMonths(b, 1) : addDays(b, g === "week" ? 7 : 1)) {
    out.push(b);
  }
  return out;
}

async function where(db: Db, userId: string, f: Filters, ...extra: (SQL | undefined)[]) {
  return and(await entryConditions(db, userId, f), ...extra)!;
}

export async function getKpis(db: Db, userId: string, f: Filters) {
  const prev = previousPeriod(f.from, f.to);
  const [[current], [previous]] = await Promise.all([
    db.select({ spend, income }).from(entries).where(await where(db, userId, f)),
    db.select({ spend }).from(entries).where(await entryConditions(db, userId, f, prev)),
  ]);
  const days = daysInclusive(f.from, f.to);
  const showIncome = f.scope.kind === "me" && current.income > 0;
  return {
    spend: current.spend,
    avgPerDay: Math.round(current.spend / days),
    previousSpend: previous.spend,
    changePct: previous.spend > 0 ? (current.spend - previous.spend) / previous.spend : null,
    income: showIncome ? current.income : null,
    savingsRate: showIncome ? (current.income - current.spend) / current.income : null,
  };
}

export async function getSpendOverTime(db: Db, userId: string, f: Filters) {
  const g = pickGranularity(f.from, f.to);
  // Inlined (not a bind parameter) so SELECT and GROUP BY are the same expression; `g` is a fixed enum.
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(g)}', ${entries.date}::timestamp), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ bucket, spend })
    .from(entries)
    .where(await where(db, userId, f, notIncome))
    .groupBy(bucket);
  const byBucket = new Map(rows.map((r) => [r.bucket, r.spend]));
  return { granularity: g, points: allBuckets(f.from, f.to, g).map((b) => ({ bucket: b, spend: byBucket.get(b) ?? 0 })) };
}

/**
 * Spend per top-level category, or per subcategory when the category filter is a parent (drill-down).
 */
export async function getCategoryBreakdown(db: Db, userId: string, f: Filters) {
  let drillParent: { id: string; name: string } | null = null;
  if (f.categoryId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, f.categoryId));
    if (c && !c.parentId) drillParent = { id: c.id, name: c.name };
  }
  const groupId = drillParent ? categories.id : sql<string>`coalesce(${categories.parentId}, ${categories.id})`;
  const groupName = drillParent ? categories.name : sql<string>`coalesce(${parentCategory.name}, ${categories.name})`;
  const groupSlug = drillParent ? categories.slug : sql<string>`coalesce(${parentCategory.slug}, ${categories.slug})`;
  const rows = await db
    .select({ id: groupId, name: groupName, slug: groupSlug, spend })
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(parentCategory, eq(parentCategory.id, categories.parentId))
    .where(await where(db, userId, f, notIncome))
    .groupBy(groupId, groupName, groupSlug)
    .orderBy(desc(spend));
  return { drillParent, rows: rows.filter((r) => r.spend !== 0) };
}

export async function getTopMerchants(db: Db, userId: string, f: Filters, limit = 8) {
  return db
    .select({ merchant: sql<string>`${entries.merchant}`, spend, count: sql<number>`count(*)::int` })
    .from(entries)
    .where(await where(db, userId, f, notIncome, isNotNull(entries.merchant)))
    .groupBy(entries.merchant)
    .orderBy(desc(spend))
    .limit(limit);
}

/** Per-day spend for the calendar heatmap (capped to the last 366 days of the range). */
export async function getDailySpend(db: Db, userId: string, f: Filters) {
  const from = daysInclusive(f.from, f.to) > 366 ? addDays(f.to, -365) : f.from;
  const rows = await db
    .select({ date: entries.date, spend })
    .from(entries)
    .where(await where(db, userId, { ...f, from }, notIncome))
    .groupBy(entries.date);
  return { from, to: f.to, days: rows };
}

/** Group scope only: who is carrying the shared spending. */
export async function getSpendByMember(db: Db, userId: string, f: Filters) {
  if (f.scope.kind !== "group") return [];
  return db
    .select({ userId: users.id, name: users.name, active: users.active, spend })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.ownerId))
    .where(await where(db, userId, f, notIncome))
    .groupBy(users.id, users.name, users.active)
    .orderBy(desc(spend));
}

export async function getTagTotals(db: Db, userId: string, f: Filters, limit = 10) {
  return db
    .select({ tag: tags.name, spend, count: sql<number>`count(*)::int` })
    .from(entries)
    .innerJoin(entryTags, eq(entryTags.entryId, entries.id))
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(await where(db, userId, f, notIncome))
    .groupBy(tags.name)
    .orderBy(desc(spend))
    .limit(limit);
}

/** Top-level category spend in this period vs the previous period of equal length. */
export async function getCategoryComparison(db: Db, userId: string, f: Filters) {
  const prev = previousPeriod(f.from, f.to);
  const id = sql<string>`coalesce(${categories.parentId}, ${categories.id})`;
  const name = sql<string>`coalesce(${parentCategory.name}, ${categories.name})`;
  const query = async (range: { from: string; to: string }) =>
    db
      .select({ id, name, spend })
      .from(entries)
      .innerJoin(categories, eq(categories.id, entries.categoryId))
      .leftJoin(parentCategory, eq(parentCategory.id, categories.parentId))
      .where(and(await entryConditions(db, userId, f, range), notIncome))
      .groupBy(id, name);
  const [cur, old] = await Promise.all([query(f), query(prev)]);
  const merged = new Map<string, { name: string; current: number; previous: number }>();
  for (const r of cur) merged.set(r.id, { name: r.name, current: r.spend, previous: 0 });
  for (const r of old) merged.set(r.id, { name: r.name, current: merged.get(r.id)?.current ?? 0, previous: r.spend });
  return {
    previous: prev,
    rows: [...merged.values()].filter((r) => r.current || r.previous).sort((a, b) => b.current - a.current),
  };
}

/** Me scope only: income vs spend for the 6 months ending at the range end. Months without income are flagged. */
export async function getIncomeVsExpense(db: Db, userId: string, f: Filters) {
  if (f.scope.kind !== "me") return null;
  const from = addMonths(f.to, -5);
  const to = endOfMonth(f.to);
  const month = sql<string>`to_char(date_trunc('month', ${entries.date}::timestamp), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ month, spend, income })
    .from(entries)
    .where(await entryConditions(db, userId, f, { from, to }))
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const months = allBuckets(from, to, "month").map((m) => {
    const r = byMonth.get(m);
    return { month: m, spend: r?.spend ?? 0, income: r?.income ?? 0, hasIncome: (r?.income ?? 0) > 0 };
  });
  return months.some((m) => m.hasIncome) ? months : [];
}

export async function getPaymentMethodSplit(db: Db, userId: string, f: Filters) {
  const method = sql<string>`coalesce(${entries.paymentMethod}::text, 'unspecified')`;
  return db
    .select({ method, spend })
    .from(entries)
    .where(await where(db, userId, f, notIncome))
    .groupBy(method)
    .orderBy(desc(spend));
}

export async function getLargestTransactions(db: Db, userId: string, f: Filters, limit = 10) {
  return db
    .select({
      id: entries.id,
      date: entries.date,
      description: entries.description,
      merchant: entries.merchant,
      amountMinor: entries.amountMinor,
      ownerName: users.name,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.ownerId))
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .where(await where(db, userId, f, eq(entries.type, "expense")))
    .orderBy(desc(entries.amountMinor))
    .limit(limit);
}

/** Everything the dashboard needs, fetched in parallel. */
export async function getDashboard(db: Db, userId: string, f: Filters) {
  const [kpis, overTime, categoryBreakdown, merchants, daily, byMember, tagTotals, comparison, incomeVsExpense, paymentMethods, largest] =
    await Promise.all([
      getKpis(db, userId, f),
      getSpendOverTime(db, userId, f),
      getCategoryBreakdown(db, userId, f),
      getTopMerchants(db, userId, f),
      getDailySpend(db, userId, f),
      getSpendByMember(db, userId, f),
      getTagTotals(db, userId, f),
      getCategoryComparison(db, userId, f),
      getIncomeVsExpense(db, userId, f),
      getPaymentMethodSplit(db, userId, f),
      getLargestTransactions(db, userId, f),
    ]);
  return { kpis, overTime, categoryBreakdown, merchants, daily, byMember, tagTotals, comparison, incomeVsExpense, paymentMethods, largest };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
