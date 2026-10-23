# Plan: Family Expense Tracker (free-text LLM parsing + analytics)

## Status (2026-10-22)

| Milestone | State |
|---|---|
| 1. Setup | Done: Node 22, Next 16, Tailwind 4, shadcn/ui, Drizzle, Vitest + PGlite |
| 2. Auth & membership | Done: Google + allowlist, admin from `ADMIN_EMAIL`, groups and roles |
| 3. Entries core | Done: schema + migration, category seed, entry CRUD, access layer, transactions list/edit |
| 4. LLM parse | Done: prompt, Gemini → Groq fallback, post-validation, review cards, 40 eval fixtures |
| 5. Dashboard | Done: 11 widgets + filter bar with drill-down |
| 6. Polish & ship | Done in code: CSV export, PWA manifest, rate limit. **Pending:** Vercel deploy, real credentials, `pnpm eval:parse` run with live keys, visual pass on a phone |

| 7. UI redesign ("dark premium") | Done: glass design system, light/dark/system theme, motion, category icons, mobile "+" bottom sheet, dashboard bento, day-grouped transactions. Screenshotted in both themes at 390px and 1280px |

**Verified:** 44 automated tests pass (unit, DB access matrix, analytics, LLM post-validation and fallback); `typecheck`, `lint` and `build` are clean; every signed-in page was smoke-tested against a seeded local DB.
**Not yet verified:** real Google sign-in, live LLM accuracy, how the UI looks on a phone.

Deviations from the layout below:
- `auth.ts` lives at `src/auth.ts` (Auth.js convention).
- The log screen is `src/app/(app)/log-screen.tsx`.
- Filter loading is shared in `src/server/views.ts`.
- The DB connection supports `pglite:` URLs for local dev.

See DECISIONS.md §7 for the implementation decisions.

## Context
Greenfield project (`/Users/sagar.mittal/Practice Projects/expense-tracker` contains only `DECISIONS.md` and `.claude/`). Goal: a web app for up to 10 family members to log expenses/income in free-form text (English / Hinglish / Devanagari), parsed by a free LLM into reviewable entries, with private + shared-group visibility and a preset analytics dashboard. All product decisions are recorded in `DECISIONS.md`; this plan turns them into an implementation sequence.

Additional decisions from the plan-mode gap check:
- LLM extracts an optional, normalized `merchant` field → powers "Top merchants" widget.
- Optional `payment_method` enum (UPI / Cash / Card / Net banking / Other), filled only when text mentions it → adds "Spend by payment method" widget.
- Google OAuth only (all members have Google accounts).
- Transactions page: paginated list with global filters + text search; owner taps entry → structured edit form (no LLM re-parse).

## Environment prerequisite
- Local Node is **v18.20.8** — current Next.js requires Node ≥ 20. Run `nvm install 22 && nvm use 22`, add `.nvmrc` (`22`). Package manager: **pnpm** (already installed).

## Stack
Next.js (App Router, TS) · Tailwind + shadcn/ui · Drizzle ORM + Neon Postgres (`@neondatabase/serverless`) · Auth.js v5 (Google, JWT sessions) · Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) with `generateObject` + zod for structured output · Recharts · zod · Vitest + PGlite for DB tests · deploy on Vercel free.

Model IDs come from env (`LLM_PRIMARY_MODEL`, `LLM_FALLBACK_MODEL`) since free-tier model names change.

## Project layout
```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx            # session guard, nav, scope/filter context
    (app)/page.tsx              # Log screen: textarea + preview cards
    (app)/transactions/         # list, search, edit form
    (app)/dashboard/page.tsx    # filter bar + widgets
    (app)/groups/               # list, create, members (admin actions)
    (app)/settings/             # custom categories, allowlist (app admin), CSV export
    api/parse/route.ts          # POST text -> Entry[] drafts (maxDuration ~30s)
    api/export/route.ts         # CSV of visible entries
    api/auth/[...nextauth]/route.ts
  server/
    db/schema.ts, db/index.ts, db/seed.ts (category tree + Family group)
    auth.ts                     # Auth.js config; signIn callback checks allowlist, upserts user
    access.ts                   # visibleEntriesWhere(user, scope), canEdit(user, entry)
    entries.ts                  # create/update/softDelete/move (server actions, zod-validated)
    groups.ts                   # create, add/remove member, promote, leave (last-admin guard)
    analytics.ts                # one query fn per widget, all via access.ts
    llm/{schema.ts, prompt.ts, providers.ts, parse.ts}
  components/{entry-card, filter-bar, widgets/*}
  lib/{money.ts, dates.ts}      # paise<->display, IST today/date helpers
tests/  (vitest) + tests/fixtures/parse-cases.json
scripts/eval-parse.ts           # live LLM eval against fixtures
```

## Data model (`src/server/db/schema.ts`)
- `users` (id, email unique, name, image, is_app_admin, active, created_at)
- `allowed_emails` (email pk, added_by, created_at)
- `groups` (id, name, created_by, created_at)
- `group_members` (group_id, user_id, role `admin|member`, joined_at, left_at null) — membership active when `left_at is null`
- `categories` (id, parent_id null, name, kind `expense|income`, is_custom, created_by, sort, deleted_at). Custom = child only (enforce parent_id not null in action).
- `entries` (id, owner_id, group_id null, type `expense|income|refund`, amount_minor bigint > 0, currency default 'INR', category_id, date `date`, description, merchant null, payment_method enum null, raw_text, created_at, updated_at, deleted_at)
  - CHECK: `type = 'income'` ⇒ `group_id is null`
  - Indexes: (owner_id, date), (group_id, date)
- `tags` (id, name unique lowercase) · `entry_tags` (entry_id, tag_id)

Amounts always positive; sign derived from type. Spend = Σexpense − Σrefund.

## Access rules (`src/server/access.ts`) — single source, used by every query
- **Me scope:** `owner_id = me AND deleted_at is null` (+ `group_id is null` when "include shared" off).
- **Group scope:** user is active member of group AND `entries.group_id = group` (all members' entries, incl. inactive/left owners).
- **Edit/delete/move:** owner only; moving into a group requires owner be active member; income cannot be moved to a group.
- Users who left a group still see their own entries via Me scope.

## LLM parse (`src/server/llm/`)
- `schema.ts`: zod `ParsedEntry { type, amount_minor|null, currency, category_id|null, date, description, merchant|null, payment_method|null, tags[], confidence: {amount, category, date, type}, needs_review, review_reason|null }`, response `{ entries: ParsedEntry[] }`.
- `prompt.ts`: system prompt with today's IST date, closed category list (id + name + parent, expense & income), rules for k/lakh/number words, kal/parso, Devanagari, refunds vs income, explicit `#tags` only, non-INR → needs_review. No user names/ids sent.
- `providers.ts` / `parse.ts`: try primary → fallback with per-provider timeout (~10s); on 429/5xx/timeout/zod-fail move to next; all fail → `{ error: 'llm_unavailable' }` and UI opens manual form prefilled with raw text.
- Server post-validation: unknown category_id → "Other" child + needs_review; amount null → needs_review.
- Simple per-user throttle (e.g. 60 parses/hour, in-memory/DB counter) to protect shared free quota.

## UI flows
- **Log screen:** textarea (multi-line batch) → Parse → editable cards (amount, type, category picker, date, description, merchant, payment method, tags). Group dropdown is per-submit (default last used, stored in localStorage), disabled for income cards. Flagged fields highlighted; "Save all" disabled until resolved. "Add manually" button always present.
- **Transactions:** same filter bar + search (description/merchant ilike), paginated; own entries editable via form; others read-only; soft delete with undo toast.
- **Dashboard:** filter bar (date range default = current month, scope `Me | <groups>`, include-shared toggle, category, member, tag, payment method). Widgets: KPI tiles (total, avg/day, MoM %, savings rate*), spend over time (day/week/month), category breakdown w/ drill-down, top merchants, calendar heatmap, spend by member (group), tag totals, this vs last month by category, income vs expense*, payment method split, largest transactions. *Me scope only, months with income only, else "No income logged".
- **Groups:** create, add members from allowlisted users, promote/remove (admin), leave (blocked for last admin).
- **Settings:** add custom subcategory, delete category (reassign-first dialog), allowlist management (app admin), CSV export.
- **PWA:** `app/manifest.ts`, icons, mobile-first layout. No offline sync.

## Milestones
1. **Setup:** Node 22, `create-next-app`, Tailwind, shadcn, Drizzle + Neon, env schema, Vitest + PGlite.
2. **Auth & membership:** Auth.js Google + allowlist, seed app admin from env `ADMIN_EMAIL`, groups + members.
3. **Entries core:** schema, migrations, category seed, manual entry form, access.ts, transactions list/edit/delete.
4. **LLM parse:** prompt, providers, fallback, preview cards, fixtures + eval script.
5. **Dashboard:** analytics queries + widgets + filter bar.
6. **Polish & ship:** CSV export, PWA manifest, throttle, Vercel deploy (env vars, Neon prod branch, Google OAuth redirect URIs).

## Verification
- **Unit (Vitest):** `lib/money` (paise formatting, rounding), `lib/dates` (IST today), prompt builder, post-validation of LLM output, last-admin guard.
- **DB (Vitest + PGlite running Drizzle migrations):** access rules matrix — private hidden from group, group visible to members only, left member loses group view but keeps own entries, non-owner edit rejected, income-in-group CHECK fails; analytics totals incl. refunds.
- **LLM eval:** `pnpm eval:parse` hits live Gemini/Groq over `tests/fixtures/parse-cases.json` (~40 cases: "chai 20, auto 60", "kal sabzi dhai sau", "दूध 60", "rent 25k", "amazon refund 1200", "salary 1.5 lakh", "$40 dinner", "got 500 from Rahul", "#goa-trip hotel 4000") and reports field accuracy; force-fail primary to confirm fallback.
- **Manual E2E:** `pnpm dev`, log in with two Google accounts (one allowlisted, one not → rejected), log batch text, confirm cards, check Me vs Family dashboard numbers match transactions list totals, export CSV, install PWA on phone after Vercel deploy.
