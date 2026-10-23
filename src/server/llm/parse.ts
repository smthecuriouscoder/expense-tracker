import type { CategoryOption } from "@/lib/categories";
import { toDrafts } from "./post-validate";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { ParseProvider } from "./providers";
import { llmOutputSchema, type Draft } from "./schema";

export const MAX_INPUT_CHARS = 2000;

export type ParseResult =
  | { ok: true; drafts: Draft[]; provider: string }
  | { ok: false; error: "empty_input" | "too_long" | "llm_unavailable"; attempts: { provider: string; error: string }[] };

/**
 * Parses free text into review drafts, trying each provider in order.
 * When every provider fails the caller should open the manual form with the raw text (DECISIONS.md #7).
 */
export async function parseExpenseText(
  text: string,
  ctx: { categories: CategoryOption[]; today: string },
  providers: ParseProvider[],
): Promise<ParseResult> {
  const input = text.trim();
  if (!input) return { ok: false, error: "empty_input", attempts: [] };
  if (input.length > MAX_INPUT_CHARS) return { ok: false, error: "too_long", attempts: [] };

  const system = buildSystemPrompt(ctx);
  const prompt = buildUserPrompt(input);
  const attempts: { provider: string; error: string }[] = [];

  for (const provider of providers) {
    try {
      const output = llmOutputSchema.parse(await provider.generate({ system, prompt }));
      return { ok: true, drafts: toDrafts(output.entries, { ...ctx, rawText: input }), provider: provider.name };
    } catch (err) {
      attempts.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: false, error: "llm_unavailable", attempts };
}
