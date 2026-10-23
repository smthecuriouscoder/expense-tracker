"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { deleteEntryAction, restoreEntryAction, updateEntryAction } from "@/app/actions";
import { EntryFields, toEntryInput, type EntryFormValue } from "@/components/entry-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CategoryOption } from "@/lib/categories";
import { minorToRupees } from "@/lib/money";
import type { EntryRow } from "@/server/entries";

const PRIVATE = "private";

export function EditEntryForm({
  entry,
  categories,
  groups,
}: {
  entry: EntryRow;
  categories: CategoryOption[];
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [groupId, setGroupId] = useState(entry.groupId ?? PRIVATE);
  const [value, setValue] = useState<EntryFormValue>({
    type: entry.type,
    amount: String(minorToRupees(entry.amountMinor)),
    categoryId: entry.categoryId,
    date: entry.date,
    description: entry.description,
    merchant: entry.merchant ?? "",
    paymentMethod: entry.paymentMethod ?? "",
    tags: entry.tags.map((t) => `#${t}`).join(" "),
  });
  const leftGroup = entry.groupId && !groups.some((g) => g.id === entry.groupId);

  function save() {
    const result = toEntryInput(value, groupId === PRIVATE ? null : groupId, null);
    if ("error" in result) return toast.error(result.error);
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, result.input);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Saved.");
      router.push("/transactions");
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteEntryAction(entry.id);
      if (!res.ok) return void toast.error(res.error);
      toast("Entry deleted.", {
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await restoreEntryAction(entry.id);
            if (undo.ok) router.refresh();
            else toast.error(undo.error);
          },
        },
      });
      router.push("/transactions");
    });
  }

  return (
    <div className="space-y-4">
      <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Transactions
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EntryFields idPrefix="edit" value={value} categories={categories} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />
          <div className="space-y-1">
            <Label htmlFor="edit-group">Visible to</Label>
            <NativeSelect
              id="edit-group"
              value={value.type === "income" ? PRIVATE : groupId}
              disabled={value.type === "income"}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value={PRIVATE}>Private (only me)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (shared)
                </option>
              ))}
              {leftGroup && (
                <option value={entry.groupId!} disabled>
                  {entry.groupName} (you left this group)
                </option>
              )}
            </NativeSelect>
            {value.type === "income" && <p className="text-xs text-muted-foreground">Income is always private.</p>}
          </div>
          {entry.rawText && (
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Originally typed: <span className="whitespace-pre-wrap">“{entry.rawText}”</span>
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="destructive" onClick={remove} disabled={pending}>
              <Trash2 /> Delete
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
