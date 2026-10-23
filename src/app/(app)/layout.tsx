import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/logo";
import { todayIST } from "@/lib/dates";
import { listCategories } from "@/server/categories";
import { listMyGroups } from "@/server/groups";
import { authed, devBypassEmail } from "@/server/session";
import { DesktopNav, MobileNav } from "./nav";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, db } = await authed();
  const bypass = devBypassEmail();
  // Loaded here so the mobile "+" sheet works from every page.
  const [categories, groups] = await Promise.all([listCategories(db), listMyGroups(db, user.id)]);

  return (
    <div className="flex flex-1 flex-col">
      {bypass && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-400/15 px-4 py-1 text-center text-xs text-warning">
          <FlaskConical className="size-3.5 shrink-0" /> Dev login bypass — signed in as {bypass}. Unset DEV_AUTH_BYPASS_EMAIL for Google sign-in.
        </div>
      )}
      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass-strong mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-2xl px-3">
          <Link href="/" aria-label="Home" className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <DesktopNav />
          <UserMenu name={user.name} email={user.email} canSignOut={!bypass} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-32 md:pb-12">{children}</main>
      <MobileNav categories={categories} groups={groups.map((g) => ({ id: g.id, name: g.name }))} today={todayIST()} />
    </div>
  );
}
