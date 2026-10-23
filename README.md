# Expense Tracker

A family expense tracker for up to 10 people. Log spending and income in plain text — English, Hinglish, or Hindi —
a free LLM turns it into entries you review, and a dashboard shows where the money goes. Entries are private or shared
with a group (e.g. "Family", "Goa Trip").

```
chai 20, auto 60, kirana 340 at DMart by UPI     →  3 review cards  →  Save all
kal sabzi dhai sau                               →  ₹250 · Fruits & Vegetables · yesterday
salary 1.5 lakh                                  →  ₹1,50,000 · Income (always private)
```

- **Why and what:** [`DECISIONS.md`](DECISIONS.md) — every product and implementation decision, with reasons.
- **Build plan:** [`PLAN.md`](PLAN.md) — milestones and their status.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind 4 + shadcn/ui · Drizzle ORM on Neon Postgres (PGlite locally) ·
Auth.js v5 with Google · Vercel AI SDK with Gemini → Groq fallback · Recharts · Motion · Vitest.

UI: "dark premium" glass design, Space Grotesk + Inter, follows the system theme, with a Light/Dark/System toggle in the avatar menu.
Tokens and rules are in `src/app/globals.css` and DECISIONS.md §8.

## Getting started

Requirements: Node 22 (`nvm use`), pnpm.

```bash
pnpm install
cp .env.example .env.local      # then fill it in — see below
pnpm db:migrate                 # creates tables + seeds categories and the admin invite
pnpm dev                        # http://localhost:3000
```

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled URL (`postgres://…`). For local work without Neon use `pglite:./.data/dev` (embedded Postgres in a folder). |
| `AUTH_SECRET` | yes | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google Cloud OAuth client. Redirect URI: `<origin>/api/auth/callback/google`. |
| `ADMIN_EMAIL` | yes | Your Google email. Invited automatically and made app admin on first sign-in. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | one of | Gemini free tier — primary parser. |
| `GROQ_API_KEY` | one of | Groq free tier — fallback parser. |
| `LLM_PRIMARY_MODEL` / `LLM_FALLBACK_MODEL` | no | Defaults `gemini-3.8-flash` / `llama-3.3-70b-versatile`. |
| `PARSE_RATE_LIMIT_PER_HOUR` | no | Per user, default 60. |
| `AUTH_TRUST_HOST` | no | Set `true` when running `next start` outside Vercel. |
| `DEV_AUTH_BYPASS_EMAIL` | no | Local `pnpm dev` only: skip sign-in and act as this email. |

With no LLM key the app still works: parsing falls back to the manual entry form.

### Try the UI without Google sign-in (local only)

```bash
# .env.local
DATABASE_URL="pglite:./.data/dev"
DEV_AUTH_BYPASS_EMAIL="you@example.com"
```

Then run `pnpm db:migrate && pnpm dev`. Every request acts as that email (as app admin), and a yellow banner shows it.
It only works under `pnpm dev`: production builds ignore the variable. Remove it once Google OAuth is set up.

### Docker (Windows, macOS, Linux)

Needs only Docker Desktop (or Docker Engine + Compose). No Node or pnpm on the host.

```bash
cp .env.example .env.local      # fill it in, same as above
docker compose up --build       # dev server with hot reload → http://localhost:3000
```

On start the container installs dependencies if the lockfile changed, runs `pnpm db:migrate`, then `pnpm dev`.
`DEV_AUTH_BYPASS_EMAIL` works here because this is dev mode.

| Task | Command |
|---|---|
| Stop | `docker compose down` (add `-v` to also wipe `node_modules`, `.next` and the PGlite data volumes) |
| Run tests / checks | `docker compose exec app pnpm test` (also `typecheck`, `lint`) |
| Production build | `docker compose --profile prod up --build prod` (needs `AUTH_SECRET` + Google OAuth; the dev bypass is ignored) |
| Different host port | `APP_PORT=3100 docker compose up` (Google OAuth redirect URI must match the port) |

Notes:

- `DATABASE_URL` can be your Neon URL or `pglite:./.data/dev`. PGlite data is kept in a Docker volume, not in the project folder.
- `node_modules` and `.next` live in Docker volumes, so a host `node_modules` (Windows or macOS) never conflicts with the container's Linux one.
- **Windows hot reload:** for best speed, clone the repo inside WSL 2 (e.g. `~/code/expense-tracker`, not `/mnt/c/...`) and run
  `docker compose up` from there. If the repo stays on a Windows drive and edits don't reload, turn on polling:
  PowerShell `$env:NEXT_WATCH_POLL_MS=1000; docker compose up` (polling costs CPU, so leave it off otherwise).
  With polling on, Turbopack logs harmless `watch error (...) NotFound` lines for missing `node_modules` paths.
- Clone with LF line endings: `.gitattributes` enforces this; if you cloned before it existed, run
  `git config core.autocrlf false` and re-clone.

### First run

1. Sign in with the `ADMIN_EMAIL` Google account. A "Family" group is created with you as admin.
2. **Settings → People with access**: invite family members' Google emails. They join "Family" on first sign-in.
3. **Log** something, review the cards, pick Private or a group, **Save all**.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | Unit + database tests (in-memory PGlite, no network) |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint |
| `pnpm db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations and the idempotent seed |
| `pnpm db:seed` | Re-run only the seed |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm eval:parse` | Live LLM accuracy check against `tests/fixtures/parse-cases.json` (uses real keys; flags: `--provider groq`, `--break-primary`, `--only N`) |

## Project layout

```
src/
  app/                    routes (UI is thin; no business logic here)
    (app)/                signed-in pages: log, transactions, dashboard, groups, settings
    api/parse             POST text → review drafts (never saves)
    api/export            CSV of visible entries
    actions.ts            server actions: authenticate → delegate to src/server
  server/                 all business logic, testable with any Drizzle db
    access.ts             who can see/change what — every query goes through it
    entries.ts, groups.ts, categories.ts, users.ts, analytics.ts
    llm/                  prompt, provider chain, post-validation of model output
    db/                   schema, connection (Neon or PGlite), category tree, seed
  lib/                    client-safe helpers: money (paise), IST dates, URL filters
  components/             shared UI (entry fields, filter bar, charts, log sheet, category icons, shadcn/ui)
drizzle/                  SQL migrations
scripts/                  migrate, seed, eval-parse
tests/                    vitest suites + LLM fixtures
```

### Key rules worth knowing before changing code

- **Money is integer paise** (`amount_minor`), always positive; the sign comes from `type`. Spend = expenses − refunds.
- **Dates are `YYYY-MM-DD` in Asia/Kolkata**, never timestamps. Use `src/lib/dates.ts`.
- **Access control lives in `src/server/access.ts`.** New entry queries must use `entryConditions()` / `scopeCondition()`.
- **The LLM is untrusted input.** Its output is schema-checked and post-validated (`llm/post-validate.ts`); users confirm before anything is saved.
- **Income is always private** — enforced in code and by a DB CHECK constraint.

## Deploying (Vercel + Neon)

1. Create a Neon project; copy the pooled connection string.
2. Import the repo in Vercel; add the environment variables above (Production).
3. Add the production callback URL to the Google OAuth client.
4. Run `DATABASE_URL=<prod url> ADMIN_EMAIL=<you> pnpm db:migrate` once from your machine (and after each new migration).
5. Open the site on your phone and "Add to Home Screen" to install it.
