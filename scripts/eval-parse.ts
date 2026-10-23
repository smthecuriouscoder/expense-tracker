// Live evaluation of the LLM parser against tests/fixtures/parse-cases.json.
// Uses real API keys from .env.local (costs free-tier quota) and an in-memory DB for categories.
//
//   pnpm eval:parse                      # whole fallback chain, as in production
//   pnpm eval:parse --provider groq      # only providers whose name contains "groq"
//   pnpm eval:parse --break-primary      # simulate the primary failing to check fallback
//   pnpm eval:parse --only 5             # first N cases
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { listCategories } from "../src/server/categories";
import { connect } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";
import { parseExpenseText } from "../src/server/llm/parse";
import { providersFromEnv, type ParseProvider } from "../src/server/llm/providers";
import type { ReviewField } from "../src/server/llm/schema";

config({ path: ".env.local" });

type Expected = {
  type?: string;
  amount?: number;
  category?: string;
  date?: string;
  merchant?: string;
  paymentMethod?: string;
  tags?: string[];
  review?: ReviewField[];
};
type Fixture = { today: string; cases: { text: string; expect: Expected[] }[] };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};

async function main() {
  const fixture: Fixture = JSON.parse(readFileSync("tests/fixtures/parse-cases.json", "utf8"));
  const { db, migrate } = await connect("pglite:memory");
  await migrate();
  await seedDatabase(db);
  const categories = await listCategories(db);
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));

  let providers: ParseProvider[] = providersFromEnv();
  const only = flag("--provider");
  if (only) providers = providers.filter((p) => p.name.includes(only));
  if (args.includes("--break-primary") && providers[0]) {
    providers[0] = { name: `${providers[0].name} (broken)`, generate: async () => Promise.reject(new Error("simulated outage")) };
  }
  if (providers.length === 0) throw new Error("No LLM providers configured. Set GOOGLE_GENERATIVE_AI_API_KEY and/or GROQ_API_KEY.");
  console.log(`Providers: ${providers.map((p) => p.name).join(" → ")}\n`);

  const cases = fixture.cases.slice(0, Number(flag("--only")) || undefined);
  const score = { checks: 0, passed: 0, failedCases: 0 };
  const usedProviders = new Map<string, number>();

  for (const [i, c] of cases.entries()) {
    const result = await parseExpenseText(c.text, { categories, today: fixture.today }, providers);
    const problems: string[] = [];
    if (!result.ok) {
      problems.push(`parse failed: ${result.error}`);
    } else {
      usedProviders.set(result.provider, (usedProviders.get(result.provider) ?? 0) + 1);
      if (result.drafts.length !== c.expect.length) problems.push(`expected ${c.expect.length} entries, got ${result.drafts.length}`);
      c.expect.forEach((exp, j) => {
        const d = result.drafts[j];
        if (!d) return;
        const check = (field: string, ok: boolean, got: unknown) => {
          score.checks++;
          if (ok) score.passed++;
          else problems.push(`#${j + 1} ${field}: expected ${JSON.stringify(exp[field as keyof Expected])}, got ${JSON.stringify(got)}`);
        };
        if (exp.type) check("type", d.type === exp.type, d.type);
        if (exp.amount !== undefined) check("amount", d.amountMinor === exp.amount * 100, d.amountMinor && d.amountMinor / 100);
        if (exp.category) check("category", slugById.get(d.categoryId) === exp.category, slugById.get(d.categoryId));
        if (exp.date) check("date", d.date === exp.date, d.date);
        if (exp.merchant) check("merchant", d.merchant?.toLowerCase() === exp.merchant.toLowerCase(), d.merchant);
        if (exp.paymentMethod) check("paymentMethod", d.paymentMethod === exp.paymentMethod, d.paymentMethod);
        if (exp.tags) check("tags", JSON.stringify(d.tags) === JSON.stringify(exp.tags), d.tags);
        for (const r of exp.review ?? []) check(`review:${r}`, d.reviewFields.includes(r), d.reviewFields);
      });
    }
    if (problems.length) score.failedCases++;
    console.log(`${problems.length ? "✗" : "✓"} ${String(i + 1).padStart(2)} ${c.text}`);
    for (const p of problems) console.log(`      ${p}`);
  }

  const pct = score.checks ? ((score.passed / score.checks) * 100).toFixed(1) : "0";
  console.log(`\nField accuracy: ${score.passed}/${score.checks} (${pct}%) · cases with issues: ${score.failedCases}/${cases.length}`);
  console.log(`Answered by: ${[...usedProviders].map(([p, n]) => `${p} ×${n}`).join(", ") || "none"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
