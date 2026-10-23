import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "./db";
import { devBypassEmail } from "./dev-bypass";
import { getActiveUser, upsertUserOnSignIn } from "./users";

export { devBypassEmail };

/** The signed-in, still-active user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async () => {
  const bypass = devBypassEmail();
  if (bypass) {
    // Treated as the app admin so every screen is reachable; creates the user + Family group on first use.
    return upsertUserOnSignIn(await getDb(), { email: bypass, name: "Dev User" }, bypass);
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return getActiveUser(await getDb(), userId);
});

/** For pages: redirects to /login when signed out or deactivated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions and route handlers: returns the user and a db handle. */
export async function authed() {
  const user = await requireUser();
  return { user, db: await getDb() };
}
