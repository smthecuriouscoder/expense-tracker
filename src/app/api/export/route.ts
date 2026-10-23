import { categoryLabel } from "@/lib/categories";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { parseFilters } from "@/lib/filters";
import { minorToRupees } from "@/lib/money";
import { getDb } from "@/server/db";
import { listEntries } from "@/server/entries";
import { AppError } from "@/server/errors";
import { getCurrentUser } from "@/server/session";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote everything; neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV of every entry visible under the given filters (all pages). Backup against free-tier data loss. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const filters = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  const db = await getDb();

  const header = ["Date", "Type", "Amount (INR)", "Category", "Description", "Merchant", "Payment method", "Tags", "Group", "Logged by", "Original text"];
  const lines = [header.map(csvCell).join(",")];
  try {
    for (let page = 1; ; page++) {
      const { rows, pageCount } = await listEntries(db, user.id, filters, page);
      for (const r of rows) {
        lines.push(
          [
            r.date,
            r.type,
            minorToRupees(r.amountMinor).toFixed(2),
            categoryLabel({ name: r.categoryName, parentName: r.parentCategoryName }),
            r.description,
            r.merchant,
            r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : "",
            r.tags.map((t) => `#${t}`).join(" "),
            r.groupName ?? "Private",
            r.ownerName,
            r.rawText,
          ]
            .map(csvCell)
            .join(","),
        );
      }
      if (page >= pageCount) break;
    }
  } catch (err) {
    if (err instanceof AppError) return new Response(err.message, { status: 403 });
    throw err;
  }

  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${filters.from}-to-${filters.to}.csv"`,
    },
  });
}
