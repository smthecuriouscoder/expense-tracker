import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { GroupRole } from "@/lib/constants";
import type { Scope } from "@/lib/filters";
import type { Db } from "./db/client";
import { entries, groupMembers, type Entry } from "./db/schema";
import { forbidden, invalid, notFound } from "./errors";

// Single source of truth for who can see and change which entries.
// Every entry query in the app must go through scopeCondition(); every mutation through assertCanEdit().

/** The user's role in a group, or null if they are not an active member. */
export async function membershipRole(db: Db, userId: string, groupId: string): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)));
  return row?.role ?? null;
}

export async function isActiveMember(db: Db, userId: string, groupId: string): Promise<boolean> {
  return (await membershipRole(db, userId, groupId)) !== null;
}

/** WHERE clause selecting the non-deleted entries visible to `userId` in `scope`. Throws if the user can't view the scope. */
export async function scopeCondition(db: Db, userId: string, scope: Scope): Promise<SQL> {
  const notDeleted = isNull(entries.deletedAt);
  if (scope.kind === "me") {
    const own = eq(entries.ownerId, userId);
    return scope.includeShared ? and(own, notDeleted)! : and(own, isNull(entries.groupId), notDeleted)!;
  }
  if (!(await isActiveMember(db, userId, scope.groupId))) throw forbidden("You are not a member of this group.");
  return and(eq(entries.groupId, scope.groupId), notDeleted)!;
}

/** Loads an entry the user may edit (owner only). Includes soft-deleted rows so they can be restored. */
export async function getEditableEntry(db: Db, userId: string, entryId: string): Promise<Entry> {
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry) throw notFound("Entry not found.");
  if (entry.ownerId !== userId) throw forbidden("Only the person who logged an entry can change it.");
  return entry;
}

/** Validates that an entry of `type` may live in `groupId` for this owner. */
export async function assertCanPlaceInGroup(db: Db, userId: string, type: Entry["type"], groupId: string | null) {
  if (groupId === null) return;
  if (type === "income") throw invalid("Income is always private and can't be shared to a group.");
  if (!(await isActiveMember(db, userId, groupId))) throw forbidden("You are not a member of this group.");
}
