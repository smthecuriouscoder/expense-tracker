"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { CategoryOption } from "@/lib/categories";
import { ENTRY_TYPES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { filtersToSearchParams, type Filters } from "@/lib/filters";
import { CategorySelect } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type Option = { id: string; name: string };

type Props = {
  filters: Filters;
  today: string;
  groups: Option[];
  categories: CategoryOption[];
  /** Members of the selected group (group scope only). */
  members: Option[];
  /** Transactions page extras. */
  showSearch?: boolean;
};

function presets(today: string) {
  const thisMonth = startOfMonth(today);
  return {
    "this-month": { label: "This month", from: thisMonth, to: endOfMonth(today) },
    "last-month": { label: "Last month", from: addMonths(thisMonth, -1), to: endOfMonth(addMonths(thisMonth, -1)) },
    "last-3": { label: "Last 3 months", from: addMonths(thisMonth, -2), to: endOfMonth(today) },
    "last-12": { label: "Last 12 months", from: addMonths(thisMonth, -11), to: endOfMonth(today) },
    "this-year": { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  } as const;
}

/** Global filter bar. State lives in the URL so views are shareable and survive reloads. */
export function FilterBar({ filters, today, groups, categories, members, showSearch }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [tag, setTag] = useState(filters.tag ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);

  const ranges = presets(today);
  const preset = Object.entries(ranges).find(([, r]) => r.from === filters.from && r.to === filters.to)?.[0] ?? "custom";

  function apply(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    // Member filter only makes sense within one group.
    if (next.scope) merged.memberId = undefined;
    startTransition(() => router.replace(`${pathname}?${filtersToSearchParams(merged)}`, { scroll: false }));
  }

  const scopeValue = filters.scope.kind === "group" ? filters.scope.groupId : "me";
  const hasExtras = Boolean(filters.categoryId || filters.memberId || filters.tag || filters.paymentMethod || filters.type || filters.q);

  const panel = (p: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${p}-scope`}>View</Label>
          <NativeSelect
            id={`${p}-scope`}
            value={scopeValue}
            onChange={(e) =>
              apply({ scope: e.target.value === "me" ? { kind: "me", includeShared: true } : { kind: "group", groupId: e.target.value } })
            }
          >
            <option value="me">Me</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${p}-range`}>Period</Label>
          <NativeSelect
            id={`${p}-range`}
            value={preset}
            onChange={(e) => {
              const r = ranges[e.target.value as keyof typeof ranges];
              if (r) apply({ from: r.from, to: r.to });
            }}
          >
            {Object.entries(ranges).map(([key, r]) => (
              <option key={key} value={key}>
                {r.label}
              </option>
            ))}
            <option value="custom" disabled={preset !== "custom"}>
              Custom
            </option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${p}-from`}>From</Label>
          <Input id={`${p}-from`} type="date" value={filters.from} onChange={(e) => e.target.value && apply({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${p}-to`}>To</Label>
          <Input id={`${p}-to`} type="date" value={filters.to} onChange={(e) => e.target.value && apply({ to: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${p}-cat`}>Category</Label>
          <CategorySelect
            id={`${p}-cat`}
            categories={categories}
            allowParents
            placeholder="All categories"
            value={filters.categoryId ?? ""}
            onChange={(e) => apply({ categoryId: e.target.value || undefined })}
          />
        </div>
        {filters.scope.kind === "group" ? (
          <div className="space-y-1">
            <Label htmlFor={`${p}-member`}>Member</Label>
            <NativeSelect id={`${p}-member`} value={filters.memberId ?? ""} onChange={(e) => apply({ memberId: e.target.value || undefined })}>
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <label className="flex items-end gap-2 pb-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={filters.scope.includeShared}
              onChange={(e) => apply({ scope: { kind: "me", includeShared: e.target.checked } })}
            />
            Include my shared entries
          </label>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${p}-pm`}>Paid via</Label>
          <NativeSelect
            id={`${p}-pm`}
            value={filters.paymentMethod ?? ""}
            onChange={(e) => apply({ paymentMethod: (e.target.value || undefined) as Filters["paymentMethod"] })}
          >
            <option value="">Any</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ tag: tag.replace(/^#/, "").trim().toLowerCase() || undefined });
          }}
        >
          <Label htmlFor={`${p}-tag`}>Tag</Label>
          <Input id={`${p}-tag`} placeholder="#goa-trip" value={tag} onChange={(e) => setTag(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
        </form>
      </div>

      {showSearch && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <form
            className="col-span-2 space-y-1 md:col-span-3"
            onSubmit={(e) => {
              e.preventDefault();
              apply({ q: q.trim() || undefined });
            }}
          >
            <Label htmlFor={`${p}-q`}>Search</Label>
            <Input id={`${p}-q`} type="search" placeholder="Description or merchant" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="col-span-2 space-y-1 md:col-span-1">
            <Label htmlFor={`${p}-type`}>Type</Label>
            <NativeSelect id={`${p}-type`} value={filters.type ?? ""} onChange={(e) => apply({ type: (e.target.value || undefined) as Filters["type"] })}>
              <option value="">All types</option>
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}

      {hasExtras && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            setTag("");
            apply({ categoryId: undefined, memberId: undefined, tag: undefined, paymentMethod: undefined, type: undefined, q: undefined });
          }}
        >
          <X /> Clear filters
        </Button>
      )}
    </div>  );

  const categoryName = categories.find((c) => c.id === filters.categoryId)?.name;
  const chips = [
    filters.categoryId && { label: categoryName ?? "Category", clear: { categoryId: undefined } },
    filters.memberId && { label: members.find((m) => m.id === filters.memberId)?.name ?? "Member", clear: { memberId: undefined } },
    filters.tag && { label: `#${filters.tag}`, clear: { tag: undefined } },
    filters.paymentMethod && { label: PAYMENT_METHOD_LABELS[filters.paymentMethod], clear: { paymentMethod: undefined } },
    filters.type && { label: filters.type, clear: { type: undefined } },
    filters.q && { label: `“${filters.q}”`, clear: { q: undefined } },
  ].filter(Boolean) as { label: string; clear: Partial<Filters> }[];
  const scopeLabel = filters.scope.kind === "group" ? (groups.find((g) => g.id === scopeValue)?.name ?? "Group") : "Me";
  const periodLabel = preset === "custom" ? `${filters.from} → ${filters.to}` : ranges[preset as keyof typeof ranges].label;

  return (
    <>
      {/* Desktop: inline glass panel */}
      <div className="glass hidden rounded-3xl p-4 md:block" aria-busy={pending}>
        {panel("fd")}
      </div>

      {/* Mobile: summary button → bottom sheet, plus removable chips */}
      <div className="space-y-2 md:hidden" aria-busy={pending}>
        <Drawer open={sheetOpen} onOpenChange={setSheetOpen} showSwipeHandle>
          <DrawerTrigger
            render={
              <button type="button" className="glass flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm">
                <SlidersHorizontal className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{scopeLabel}</span>
                  <span className="text-muted-foreground"> · {periodLabel}</span>
                </span>
                {chips.length > 0 && (
                  <span className="bg-brand grid size-6 place-items-center rounded-full text-xs font-semibold text-[#04201c]">{chips.length}</span>
                )}
              </button>
            }
          />
          <DrawerContent className="rounded-t-3xl border-glass-border bg-popover">
            <DrawerHeader className="text-left">
              <DrawerTitle className="text-lg">Filters</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{panel("fm")}</div>
          </DrawerContent>
        </Drawer>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  if ("q" in c.clear) setQ("");
                  if ("tag" in c.clear) setTag("");
                  apply(c.clear);
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary/12 px-3 text-xs text-foreground capitalize ring-1 ring-primary/30"
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label} <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
