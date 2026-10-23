import { cn } from "@/lib/utils";

/** Gradient ₹ tile + wordmark. */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="bg-brand grid size-8 place-items-center rounded-xl font-heading text-lg font-bold text-[#04201c] shadow-[var(--glow)]">
        ₹
      </span>
      {showName && <span className="font-heading text-[17px] font-semibold tracking-tight">Expense Tracker</span>}
    </span>
  );
}
