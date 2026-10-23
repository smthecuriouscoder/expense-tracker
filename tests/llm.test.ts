import { beforeAll, describe, expect, it } from "vitest";
import type { CategoryOption } from "@/lib/categories";
import { listCategories } from "@/server/categories";
import { parseExpenseText } from "@/server/llm/parse";
import { normalizeMerchant, toDrafts } from "@/server/llm/post-validate";
import { buildSystemPrompt } from "@/server/llm/prompt";
import type { ParseProvider } from "@/server/llm/providers";
import type { LlmEntry } from "@/server/llm/schema";
import { createTestDb } from "./helpers/db";

const TODAY = "2026-10-22";
let categories: CategoryOption[];
const idOf = (slug: string) => categories.find((c) => c.slug === slug)!.id;

const llmEntry = (overrides: Partial<LlmEntry> = {}): LlmEntry => ({
  type: "expense",
  amount: 20,
  currency: "INR",
  category: "food.snacks",
  date: TODAY,
  description: "Chai",
  merchant: null,
  paymentMethod: null,
  tags: [],
  uncertainFields: [],
  ...overrides,
});

const fixed = (name: string, entries: LlmEntry[]): ParseProvider => ({ name, generate: async () => ({ entries }) });
const failing = (name: string): ParseProvider => ({
  name,
  generate: async () => {
    throw new Error("429 Too Many Requests");
  },
});

beforeAll(async () => {
  categories = await listCategories(await createTestDb());
});

describe("prompt", () => {
  it("includes today, leaf category slugs, and no personal data", () => {
    const p = buildSystemPrompt({ today: TODAY, categories });
    expect(p).toContain("Thursday, 2026-10-22");
    expect(p).toContain("food.groceries = Food › Groceries / Kirana");
    expect(p).toContain("income.salary = Income › Salary");
    expect(p).not.toMatch(/^food = /m);
  });
});

describe("post-validation", () => {
  const ctx = (rawText = "") => ({ categories, today: TODAY, rawText });

  it("converts rupees to paise and maps slugs to ids", () => {
    const [d] = toDrafts([llmEntry({ amount: 2499.5 })], ctx());
    expect(d).toMatchObject({ amountMinor: 249950, categoryId: idOf("food.snacks"), reviewFields: [] });
  });

  it("flags missing amounts and foreign currency without converting", () => {
    const [missing, usd] = toDrafts([llmEntry({ amount: null }), llmEntry({ amount: 40, currency: "usd" })], ctx());
    expect(missing.amountMinor).toBeNull();
    expect(missing.reviewFields).toContain("amount");
    expect(usd.amountMinor).toBeNull();
    expect(usd.reviewNotes[0]).toMatch(/USD 40/);
  });

  it("falls back to Other for unknown, parent, or wrong-kind categories", () => {
    const [unknown, parent, wrongKind] = toDrafts(
      [llmEntry({ category: "food.caviar" }), llmEntry({ category: "transport" }), llmEntry({ type: "income", category: "food.dining" })],
      ctx(),
    );
    expect(unknown.categoryId).toBe(idOf("misc.other"));
    expect(unknown.reviewFields).toContain("category");
    expect(parent.categoryId).toBe(idOf("transport.other"));
    expect(wrongKind.categoryId).toBe(idOf("income.other"));
  });

  it("flags invalid and future dates", () => {
    const [bad, future] = toDrafts([llmEntry({ date: "kal" }), llmEntry({ date: "2026-11-01" })], ctx());
    expect(bad.date).toBe(TODAY);
    expect(bad.reviewFields).toContain("date");
    expect(future.reviewFields).toContain("date");
  });

  it("keeps only tags the user actually wrote", () => {
    const [d] = toDrafts([llmEntry({ tags: ["goa-trip", "travel"] })], ctx("hotel 4000 #Goa-Trip"));
    expect(d.tags).toEqual(["goa-trip"]);
  });

  it("normalizes merchant casing", () => {
    expect(normalizeMerchant("swiggy instamart")).toBe("Swiggy Instamart");
    expect(normalizeMerchant("DMart")).toBe("DMart");
    expect(normalizeMerchant("  ")).toBeNull();
  });
});

describe("provider fallback", () => {
  const ctx = () => ({ categories, today: TODAY });

  it("uses the first provider that succeeds", async () => {
    const r = await parseExpenseText("chai 20", ctx(), [failing("google"), fixed("groq", [llmEntry()])]);
    expect(r).toMatchObject({ ok: true, provider: "groq" });
  });

  it("treats schema-invalid output as a failure", async () => {
    const bad: ParseProvider = { name: "bad", generate: async () => ({ entries: [{ nope: 1 }] }) as never };
    const r = await parseExpenseText("chai 20", ctx(), [bad, fixed("groq", [llmEntry()])]);
    expect(r.ok && r.provider).toBe("groq");
  });

  it("reports llm_unavailable when every provider fails", async () => {
    const r = await parseExpenseText("chai 20", ctx(), [failing("google"), failing("groq")]);
    expect(r).toMatchObject({ ok: false, error: "llm_unavailable" });
    expect(!r.ok && r.attempts).toHaveLength(2);
  });

  it("rejects empty and oversized input without calling a provider", async () => {
    expect(await parseExpenseText("   ", ctx(), [])).toMatchObject({ error: "empty_input" });
    expect(await parseExpenseText("x".repeat(2001), ctx(), [])).toMatchObject({ error: "too_long" });
  });
});
