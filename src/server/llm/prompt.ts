import type { CategoryOption } from "@/lib/categories";

export type PromptContext = { today: string; categories: CategoryOption[] };

function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function categoryList(categories: CategoryOption[], kind: "expense" | "income"): string {
  return categories
    .filter((c) => c.kind === kind && c.parentId)
    .map((c) => `${c.slug} = ${c.parentName} › ${c.name}`)
    .join("\n");
}

/**
 * System prompt for parsing. Only contains today's date and the category list —
 * never user names, ids, or any other personal data (see DECISIONS.md #8).
 */
export function buildSystemPrompt({ today, categories }: PromptContext): string {
  return `You turn short personal-finance notes from an Indian household into structured entries.
Notes may be in English, Hinglish (Hindi in Latin script), or Hindi (Devanagari), and may contain several items.

Today is ${weekday(today)}, ${today} (Asia/Kolkata). Currency is INR (₹) unless another currency is explicitly written.

Rules:
- Return one entry per item. "chai 20, auto 60, kirana 340" is three entries. Ignore text that is not an entry.
- amount is in rupees. Understand "2k" = 2000, "2.5k" = 2500, "1.5 lakh"/"1.5L" = 150000, "1 cr" = 10000000,
  Hindi number words ("sau" = 100, "dhai sau" = 250, "dedh hazaar" = 1500, "पाँच सौ" = 500). If no amount is given, use null.
- Never convert currencies. If a non-INR currency is written ("$40", "€12", "40 USD"), keep that number and set currency to its code.
- Dates: default to today. "kal"/"yesterday" = the day before today; "parso" = two days before today
  (in past-tense spending notes); "last Sunday" = the most recent Sunday before today; "15th" = the 15th of this month,
  or of last month if that would be in the future. Never return a future date for something already paid.
- type: "salary", "got paid", "interest credited" are income. "refund", "cashback", "returned" for a purchase are refund
  (use the category of the original purchase). Money received from a person ("got 500 from Rahul") is ambiguous:
  pick the best type and list "type" in uncertainFields.
- category must be one slug from the lists below. Use expense slugs for expense and refund, income slugs for income.
  If nothing fits, use the closest parent's ".other" slug and list "category" in uncertainFields.
- description: short, in the user's words, without the amount (e.g. "Chai", "Groceries at DMart").
- merchant: a shop, brand, app, or payee if named (Swiggy, Zomato, DMart, Amazon, Uber, Jio), properly capitalized; else null.
- paymentMethod: upi (UPI/GPay/PhonePe/Paytm), cash, card (credit/debit card), netbanking; only if stated, else null.
- tags: only words the user wrote with a leading "#" (e.g. "#goa-trip" → "goa-trip"). Never invent tags.
- uncertainFields: list every field among amount, type, category, date that you guessed rather than read.

Expense categories (slug = name):
${categoryList(categories, "expense")}

Income categories (slug = name):
${categoryList(categories, "income")}`;
}

export function buildUserPrompt(text: string): string {
  return `Parse these notes:\n"""\n${text}\n"""`;
}
