import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, Lock, Receipt, Users } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { FilterBar } from "@/components/filter-bar";
import { buttonVariants } from "@/components/ui/button";
import { categoryLabel } from "@/lib/categories";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { addDays, formatDate } from "@/lib/dates";
import { filtersToSearchParams } from "@/lib/filters";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listEntries, type EntryRow } from "@/server/entries";
import { authed } from "@/server/session";
import { loadFilterContext } from "@/server/views";

export const metadata: Metadata = { title: "Transactions" };

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDate(date);
}

/** Groups consecutive rows (already sorted by date desc) by day. */
function byDay(rows: EntryRow[]) {
  const days: { date: string; rows: EntryRow[]; spend: number }[] = [];
  for (const r of rows) {
    let day = days.at(-1);
    if (!day || day.date !== r.date) days.push((day = { date: r.date, rows: [], spend: 0 }));
    day.rows.push(r);
    day.spend += r.type === "expense" ? r.amountMinor : r.type === "refund" ? -r.amountMinor : 0;
  }
  return days;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const { user, db } = await authed();
  const params = await searchParams;
  const ctx = await loadFilterContext(db, user.id, params);
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total, pageCount } = await listEntries(db, user.id, ctx.filters, page);
  const query = filtersToSearchParams(ctx.filters);
  const pageHref = (p: number) => `/transactions?${new URLSearchParams([...query, ["page", String(p)]])}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "entry" : "entries"}
          </p>
          <h1 className="text-3xl font-semibold">Transactions</h1>
        </div>
        <a href={`/api/export?${query}`} className={cn(buttonVariants({ variant: "outline" }), "glass h-10 rounded-xl")}>
          <Download /> Export CSV
        </a>
      </div>
      <FilterBar {...ctx} showSearch />

      {rows.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Receipt className="size-6" />
          </span>
          <p className="font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">
            Try another period, or{" "}
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              log an expense
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {byDay(rows).map((day) => (
            <section key={day.date} aria-label={dayLabel(day.date, ctx.today)}>
              <div className="sticky top-20 z-10 mb-2 flex items-center justify-between px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <span className="glass-strong rounded-full px-3 py-1">{dayLabel(day.date, ctx.today)}</span>
                {day.spend !== 0 && <span className="tabular-nums">{formatINR(day.spend)}</span>}
              </div>
              <ul className="glass divide-y divide-border overflow-hidden rounded-3xl">
                {day.rows.map((r) => {
                  const mine = r.ownerId === user.id;
                  const body = (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CategoryIcon slug={r.categorySlug} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {r.description}
                          {r.merchant && <span className="font-normal text-muted-foreground"> · {r.merchant}</span>}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          {r.groupName ? <Users className="size-3 shrink-0" aria-label="Shared" /> : <Lock className="size-3 shrink-0" aria-label="Private" />}
                          <span className="truncate">
                            {categoryLabel({ name: r.categoryName, parentName: r.parentCategoryName })}
                            {r.groupName && ` · ${r.groupName}`}
                            {r.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[r.paymentMethod]}`}
                            {!mine && ` · ${r.ownerActive ? r.ownerName : `${r.ownerName} (inactive)`}`}
                            {r.tags.length > 0 && ` · ${r.tags.map((t) => `#${t}`).join(" ")}`}
                          </span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-heading font-semibold tabular-nums",
                          r.type === "income" && "text-income",
                          r.type === "refund" && "text-refund",
                        )}
                      >
                        {r.type === "expense" ? "−" : "+"}
                        {formatINR(r.amountMinor)}
                      </span>
                      {mine && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    </div>
                  );
                  return (
                    <li key={r.id}>
                      {mine ? (
                        <Link href={`/transactions/${r.id}`} className="block transition-colors hover:bg-muted/50 focus-visible:bg-muted/50" aria-label={`Edit ${r.description}`}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: "outline" }), "glass h-10 rounded-xl", page <= 1 && "pointer-events-none opacity-50")}
          >
            Previous
          </Link>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= pageCount}
            className={cn(buttonVariants({ variant: "outline" }), "glass h-10 rounded-xl", page >= pageCount && "pointer-events-none opacity-50")}
          >
            Next
          </Link>
        </nav>
      )}
    </div>
  );
}
