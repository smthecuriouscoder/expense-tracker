import { NextResponse } from "next/server";
import { z } from "zod";
import { todayIST } from "@/lib/dates";
import { listCategories } from "@/server/categories";
import { getDb } from "@/server/db";
import { parseExpenseText } from "@/server/llm/parse";
import { providersFromEnv } from "@/server/llm/providers";
import { createRateLimiter } from "@/server/rate-limit";
import { getCurrentUser } from "@/server/session";

// Leaves room for both providers' 12s timeouts.
export const maxDuration = 30;

const limiter = createRateLimiter(Number(process.env.PARSE_RATE_LIMIT_PER_HOUR) || 60, 60 * 60 * 1000);
const body = z.object({ text: z.string() });

/** POST { text } → { ok: true, drafts, provider } | { ok: false, error }. Nothing is saved here. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "empty_input" }, { status: 400 });

  if (!limiter.take(user.id)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const providers = providersFromEnv();
  if (providers.length === 0) return NextResponse.json({ ok: false, error: "llm_unavailable" }, { status: 503 });

  const result = await parseExpenseText(parsed.data.text, { categories: await listCategories(await getDb()), today: todayIST() }, providers);
  if (!result.ok) {
    if (result.attempts.length) console.warn("LLM parse failed", result.attempts);
    return NextResponse.json({ ok: false, error: result.error });
  }
  return NextResponse.json(result);
}
