"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LayoutDashboard, List, PenLine, Plus, Settings, Users, type LucideIcon } from "lucide-react";
import { LogSheet } from "@/components/log-sheet";
import type { CategoryOption } from "@/lib/categories";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

const DESKTOP: NavLink[] = [
  { href: "/", label: "Log", icon: PenLine },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Mobile: logging moves to the centre "+" button (bottom sheet), so the bar holds 4 destinations.
const MOBILE_LEFT: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: List },
];
const MOBILE_RIGHT: NavLink[] = [
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Desktop pill nav with a sliding active indicator. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="glass hidden items-center gap-1 rounded-full p-1 md:flex" aria-label="Main">
      {DESKTOP.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 -z-10 rounded-full bg-primary/15 ring-1 ring-primary/40"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileLink({ href, label, icon: Icon, active }: NavLink & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground transition-colors",
        active && "font-medium text-primary",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

/** Mobile glass tab bar with a raised gradient "+" that opens the log sheet. */
export function MobileNav(props: { categories: CategoryOption[]; groups: { id: string; name: string }[]; today: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 items-center rounded-3xl px-1 md:hidden"
      aria-label="Main"
    >
      {MOBILE_LEFT.map((l) => (
        <MobileLink key={l.href} {...l} active={isActive(pathname, l.href)} />
      ))}
      <div className="flex justify-center">
        <LogSheet
          {...props}
          trigger={
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              aria-label="Log an expense"
              className="bg-brand -mt-8 grid size-14 place-items-center rounded-2xl text-[#04201c] shadow-[var(--glow)] ring-4 ring-background"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </motion.button>
          }
        />
      </div>
      {MOBILE_RIGHT.map((l) => (
        <MobileLink key={l.href} {...l} active={isActive(pathname, l.href)} />
      ))}
    </nav>
  );
}
