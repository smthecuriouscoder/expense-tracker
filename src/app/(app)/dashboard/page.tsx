import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, PiggyBank, Users, Wallet, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { AreaTrend, CalendarHeatmap, PairedBars, RankedBars, Sparkline } from "@/components/charts";
import { CategoryIcon } from "@/components/category-icon";
import { FilterBar } from "@/components/filter-bar";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/constants";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatINR, formatINRWhole } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getDashboard } from "@/server/analytics";
import { authed } from "@/server/session";
import { loadFilterContext } from "@/server/views";
import { CategoryBreakdown } from "./widgets";

export const metadata: Metadata = { title: "Dashboard" };

function Widget({
  title,
  description,
  children,
  className,
  empty,
  table,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  empty?: boolean;
  /** Accessible table view of the same data. */
  table?: { head: string[]; rows: (string | number)[][] };
}) {
  return (
    <section className={cn("glass flex flex-col gap-4 rounded-3xl p-5", className)}>
      <header>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {empty ? <p className="py-8 text-center text-sm text-muted-foreground">No data for this view.</p> : children}
      {!empty && table && table.rows.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Show as table</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h} className="py-1 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className={cn("py-1", j > 0 && "tabular-nums")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="glass flex items-start gap-3 rounded-3xl p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.abs(v * 100).toFixed(0)}%`;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, db } = await authed();
  const ctx = await loadFilterContext(db, user.id, await searchParams);
  const d = await getDashboard(db, user.id, ctx.filters);
  const { kpis } = d;
  const isGroup = ctx.filters.scope.kind === "group";
  const scopeName = isGroup ? (ctx.groups.find((g) => ctx.filters.scope.kind === "group" && g.id === ctx.filters.scope.groupId)?.name ?? "Group") : "You";

  const bucketLabel = (b: string) =>
    d.overTime.granularity === "month" ? formatMonth(b) : d.overTime.granularity === "week" ? `Week of ${formatDate(b)}` : formatDate(b);
  const shortLabel = (b: string) => (d.overTime.granularity === "month" ? formatMonth(b) : `${Number(b.slice(8, 10))} ${formatMonth(b).slice(0, 3)}`);
  const up = kpis.changePct !== null && kpis.changePct > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{scopeName}</p>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(ctx.filters.from)} – {formatDate(ctx.filters.to)}
        </p>
      </div>
      <FilterBar {...ctx} />

      {/* Hero + KPIs */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass glow-ring relative overflow-hidden rounded-3xl p-6 lg:col-span-2">
          <div aria-hidden className="bg-brand pointer-events-none absolute -top-24 -right-16 size-64 rounded-full opacity-20 blur-3xl" />
          <p className="text-sm text-muted-foreground">Spent</p>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <AnimatedNumber value={kpis.spend} format="inr" className="font-heading text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl" />
            {kpis.changePct !== null && (
              <span
                className={cn(
                  "mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  up ? "bg-red-500/12 text-red-700 dark:text-red-300" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                )}
              >
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {pct(kpis.changePct)} {up ? "more" : "less"} than previous period
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Expenses minus refunds · previous period {formatINRWhole(kpis.previousSpend)}</p>
          <div className="mt-4">
            <Sparkline values={d.overTime.points.map((p) => p.spend)} />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Stat icon={CalendarDays} label="Average per day" value={formatINRWhole(kpis.avgPerDay)} />
          {isGroup ? (
            <Stat icon={Users} label="Members spending" value={d.byMember.length} sub={d.byMember[0] ? `Top: ${d.byMember[0].name}` : undefined} />
          ) : (
            <Stat
              icon={kpis.savingsRate === null ? Wallet : PiggyBank}
              label="Savings rate"
              value={kpis.savingsRate === null ? "—" : `${kpis.savingsRate < 0 ? "−" : ""}${pct(kpis.savingsRate)}`}
              sub={kpis.income === null ? "No income logged" : `Income ${formatINRWhole(kpis.income)}`}
            />
          )}
        </div>
      </div>

      {/* Rows are paired so neighbouring cards have similar heights. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget
          title="Spend over time"
          description={`Per ${d.overTime.granularity}`}
          className="lg:col-span-2"
          empty={kpis.spend === 0}
          table={{ head: ["Period", "Spend"], rows: d.overTime.points.filter((p) => p.spend).map((p) => [bucketLabel(p.bucket), formatINRWhole(p.spend)]) }}
        >
          <AreaTrend data={d.overTime.points.map((p) => ({ label: shortLabel(p.bucket), spend: p.spend }))} height={280} />
        </Widget>
        <Widget
          title={d.categoryBreakdown.drillParent ? d.categoryBreakdown.drillParent.name : "By category"}
          description={d.categoryBreakdown.drillParent ? "Subcategories" : "Tap a category to drill in"}
          empty={d.categoryBreakdown.rows.length === 0}
        >
          <CategoryBreakdown rows={d.categoryBreakdown.rows} drillParent={d.categoryBreakdown.drillParent} />
        </Widget>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Widget
          title="This vs previous period"
          description={`Compared with ${formatDate(d.comparison.previous.from)} – ${formatDate(d.comparison.previous.to)}`}
          className="lg:col-span-2"
          empty={d.comparison.rows.length === 0}
          table={{ head: ["Category", "This period", "Previous"], rows: d.comparison.rows.map((r) => [r.name, formatINRWhole(r.current), formatINRWhole(r.previous)]) }}
        >
          <PairedBars
            data={d.comparison.rows.slice(0, 6).map((r) => ({ label: r.name, current: r.current, previous: r.previous }))}
            series={[
              { key: "current", name: "This period", color: "var(--series-1)" },
              { key: "previous", name: "Previous", color: "var(--series-muted)" },
            ]}
          />
        </Widget>
        <Widget title="Top merchants" empty={d.merchants.length === 0}>
          <RankedBars rows={d.merchants.map((m) => ({ key: m.merchant, label: m.merchant, value: m.spend, sub: `${m.count}×` }))} limit={6} />
        </Widget>
      </div>

      {isGroup ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Widget title="Spend by member" description="Who paid for shared expenses" empty={d.byMember.length === 0}>
            <RankedBars rows={d.byMember.map((m) => ({ key: m.userId, label: m.active ? m.name : `${m.name} (inactive)`, value: m.spend }))} />
          </Widget>
          <Widget title="Daily spend" description="Darker = more spent that day" empty={kpis.spend === 0}>
            <CalendarHeatmap from={d.daily.from} to={d.daily.to} days={d.daily.days} />
          </Widget>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Widget
            title="Income vs spend"
            description="Last 6 months. Months without logged income show spend only."
            className="lg:col-span-2"
            empty={!d.incomeVsExpense || d.incomeVsExpense.length === 0}
            table={{
              head: ["Month", "Income", "Spend"],
              rows: (d.incomeVsExpense ?? []).map((m) => [formatMonth(m.month), m.hasIncome ? formatINRWhole(m.income) : "Not logged", formatINRWhole(m.spend)]),
            }}
          >
            <PairedBars
              data={(d.incomeVsExpense ?? []).map((m) => ({ label: formatMonth(m.month).slice(0, 3), spend: m.spend, income: m.income }))}
              series={[
                { key: "spend", name: "Spend", color: "var(--series-1)" },
                { key: "income", name: "Income", color: "var(--series-2)" },
              ]}
            />
          </Widget>
          <Widget title="Daily spend" description="Darker = more spent that day" empty={kpis.spend === 0}>
            <CalendarHeatmap from={d.daily.from} to={d.daily.to} days={d.daily.days} />
          </Widget>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Paid via" empty={d.paymentMethods.length === 0}>
          <RankedBars
            rows={d.paymentMethods.map((p) => ({
              key: p.method,
              label: p.method === "unspecified" ? "Not specified" : PAYMENT_METHOD_LABELS[p.method as PaymentMethod],
              value: p.spend,
            }))}
          />
        </Widget>
        <Widget title="Tags & events" description="Entries tagged with #something" empty={d.tagTotals.length === 0}>
          <RankedBars rows={d.tagTotals.map((t) => ({ key: t.tag, label: `#${t.tag}`, value: t.spend, sub: `${t.count}×` }))} limit={6} />
        </Widget>
      </div>

      <Widget title="Largest expenses" empty={d.largest.length === 0}>
        <ul className="grid gap-1 sm:grid-cols-2">
          {d.largest.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-muted/50">
              <CategoryIcon slug={t.categorySlug} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.description}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.categoryName} · {formatDate(t.date)}
                  {isGroup && ` · ${t.ownerName}`}
                </span>
              </span>
              <span className="shrink-0 font-heading font-semibold tabular-nums">{formatINR(t.amountMinor)}</span>
            </li>
          ))}
        </ul>
      </Widget>
    </div>
  );
}
