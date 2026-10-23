import { z } from "zod";
import { ENTRY_TYPES, PAYMENT_METHODS } from "./constants";
import { isISODate } from "./dates";

/** Normalizes tags: lowercase, no '#', only [a-z0-9-_], deduped, max 10. */
export function normalizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) => t.trim().replace(/^#+/, "").toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, ""))
    .filter((t) => t.length > 0 && t.length <= 30);
  return [...new Set(clean)].slice(0, 10);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

/** What the client submits to create or update an entry (after review). */
export const entryInputSchema = z.object({
  type: z.enum(ENTRY_TYPES),
  amountMinor: z.number().int().positive("Amount must be more than zero.").max(100_000_000_00, "Amount is too large."),
  categoryId: z.uuid("Pick a category."),
  date: z.string().refine(isISODate, "Enter a valid date."),
  description: z.string().trim().min(1, "Add a description.").max(200),
  merchant: optionalText(80),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  tags: z.array(z.string()).max(20).transform(normalizeTags),
  groupId: z.uuid().nullable(),
  rawText: optionalText(2000),
});

export type EntryInput = z.input<typeof entryInputSchema>;
export type ValidEntryInput = z.output<typeof entryInputSchema>;
