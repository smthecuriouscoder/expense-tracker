import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { listCategories } from "@/server/categories";
import { getEntryForEdit } from "@/server/entries";
import { AppError } from "@/server/errors";
import { listMyGroups } from "@/server/groups";
import { authed } from "@/server/session";
import { EditEntryForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit entry" };

export default async function EditEntryPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, db } = await authed();
  const entry = await getEntryForEdit(db, user.id, id).catch((err) => {
    if (err instanceof AppError) notFound();
    throw err;
  });
  const [categories, groups] = await Promise.all([listCategories(db), listMyGroups(db, user.id)]);
  return (
    <EditEntryForm
      entry={entry}
      categories={categories}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
