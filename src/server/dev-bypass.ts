/**
 * Local-only login bypass (DECISIONS.md #60). Active only under `next dev` (NODE_ENV=development)
 * AND when DEV_AUTH_BYPASS_EMAIL is set; production builds always ignore it.
 */
export function devBypassEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== "development") return null;
  return env.DEV_AUTH_BYPASS_EMAIL?.trim().toLowerCase() || null;
}
