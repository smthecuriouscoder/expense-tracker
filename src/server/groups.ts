import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { GroupRole } from "@/lib/constants";
import { membershipRole } from "./access";
import type { Db } from "./db/client";
import { groupMembers, groups, users } from "./db/schema";
import { forbidden, invalid, notFound } from "./errors";

const activeMembership = (groupId: string, userId: string) =>
  and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), isNull(groupMembers.leftAt));

async function assertAdmin(db: Db, userId: string, groupId: string) {
  const role = await membershipRole(db, userId, groupId);
  if (role === null) throw forbidden("You are not a member of this group.");
  if (role !== "admin") throw forbidden("Only group admins can do this.");
}

async function otherAdminCount(db: Db, groupId: string, excludingUserId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.role, "admin"),
        isNull(groupMembers.leftAt),
        ne(groupMembers.userId, excludingUserId),
      ),
    );
  return count;
}

/** Groups the user currently belongs to, default group first. */
export async function listMyGroups(db: Db, userId: string) {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      isDefault: groups.isDefault,
      role: groupMembers.role,
      memberCount: sql<number>`(select count(*)::int from ${groupMembers} gm
                                 where gm.group_id = ${groups.id} and gm.left_at is null)`,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)))
    .orderBy(sql`${groups.isDefault} desc`, asc(groups.name));
}

export type MyGroup = Awaited<ReturnType<typeof listMyGroups>>[number];

export async function getGroupDetail(db: Db, userId: string, groupId: string) {
  const myRole = await membershipRole(db, userId, groupId);
  if (myRole === null) throw forbidden("You are not a member of this group.");
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) throw notFound("Group not found.");
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      active: users.active,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
    .orderBy(sql`${groupMembers.role} = 'admin' desc`, asc(users.name));
  return { group, myRole, members };
}

export async function createGroup(db: Db, userId: string, rawName: string) {
  const name = rawName.trim();
  if (name.length < 2 || name.length > 40) throw invalid("Group name must be 2–40 characters.");
  return db.transaction(async (tx) => {
    const [group] = await tx.insert(groups).values({ name, createdBy: userId }).returning();
    await tx.insert(groupMembers).values({ groupId: group.id, userId, role: "admin" });
    return group;
  });
}

/** Adds (or re-adds after leaving) an active app user as a member. Admin only. */
export async function addMember(db: Db, actorId: string, groupId: string, targetUserId: string) {
  await assertAdmin(db, actorId, groupId);
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target || !target.active) throw invalid("That person doesn't have access to the app.");
  await db
    .insert(groupMembers)
    .values({ groupId, userId: targetUserId, role: "member" })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      set: { leftAt: null, role: "member", joinedAt: new Date() },
    });
}

/** Removes another member. Their past shared entries stay visible to the group. Admin only. */
export async function removeMember(db: Db, actorId: string, groupId: string, targetUserId: string) {
  if (actorId === targetUserId) throw invalid("Use “Leave group” to remove yourself.");
  await assertAdmin(db, actorId, groupId);
  const result = await db
    .update(groupMembers)
    .set({ leftAt: new Date() })
    .where(activeMembership(groupId, targetUserId))
    .returning({ userId: groupMembers.userId });
  if (result.length === 0) throw notFound("That person isn't in this group.");
}

export async function setMemberRole(db: Db, actorId: string, groupId: string, targetUserId: string, role: GroupRole) {
  await assertAdmin(db, actorId, groupId);
  if (role === "member" && (await otherAdminCount(db, groupId, targetUserId)) === 0) {
    throw invalid("A group needs at least one admin. Promote someone else first.");
  }
  const result = await db
    .update(groupMembers)
    .set({ role })
    .where(activeMembership(groupId, targetUserId))
    .returning({ userId: groupMembers.userId });
  if (result.length === 0) throw notFound("That person isn't in this group.");
}

/** Leaving keeps your past entries in the group; you just stop seeing the group. The last admin can't leave. */
export async function leaveGroup(db: Db, userId: string, groupId: string) {
  const role = await membershipRole(db, userId, groupId);
  if (role === null) throw invalid("You are not a member of this group.");
  if (role === "admin" && (await otherAdminCount(db, groupId, userId)) === 0) {
    throw invalid("You're the last admin. Promote someone else before leaving.");
  }
  await db.update(groupMembers).set({ leftAt: new Date() }).where(activeMembership(groupId, userId));
}

/** Active app users, for the "add member" picker. */
export async function listActiveUsers(db: Db) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}
