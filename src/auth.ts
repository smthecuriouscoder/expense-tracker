import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { upsertUserOnSignIn } from "@/server/users";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}

// Google-only sign-in, gated by the allowlist (DECISIONS.md #31). Sessions are JWTs carrying our user id;
// every request still re-checks that the user is active (see src/server/session.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile?.email || profile.email_verified === false) return false;
      const db = await getDb();
      const user = await upsertUserOnSignIn(
        db,
        { email: profile.email, name: profile.name, image: typeof profile.picture === "string" ? profile.picture : null },
        process.env.ADMIN_EMAIL,
      );
      return user !== null;
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const db = await getDb();
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, profile.email.toLowerCase()));
        token.uid = user?.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.uid === "string" ? token.uid : "";
      return session;
    },
  },
});
