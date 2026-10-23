import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "This Google account isn't invited. Ask the app admin to add your email.",
  Configuration: "Sign-in isn't configured correctly. Check the server's AUTH_* settings.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="glass glow-ring w-full max-w-sm space-y-6 rounded-3xl p-8">
        <Logo />
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold leading-tight">
            Your family&apos;s money, <span className="text-gradient">in plain words.</span>
          </h1>
          <p className="text-sm text-muted-foreground">Type “chai 20, auto 60” — we turn it into tidy entries and a live dashboard.</p>
        </div>
        {message && <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button
            type="submit"
            className="bg-brand h-12 w-full rounded-2xl text-[15px] font-semibold text-[#04201c] shadow-[var(--glow)] hover:opacity-90"
          >
            Continue with Google
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">Invite-only. Your admin adds your Google email first.</p>
      </div>
    </main>
  );
}
