"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { formatINRCompact, formatINRWhole } from "@/lib/money";
import { cn } from "@/lib/utils";

// Chart conventions (DECISIONS.md #57, §8): one axis only, single-hue series in the validated colours,
// 2px lines, rounded bar ends, recessive grid, INR tooltips, a legend only with 2+ series.

const axisProps = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-axis)", fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

const tooltipProps = {
  cursor: { stroke: "var(--chart-axis)", strokeOpacity: 0.3, fill: "var(--muted)", fillOpacity: 0.4 },
  contentStyle: {
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.4)",
  },
  formatter: (v: unknown) => formatINRWhole(Number(v)),
} as const;

/** Spend over time: single-series area with a gradient fill and a glowing 2px line, plus a crosshair tooltip. */
export function AreaTrend({ data, height = 240 }: { data: { label: string; spend: number }[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axisProps} minTickGap={20} />
        <YAxis {...axisProps} width={56} tickFormatter={(v) => formatINRCompact(Number(v))} />
        <Tooltip {...tooltipProps} />
        <Area
          type="monotone"
          dataKey="spend"
          name="Spend"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill={`url(#fill-${id})`}
          style={{ filter: "drop-shadow(0 0 6px var(--chart-glow))" }}
          animationDuration={800}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)", fill: "var(--series-1)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Tiny decorative trend line for the hero card (no axes; the full chart sits below). */
export function Sparkline({ values }: { values: number[] }) {
  const id = useId().replace(/:/g, "");
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} fill={`url(#spark-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two series side by side (e.g. this period vs previous, income vs spend), with a legend. */
export function PairedBars({
  data,
  series,
}: {
  data: Record<string, string | number>[];
  series: [{ key: string; name: string; color: string }, { key: string; name: string; color: string }];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          {...axisProps}
          tick={{ ...axisProps.tick, fontSize: 11 }}
          interval={0}
          tickFormatter={(v: string) => (v.length > 8 ? `${v.slice(0, 7)}…` : v)}
        />
        <YAxis {...axisProps} width={56} tickFormatter={(v) => formatINRCompact(Number(v))} />
        <Tooltip {...tooltipProps} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--chart-axis)" }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={800} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Ranked rows: optional category icon, label, value and share of the total, with an animated bar.
 * Plain HTML so labels stay readable at any length. Negative values (refund-heavy) render as empty bars.
 */
export function RankedBars({
  rows,
  onSelect,
  selectLabel,
  limit,
}: {
  rows: { key: string; label: string; value: number; sub?: string; iconSlug?: string }[];
  onSelect?: (key: string) => void;
  selectLabel?: string;
  /** Show only the top N rows (percentages still use the full total). */
  limit?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  const shown = limit ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;
  return (
    <ul className="space-y-1">
      {shown.map((r, i) => {
        const content = (
          <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
            {r.iconSlug !== undefined && <CategoryIcon slug={r.iconSlug} size="sm" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">
                  {r.label}
                  {r.sub && <span className="font-normal text-muted-foreground"> · {r.sub}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatINRWhole(r.value)}
                  <span className="ml-1.5 text-xs text-muted-foreground">{Math.round((Math.max(0, r.value) / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full origin-left rounded-full"
                  style={{ background: "var(--series-1)", boxShadow: "0 0 12px var(--chart-glow)", width: `${Math.max(0, (r.value / max) * 100)}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </div>
        );
        return (
          <li key={r.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.key)}
                className="block w-full rounded-2xl text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${selectLabel ?? "Select"} ${r.label}`}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
      {hidden > 0 && <li className="px-2 pt-1 text-xs text-muted-foreground">+ {hidden} more · see Transactions for everything</li>}
    </ul>
  );
}

/** Calendar heatmap: weeks as columns, Mon–Sun as rows, one-hue sequential ramp. */
export function CalendarHeatmap({ from, to, days }: { from: string; to: string; days: { date: string; spend: number }[] }) {
  const [hover, setHover] = useState<{ date: string; spend: number } | null>(null);
  const byDate = new Map(days.map((d) => [d.date, d.spend]));
  const positive = days.map((d) => d.spend).filter((v) => v > 0).sort((a, b) => a - b);
  // Quantile thresholds so one huge day (rent) doesn't wash out the rest.
  const q = (p: number) => positive[Math.min(positive.length - 1, Math.floor(p * positive.length))] ?? 0;
  const thresholds = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const level = (v: number) => (v <= 0 ? 0 : 1 + thresholds.filter((t) => v > t).length);

  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday
  const end = new Date(`${to}T00:00:00Z`);
  const cells: { date: string; inRange: boolean }[] = [];
  for (const d = new Date(start); d <= end || cells.length % 7 !== 0; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    cells.push({ date: iso, inRange: iso >= from && iso <= to });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid grid-flow-col gap-1" style={{ gridTemplateRows: "repeat(7, 16px)" }} role="img" aria-label="Daily spend calendar">
          {cells.map(({ date, inRange }) => {
            const spend = byDate.get(date) ?? 0;
            const l = level(spend);
            return (
              <div
                key={date}
                className={cn(
                  "size-4 rounded-[4px] transition-transform duration-150 hover:scale-125",
                  !inRange && "invisible",
                  hover?.date === date && "ring-2 ring-ring",
                )}
                style={{ background: `var(--seq-${l})`, boxShadow: l >= 4 ? "0 0 10px var(--chart-glow)" : undefined }}
                onMouseEnter={() => setHover({ date, spend })}
                onMouseLeave={() => setHover(null)}
                title={`${date}: ${formatINRWhole(spend)}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{hover ? `${hover.date} · ${formatINRWhole(hover.spend)}` : "Hover a day"}</span>
        <span className="flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="size-2.5 rounded-[3px]" style={{ background: `var(--seq-${l})` }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
