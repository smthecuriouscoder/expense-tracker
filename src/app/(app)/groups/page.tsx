import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyGroups } from "@/server/groups";
import { authed } from "@/server/session";
import { CreateGroupForm } from "./group-forms";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const { user, db } = await authed();
  const groups = await listMyGroups(db, user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Groups</h1>
      <p className="text-sm text-muted-foreground">
        Entries saved to a group are visible to all its members. Private entries are only visible to you.
      </p>
      <ul className="divide-y rounded-xl border bg-card">
        {groups.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">You&apos;re not in any group yet.</li>}
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
              <span className="space-x-2">
                <span className="font-medium">{g.name}</span>
                {g.role === "admin" && <Badge variant="secondary">Admin</Badge>}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                {g.memberCount} {g.memberCount === 1 ? "member" : "members"} <ChevronRight className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>New group</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
    </div>
  );
}
