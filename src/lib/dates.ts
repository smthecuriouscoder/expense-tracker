import { TIME_ZONE } from "./constants";

// Dates are plain "YYYY-MM-DD" strings in Asia/Kolkata. Arithmetic is done in UTC
// on those strings so the server's own time zone never shifts a day.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const istFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return istFormatter.format(now);
}

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Inclusive number of days between two dates. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000) + 1;
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUTC(d);
}

export function addMonths(iso: string, months: number): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fromUTC(d);
}

/**
 * The comparison period before [from, to]: the previous N calendar months when the range is whole months
 * (Oct → Sep), otherwise the same number of days immediately before.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (from === startOfMonth(from) && to === endOfMonth(to)) {
    const months =
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    return { from: addMonths(from, -months), to: addDays(from, -1) };
  }
  const length = daysInclusive(from, to);
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

/** "Oct 2026" */
export function formatMonth(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "22 Oct 2026" */
export function formatDate(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
