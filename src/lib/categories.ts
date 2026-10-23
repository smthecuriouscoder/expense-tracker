import type { CategoryKind } from "./constants";

/** Flat, client-safe category shape. Children carry their parent's name for display. */
export type CategoryOption = {
  id: string;
  slug: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  parentName: string | null;
  isCustom: boolean;
  isFallback: boolean;
  createdBy: string | null;
};

export type CategoryGroup = { parent: CategoryOption; children: CategoryOption[] };

/** Groups children under their parents, preserving input order. */
export function toCategoryTree(options: CategoryOption[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const o of options) if (!o.parentId) groups.set(o.id, { parent: o, children: [] });
  for (const o of options) if (o.parentId) groups.get(o.parentId)?.children.push(o);
  return [...groups.values()];
}

export function categoryLabel(c: Pick<CategoryOption, "name" | "parentName">): string {
  return c.parentName ? `${c.parentName} › ${c.name}` : c.name;
}
