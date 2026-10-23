"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RankedBars } from "@/components/charts";
import { Button } from "@/components/ui/button";

/** Category breakdown with drill-down: clicking a parent sets the global category filter to it. */
export function CategoryBreakdown({
  rows,
  drillParent,
}: {
  rows: { id: string; name: string; slug: string; spend: number }[];
  drillParent: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setCategory = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("cat", id);
    else next.delete("cat");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="space-y-3">
      {drillParent && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setCategory(null)}>
          <ArrowLeft /> All categories
        </Button>
      )}
      <RankedBars
        rows={rows.map((r) => ({ key: r.id, label: r.name, value: r.spend, iconSlug: r.slug }))}
        onSelect={drillParent ? undefined : (id) => setCategory(id)}
        limit={drillParent ? 8 : 6}
        selectLabel="Show subcategories of"
      />
    </div>
  );
}
