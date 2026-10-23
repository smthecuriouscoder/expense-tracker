const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Converts a rupee amount (e.g. 249.5) to integer paise, rounding to the nearest paisa. */
export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

export function minorToRupees(minor: number): number {
  return minor / 100;
}

/** Parses user-typed rupees ("1,250.50", "₹ 99") into paise. Returns null when invalid or not positive. */
export function parseRupeesInput(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = rupeesToMinor(Number(cleaned));
  return minor > 0 ? minor : null;
}

/** "₹1,25,000" — Indian digit grouping. */
export function formatINR(minor: number): string {
  return inrFormatter.format(minorToRupees(minor));
}

const inrWholeFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Rounded to the rupee — for aggregates on the dashboard where paise are noise. */
export function formatINRWhole(minor: number): string {
  return inrWholeFormatter.format(Math.round(minorToRupees(minor)));
}

/** "₹1.3L" style for chart axes and tiles. */
export function formatINRCompact(minor: number): string {
  return inrCompactFormatter.format(minorToRupees(minor));
}
