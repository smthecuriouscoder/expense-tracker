import type { NextConfig } from "next";

// Cache Components is disabled on purpose: every page is per-user and reads the
// session, so there is nothing to prerender. See DECISIONS.md (Implementation notes).
const nextConfig: NextConfig = {
  // PGlite (local dev DB) ships WASM + data files; load it from node_modules instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Opt-in file polling for Docker bind mounts that don't forward file events (e.g. Windows C:\ drive).
  // Off by default: polling costs CPU. See README "Docker".
  watchOptions: process.env.NEXT_WATCH_POLL_MS
    ? { pollIntervalMs: Number(process.env.NEXT_WATCH_POLL_MS) }
    : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
