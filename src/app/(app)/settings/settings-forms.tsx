"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addCategoryAction, deleteCategoryAction, inviteAction, revokeAction } from "@/app/actions";
import { CategorySelect } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAction } from "@/hooks/use-action";
import type { CategoryOption } from "@/lib/categories";

export function AddCategoryForm({ parents }: { parents: CategoryOption[] }) {
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addCategoryAction(parentId, name), "Category added.", () => setName(""));
      }}
    >
      <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Parent category" className="sm:w-56">
        <option value="">Under…</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pet food" maxLength={40} aria-label="New category name" />
      <Button type="submit" disabled={pending || !parentId || name.trim().length < 2}>
        Add
      </Button>
    </form>
  );
}

/** Deleting a custom category requires choosing where its entries go (DECISIONS.md #17). */
export function DeleteCategoryForm({ category, targets }: { category: CategoryOption; targets: CategoryOption[] }) {
  const [target, setTarget] = useState(targets.find((t) => t.slug === `${category.slug.split(".")[0]}.other`)?.id ?? "");
  const { pending, run } = useAction();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => deleteCategoryAction(category.id, target),
          undefined,
          ({ moved }) => toast.success(`Deleted. ${moved} ${moved === 1 ? "entry" : "entries"} moved.`),
        );
      }}
    >
      <CategorySelect
        categories={targets}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        aria-label={`Move ${category.name} entries to`}
        className="sm:w-56"
      />
      <Button type="submit" variant="destructive" size="sm" disabled={pending || !target}>
        Delete
      </Button>
    </form>
  );
}

export function AllowlistManager({
  entries,
  selfEmail,
}: {
  entries: { email: string; name: string | null; active: boolean | null }[];
  selfEmail: string;
}) {
  const [email, setEmail] = useState("");
  const { pending, run } = useAction();
  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {entries.map((e) => (
          <li key={e.email} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 truncate">
              {e.name ?? <span className="text-muted-foreground">Not signed in yet</span>}
              <span className="text-muted-foreground"> · {e.email}</span>
            </span>
            {e.email !== selfEmail && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Remove access for ${e.email}? Their entries stay.`)) run(() => revokeAction(e.email), "Access removed.");
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          run(() => inviteAction(email), "Invited. They can now sign in with Google.", () => setEmail(""));
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" aria-label="Email to invite" />
        <Button type="submit" disabled={pending || !email.includes("@")}>
          Invite
        </Button>
      </form>
    </div>
  );
}
