import { z } from "zod";
import { ENTRY_TYPES, PAYMENT_METHODS, type EntryType, type PaymentMethod } from "@/lib/constants";

export const REVIEW_FIELDS = ["amount", "type", "category", "date"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

/** Shape the model must return. Kept flat and simple so small free models follow it reliably. */
export const llmEntrySchema = z.object({
  type: z.enum(ENTRY_TYPES).describe("expense = money spent; income = money earned; refund = money returned for an earlier purchase"),
  amount: z.number().nullable().describe("Amount in major units (rupees), e.g. 2500 for '2.5k'. null if no amount is stated."),
  currency: z.string().describe("ISO 4217 code. INR unless another currency is explicitly written."),
  category: z.string().nullable().describe("A category slug from the provided list, or null if unsure."),
  date: z.string().describe("YYYY-MM-DD, resolved against today's date."),
  description: z.string().describe("Short description in the user's own words."),
  merchant: z.string().nullable().describe("Shop/app/payee name if mentioned (e.g. Swiggy, DMart), else null."),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().describe("Only if the text says how it was paid, else null."),
  tags: z.array(z.string()).describe("Only words the user explicitly wrote with a leading #, without the #."),
  uncertainFields: z.array(z.enum(REVIEW_FIELDS)).describe("Fields you had to guess."),
});

export const llmOutputSchema = z.object({ entries: z.array(llmEntrySchema) });

export type LlmEntry = z.infer<typeof llmEntrySchema>;
export type LlmOutput = z.infer<typeof llmOutputSchema>;

/** A parsed entry awaiting user review. Fields in `reviewFields` must be checked before saving. */
export type Draft = {
  type: EntryType;
  amountMinor: number | null;
  categoryId: string;
  date: string;
  description: string;
  merchant: string | null;
  paymentMethod: PaymentMethod | null;
  tags: string[];
  reviewFields: ReviewField[];
  reviewNotes: string[];
};
