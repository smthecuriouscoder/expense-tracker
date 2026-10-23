"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import type { EntryInput } from "@/lib/entry-input";
import { GROUP_ROLES, type GroupRole } from "@/lib/constants";
import { addCustomSubcategory, deleteCustomCategory } from "@/server/categories";
import { createEntries, restoreEntry, softDeleteEntry, updateEntry } from "@/server/entries";
import { invalid, toResult } from "@/server/errors";
import { addMember, createGroup, leaveGroup, removeMember, setMemberRole } from "@/server/groups";
import { authed } from "@/server/session";
import { addAllowedEmail, removeAllowedEmail } from "@/server/users";

// Thin wrappers: authenticate, validate argument shapes, delegate to src/server/*, refresh the UI.
// Authorization lives in the server modules, never here or in the client.

const id = z.uuid();
function ids(...values: unknown[]) {
  for (const v of values) if (!id.safeParse(v).success) throw invalid("Invalid id.");
}
const refresh = () => revalidatePath("/", "layout");

export async function saveEntriesAction(inputs: EntryInput[]) {
  return toResult(async () => {
    const { user, db } = await authed();
    if (!Array.isArray(inputs)) throw invalid("Nothing to save.");
    const created = await createEntries(db, user.id, inputs);
    refresh();
    return { count: created.length };
  });
}

export async function updateEntryAction(entryId: string, input: EntryInput) {
  return toResult(async () => {
    ids(entryId);
    const { user, db } = await authed();
    await updateEntry(db, user.id, entryId, input);
    refresh();
  });
}

export async function deleteEntryAction(entryId: string) {
  return toResult(async () => {
    ids(entryId);
    const { user, db } = await authed();
    await softDeleteEntry(db, user.id, entryId);
    refresh();
  });
}

export async function restoreEntryAction(entryId: string) {
  return toResult(async () => {
    ids(entryId);
    const { user, db } = await authed();
    await restoreEntry(db, user.id, entryId);
    refresh();
  });
}

export async function createGroupAction(name: string) {
  return toResult(async () => {
    const { user, db } = await authed();
    const group = await createGroup(db, user.id, String(name));
    refresh();
    return { id: group.id };
  });
}

export async function addMemberAction(groupId: string, userId: string) {
  return toResult(async () => {
    ids(groupId, userId);
    const { user, db } = await authed();
    await addMember(db, user.id, groupId, userId);
    refresh();
  });
}

export async function removeMemberAction(groupId: string, userId: string) {
  return toResult(async () => {
    ids(groupId, userId);
    const { user, db } = await authed();
    await removeMember(db, user.id, groupId, userId);
    refresh();
  });
}

export async function setMemberRoleAction(groupId: string, userId: string, role: GroupRole) {
  return toResult(async () => {
    ids(groupId, userId);
    if (!GROUP_ROLES.includes(role)) throw invalid("Invalid role.");
    const { user, db } = await authed();
    await setMemberRole(db, user.id, groupId, userId, role);
    refresh();
  });
}

export async function leaveGroupAction(groupId: string) {
  return toResult(async () => {
    ids(groupId);
    const { user, db } = await authed();
    await leaveGroup(db, user.id, groupId);
    refresh();
  });
}

export async function addCategoryAction(parentId: string, name: string) {
  return toResult(async () => {
    ids(parentId);
    const { user, db } = await authed();
    await addCustomSubcategory(db, user.id, parentId, String(name));
    refresh();
  });
}

export async function deleteCategoryAction(categoryId: string, reassignToId: string) {
  return toResult(async () => {
    ids(categoryId, reassignToId);
    const { user, db } = await authed();
    const result = await deleteCustomCategory(db, user, categoryId, reassignToId);
    refresh();
    return result;
  });
}

export async function inviteAction(email: string) {
  return toResult(async () => {
    const { user, db } = await authed();
    await addAllowedEmail(db, user, String(email));
    refresh();
  });
}

export async function revokeAction(email: string) {
  return toResult(async () => {
    const { user, db } = await authed();
    await removeAllowedEmail(db, user, String(email));
    refresh();
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
