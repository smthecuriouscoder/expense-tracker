import type { CategoryOption } from "@/lib/categories";
import { CURRENCY } from "@/lib/constants";
import { formatDate, isISODate } from "@/lib/dates";
import { normalizeTags } from "@/lib/entry-input";
import { rupeesToMinor } from "@/lib/money";
import { FALLBACK_SLUG, otherSlug } from "../db/category-tree";
import type { Draft, LlmEntry, ReviewField } from "./schema";

/** Title-cases merchants the model left in lowercase ("swiggy" → "Swiggy"); keeps intentional casing ("DMart"). */
export function normalizeMerchant(raw: string | null): string | null {
  const m = raw?.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!m) return null;
  if (m !== m.toLowerCase()) return m;
  return m.replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase());
}

/** Keeps only tags that the user actually wrote as #tag in the input. */
function explicitTags(tags: string[], rawText: string): string[] {
  const written = new Set(normalizeTags([...rawText.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1])));
  return normalizeTags(tags).filter((t) => written.has(t));
}

/**
 * Turns untrusted model output into drafts the UI can show. Never trusts the model:
 * unknown categories fall back to "Other", bad dates fall back to today, and every guess is flagged for review.
 */
export function toDrafts(
  llmEntries: LlmEntry[],
  ctx: { categories: CategoryOption[]; today: string; rawText: string },
): Draft[] {
  const bySlug = new Map(ctx.categories.map((c) => [c.slug, c]));

  return llmEntries.slice(0, 50).map((e) => {
    const review = new Set<ReviewField>(e.uncertainFields);
    const notes: string[] = [];
    const kind = e.type === "income" ? "income" : "expense";

    // Amount: positive, INR only.
    let amountMinor: number | null = null;
    const currency = e.currency?.trim().toUpperCase() || CURRENCY;
    if (currency !== CURRENCY) {
      review.add("amount");
      notes.push(`Detected ${currency}${e.amount !== null ? ` ${e.amount}` : ""} — enter the amount in INR.`);
    } else if (e.amount === null || !Number.isFinite(e.amount) || e.amount <= 0) {
      review.add("amount");
      notes.push("No amount found.");
    } else {
      amountMinor = rupeesToMinor(e.amount);
    }

    // Category: must be a known leaf of the right kind; a parent slug maps to its "Other" child.
    let category = e.category ? bySlug.get(e.category.trim().toLowerCase()) : undefined;
    if (category && !category.parentId) category = bySlug.get(otherSlug(category.slug));
    if (!category || category.kind !== kind) {
      category = bySlug.get(FALLBACK_SLUG[kind]);
      review.add("category");
    }
    if (!category) throw new Error(`Fallback category ${FALLBACK_SLUG[kind]} is missing — run the seed.`);

    // Date: valid ISO, not in the future.
    let date = e.date?.trim();
    if (!date || !isISODate(date)) {
      date = ctx.today;
      review.add("date");
    } else if (date > ctx.today) {
      review.add("date");
      notes.push(`Date ${formatDate(date)} is in the future.`);
    }

    const merchant = normalizeMerchant(e.merchant);
    const description = e.description?.trim().slice(0, 200) || merchant || category.name;

    return {
      type: e.type,
      amountMinor,
      categoryId: category.id,
      date,
      description,
      merchant,
      paymentMethod: e.paymentMethod,
      tags: explicitTags(e.tags, ctx.rawText),
      reviewFields: [...review],
      reviewNotes: notes,
    };
  });
}
