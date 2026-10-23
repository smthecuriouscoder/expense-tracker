import { describe, expect, it } from "vitest";
import { addMonths, endOfMonth, isISODate, previousPeriod, todayIST } from "@/lib/dates";
import { normalizeTags } from "@/lib/entry-input";
import { filtersToSearchParams, parseFilters } from "@/lib/filters";
import { formatINR, parseRupeesInput, rupeesToMinor } from "@/lib/money";
import { createRateLimiter } from "@/server/rate-limit";
import { devBypassEmail } from "@/server/dev-bypass";

describe("money", () => {
  it("converts rupees to paise without float drift", () => {
    expect(rupeesToMinor(0.1 + 0.2)).toBe(30);
    expect(rupeesToMinor(1999.99)).toBe(199999);
  });
  it("parses typed amounts", () => {
    expect(parseRupeesInput("₹1,250.50")).toBe(125050);
    expect(parseRupeesInput("0")).toBeNull();
    expect(parseRupeesInput("12.345")).toBeNull();
    expect(parseRupeesInput("abc")).toBeNull();
  });
  it("formats with Indian grouping", () => {
    expect(formatINR(12_500_000)).toBe("₹1,25,000");
  });
});

describe("dates", () => {
  it("uses IST for today", () => {
    // 20:00 UTC on Oct 22 is already Oct 23 in India.
    expect(todayIST(new Date("2026-10-22T20:00:00Z"))).toBe("2026-10-23");
  });
  it("validates ISO dates", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
  });
  it("handles month ends", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("compares whole months to the previous calendar months", () => {
    expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod("2026-01-01", "2026-03-31")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });
  it("compares arbitrary ranges to the same number of days before", () => {
    expect(previousPeriod("2026-10-11", "2026-10-20")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });
});

describe("filters", () => {
  it("defaults to this month in Me scope with shared included", () => {
    const f = parseFilters({}, "2026-10-22");
    expect(f).toMatchObject({ scope: { kind: "me", includeShared: true }, from: "2026-10-01", to: "2026-10-31" });
  });
  it("round-trips through the URL and drops invalid values", () => {
    const groupId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const f = parseFilters({ scope: groupId, member: groupId, pm: "upi", tag: "#Goa-Trip", cat: "nope" }, "2026-10-22");
    expect(f.scope).toEqual({ kind: "group", groupId });
    expect(f.tag).toBe("goa-trip");
    expect(f.categoryId).toBeUndefined();
    expect(parseFilters(Object.fromEntries(filtersToSearchParams(f)), "2026-10-22")).toEqual(f);
  });
  it("ignores member filter in Me scope", () => {
    expect(parseFilters({ member: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }).memberId).toBeUndefined();
  });
});

describe("tags", () => {
  it("normalizes and dedupes", () => {
    expect(normalizeTags(["#Goa Trip", "goa-trip", "  ", "#Diwali"])).toEqual(["goa-trip", "diwali"]);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    const rl = createRateLimiter(2, 1000);
    expect(rl.take("u", 0)).toBe(true);
    expect(rl.take("u", 10)).toBe(true);
    expect(rl.take("u", 20)).toBe(false);
    expect(rl.take("u", 1001)).toBe(true);
    expect(rl.take("other", 20)).toBe(true);
  });
});

describe("dev login bypass", () => {
  it("only works in development with the variable set", () => {
    expect(devBypassEmail({ NODE_ENV: "development", DEV_AUTH_BYPASS_EMAIL: " Me@Example.com " })).toBe("me@example.com");
    expect(devBypassEmail({ NODE_ENV: "production", DEV_AUTH_BYPASS_EMAIL: "me@example.com" })).toBeNull();
    expect(devBypassEmail({ NODE_ENV: "test", DEV_AUTH_BYPASS_EMAIL: "me@example.com" })).toBeNull();
    expect(devBypassEmail({ NODE_ENV: "development" })).toBeNull();
  });
});
