import { categoryStyle } from "@/lib/category-style";
import { cn } from "@/lib/utils";

/** Rounded, tinted icon avatar for a category slug. Decorative: always rendered beside the category name. */
export function CategoryIcon({ slug, className, size = "md" }: { slug: string | null | undefined; className?: string; size?: "sm" | "md" | "lg" }) {
  const { icon: Icon, tint } = categoryStyle(slug);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-10 [&_svg]:size-[18px]",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-5",
        tint,
        className,
      )}
    >
      <Icon />
    </span>
  );
}
