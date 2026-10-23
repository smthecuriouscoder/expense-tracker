import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { allowedEmails, groupMembers, groups, users, type User } from "./db/schema";
import { forbidden, invalid } from "./errors";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignInProfile = { email: string; name?: string | null; image?: string | null };

/**
 * Called on every Google sign-in. Returns the app user, or null if the email isn't invited.
 * Creates the user on first sign-in and puts them in the default group
 * (creating the "Family" group, with them as admin, if none exists yet).
 */
export async function upsertUserOnSignIn(db: Db, profile: SignInProfile, adminEmail?: string): Promise<User | null> {
  const email = normalizeEmail(profile.email);
  const isAdmin = Boolean(adminEmail) && normalizeEmail(adminEmail!) === email;

  const [invite] = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email));
  if (!invite && !isAdmin) return null;
  if (!invite) await db.insert(allowedEmails).values({ email }).onConflictDoNothing();

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        name: profile.name || existing.name,
        image: profile.image ?? existing.image,
        active: true,
        isAppAdmin: existing.isAppAdmin || isAdmin,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name: profile.name || email.split("@")[0], image: profile.image ?? null, isAppAdmin: isAdmin })
      .returning();
    const [defaultGroup] = await tx.select().from(groups).where(eq(groups.isDefault, true));
    if (defaultGroup) {
      await tx.insert(groupMembers).values({ groupId: defaultGroup.id, userId: user.id, role: "member" });
    } else {
      const [family] = await tx.insert(groups).values({ name: "Family", isDefault: true, createdBy: user.id }).returning();
      await tx.insert(groupMembers).values({ groupId: family.id, userId: user.id, role: "admin" });
    }
    return user;
  });
}

export async function getActiveUser(db: Db, userId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.active ? user : null;
}

/** Allowlist with the matching user (if they have signed in). App admin only. */
export async function listAllowlist(db: Db) {
  return db
    .select({
      email: allowedEmails.email,
      createdAt: allowedEmails.createdAt,
      userName: users.name,
      active: users.active,
    })
    .from(allowedEmails)
    .leftJoin(users, eq(users.email, allowedEmails.email))
    .orderBy(asc(allowedEmails.email));
}

export async function addAllowedEmail(db: Db, actor: User, rawEmail: string) {
  if (!actor.isAppAdmin) throw forbidden("Only the app admin can invite people.");
  const email = normalizeEmail(rawEmail);
  if (!EMAIL.test(email)) throw invalid("Enter a valid email address.");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(allowedEmails);
  if (count >= MAX_USERS) throw invalid(`The app is limited to ${MAX_USERS} people.`);
  await db.insert(allowedEmails).values({ email, addedBy: actor.id }).onConflictDoNothing();
}

/** Revokes access. The user's entries stay and show as "(inactive)" in groups. */
export async function removeAllowedEmail(db: Db, actor: User, rawEmail: string) {
  if (!actor.isAppAdmin) throw forbidden("Only the app admin can remove people.");
  const email = normalizeEmail(rawEmail);
  if (email === actor.email) throw invalid("You can't remove yourself.");
  await db.transaction(async (tx) => {
    await tx.delete(allowedEmails).where(eq(allowedEmails.email, email));
    await tx.update(users).set({ active: false }).where(eq(users.email, email));
  });
}

export const MAX_USERS = 10;
