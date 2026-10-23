# syntax=docker/dockerfile:1
# Multi-stage image. Targets:
#   dev    — `next dev` with the source bind-mounted (docker-compose.yml, service `app`)
#   runner — `next build` + `next start` (docker-compose.yml, service `prod`)
# Linux image on every host, so Windows/macOS/Linux all run the same native binaries.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# pnpm version comes from "packageManager" in package.json.
RUN corepack enable
WORKDIR /app

# ---- dependencies (cached until the lockfile changes) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- dev ----
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm dev -H 0.0.0.0 -p 3000"]

# ---- production build ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- production runtime ----
# Keeps the full node_modules: `pnpm db:migrate` needs tsx, and PGlite is a dev dependency
# loaded at runtime when DATABASE_URL=pglite:… (next.config.ts serverExternalPackages).
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start -H 0.0.0.0 -p 3000"]
