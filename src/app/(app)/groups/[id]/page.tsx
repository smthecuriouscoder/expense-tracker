import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppError } from "@/server/errors";
import { getGroupDetail, listActiveUsers } from "@/server/groups";
import { authed } from "@/server/session";
import { AddMemberForm, LeaveGroupButton, MemberActions } from "../group-forms";

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, db } = await authed();
  const detail = await getGroupDetail(db, user.id, id).catch((err) => {
    if (err instanceof AppError) notFound();
    throw err;
  });
  const isAdmin = detail.myRole === "admin";
  const memberIds = new Set(detail.members.map((m) => m.userId));
  const candidates = isAdmin ? (await listActiveUsers(db)).filter((u) => !memberIds.has(u.id)) : [];

  return (
    <div className="space-y-4">
      <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Groups
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{detail.group.name}</h1>
        <Link href={`/dashboard?scope=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {detail.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{m.name}</span>
                  {m.userId === user.id && <span className="text-muted-foreground"> (you)</span>}
                  {!m.active && <span className="text-muted-foreground"> (inactive)</span>}
                  {m.role === "admin" && (
                    <Badge variant="secondary" className="ml-2">
                      Admin
                    </Badge>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                {isAdmin && m.userId !== user.id && <MemberActions groupId={id} userId={m.userId} role={m.role} />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Add a member</CardTitle>
          </CardHeader>
          <CardContent>
            <AddMemberForm groupId={id} candidates={candidates} />
          </CardContent>
        </Card>
      )}

      <LeaveGroupButton groupId={id} />
    </div>
  );
}
