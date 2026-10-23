/**
 * Best-effort sliding-window limiter kept in memory. Each serverless instance has its own window,
 * so the real ceiling can be a small multiple of `limit` — acceptable for ~10 users protecting a
 * shared free LLM quota (see DECISIONS.md, implementation notes).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit and returns whether it is allowed. */
    take(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
