"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addMemberAction,
  createGroupAction,
  leaveGroupAction,
  removeMemberAction,
  setMemberRoleAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createGroupAction(name), "Group created.", (g) => router.push(`/groups/${g.id}`));
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa Trip" maxLength={40} aria-label="Group name" />
      <Button type="submit" disabled={pending || name.trim().length < 2}>
        Create
      </Button>
    </form>
  );
}

export function AddMemberForm({ groupId, candidates }: { groupId: string; candidates: { id: string; name: string; email: string }[] }) {
  const [userId, setUserId] = useState("");
  const { pending, run } = useAction();
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone with access is already in this group.</p>;
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addMemberAction(groupId, userId), "Member added.", () => setUserId(""));
      }}
    >
      <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person to add">
        <option value="">Choose a person…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.email})
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={pending || !userId}>
        Add
      </Button>
    </form>
  );
}

export function MemberActions({ groupId, userId, role }: { groupId: string; userId: string; role: "admin" | "member" }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => setMemberRoleAction(groupId, userId, role === "admin" ? "member" : "admin"), "Role updated.")}
      >
        {role === "admin" ? "Make member" : "Make admin"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Remove this member? Their past shared entries stay in the group.")) {
            run(() => removeMemberAction(groupId, userId), "Member removed.");
          }
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (confirm("Leave this group? Your past entries stay visible to its members, but you won't see the group anymore.")) {
          run(() => leaveGroupAction(groupId), "You left the group.", () => router.push("/groups"));
        }
      }}
    >
      Leave group
    </Button>
  );
}
