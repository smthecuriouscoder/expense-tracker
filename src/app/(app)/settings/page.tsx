import type { Metadata } from "next";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel } from "@/lib/categories";
import { todayIST } from "@/lib/dates";
import { listCategories } from "@/server/categories";
import { authed } from "@/server/session";
import { listAllowlist, MAX_USERS } from "@/server/users";
import { AddCategoryForm, AllowlistManager, DeleteCategoryForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, db } = await authed();
  const categories = await listCategories(db);
  const custom = categories.filter((c) => c.isCustom);
  const allowlist = user.isAppAdmin ? await listAllowlist(db) : [];
  const exportAll = new URLSearchParams({ from: "2000-01-01", to: todayIST() });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Add your own subcategories under any top-level category. They&apos;re shared with everyone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddCategoryForm parents={categories.filter((c) => !c.parentId)} />
          {custom.length > 0 && (
            <ul className="divide-y">
              {custom.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm">{categoryLabel(c)}</span>
                  {(user.isAppAdmin || c.createdBy === user.id) && (
                    <DeleteCategoryForm
                      category={c}
                      targets={categories.filter((o) => o.kind === c.kind && o.parentId && o.id !== c.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>Download every entry you can see (yours and your groups&apos;) as a spreadsheet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href={`/api/export?${exportAll}`} className={buttonVariants({ variant: "outline" })}>
            <Download /> My entries (CSV)
          </a>
        </CardContent>
      </Card>

      {user.isAppAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>People with access</CardTitle>
            <CardDescription>
              Only these Google accounts can sign in (max {MAX_USERS}). Removing someone keeps their entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AllowlistManager
              selfEmail={user.email}
              entries={allowlist.map((a) => ({ email: a.email, name: a.userName, active: a.active }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
