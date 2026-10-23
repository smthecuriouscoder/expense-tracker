import {
  Car,
  Clapperboard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Plane,
  Shapes,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon + tint per top-level category (DECISIONS.md §8). Tints are decorative identity for icon avatars and
 * always sit next to a text label; charts do NOT use them (they stay single-hue per the dataviz rules).
 * Tint classes are full literals so Tailwind can see them.
 */
export type CategoryStyle = { icon: LucideIcon; tint: string };

const STYLES: Record<string, CategoryStyle> = {
  food: { icon: UtensilsCrossed, tint: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  transport: { icon: Car, tint: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  housing: { icon: House, tint: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  utilities: { icon: Zap, tint: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300" },
  finance: { icon: Landmark, tint: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  health: { icon: HeartPulse, tint: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  education: { icon: GraduationCap, tint: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  shopping: { icon: ShoppingBag, tint: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  entertainment: { icon: Clapperboard, tint: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  travel: { icon: Plane, tint: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  social: { icon: Gift, tint: "bg-red-500/15 text-red-700 dark:text-red-300" },
  misc: { icon: Shapes, tint: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300" },
  income: { icon: Wallet, tint: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
};

/** "food.groceries" → "food"; custom slugs ("food.c-pet-food") resolve to their parent too. */
export function parentSlug(slug: string): string {
  return slug.split(".")[0];
}

export function categoryStyle(slug: string | null | undefined): CategoryStyle {
  return STYLES[parentSlug(slug ?? "")] ?? STYLES.misc;
}
