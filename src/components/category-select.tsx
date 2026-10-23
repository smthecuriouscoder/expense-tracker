import { toCategoryTree, type CategoryOption } from "@/lib/categories";
import type { CategoryKind } from "@/lib/constants";
import { NativeSelect } from "@/components/ui/native-select";

type Props = Omit<React.ComponentProps<typeof NativeSelect>, "children"> & {
  categories: CategoryOption[];
  /** Only show categories of this kind. */
  kind?: CategoryKind;
  /** Allow choosing a top-level category (used by filters for drill-down). */
  allowParents?: boolean;
  placeholder?: string;
};

export function CategorySelect({ categories, kind, allowParents, placeholder, ...props }: Props) {
  const tree = toCategoryTree(categories).filter((g) => !kind || g.parent.kind === kind);
  return (
    <NativeSelect {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {tree.map(({ parent, children }) => (
        <optgroup key={parent.id} label={parent.name}>
          {allowParents && <option value={parent.id}>All {parent.name}</option>}
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}
