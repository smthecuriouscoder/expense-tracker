# Expense Tracker — Design Decisions

Decision record from the design grilling session and the plan-mode gap check (2026-10-22). A family expense tracker where users log income/expenses in free-form text, parsed by a free LLM, with an analytics dashboard. Implementation sequence lives in `PLAN.md`.

## 1. Users & Sharing

1. **Audience:** up to 10 users (owner + family). Invite-only via an email allowlist managed by the app admin.
2. **Ownership:** every entry has exactly one owner (the member who logged/paid it).
3. **Visibility:** an entry is either private (`group_id = null`) or belongs to exactly one group.
4. **Groups:** schema supports multiple groups (`groups`, `group_members`). UI defaults to a "Family" group. Group is chosen via a UI dropdown (defaults to last used) — the LLM never picks the group.
5. **No Splitwise mechanics:** no splits, debts, balances, or settle-ups.
6. **Permissions:**
   - Only the owner can edit, delete, or move their own entries. Others see them read-only.
   - Deletes are soft (`deleted_at`).
   - Group creator is admin. Admins add/remove members and can promote other admins. The last admin cannot leave without promoting someone.
   - Leaving a group keeps past entries visible to remaining members.
   - App admin manages the allowlist. Removed users lose login; their shared entries remain, attributed to "Name (inactive)".

## 2. LLM Parsing

7. **Providers:** hosted free-tier APIs behind a single interface `parse(text, context) -> Entry[]`.
   - Primary: Gemini Flash.
   - Fallback: Groq (Llama).
   - On 429/5xx, try the next provider; if all fail, open the manual entry form pre-filled with the raw text.
   - Local models (Ollama) can be added later as another provider.
8. **Data minimization:** the prompt contains only the input text, today's date (IST), category IDs, and currency. No names or user IDs.
9. **Input:** typed text only (no voice). Supports English, Hinglish, and Hindi (Devanagari). Batch input supported (multi-line or comma-separated → multiple entries).
10. **Parsing edge cases to cover with test fixtures:** Indian number formats (`2k`, `1.5 lakh`, numbers in words like "dhai sau") and relative dates (`kal`, `parso`, "last Sunday").
11. **Review flow:** LLM output is shown as editable preview cards with per-field confidence / `needs_review` flags.
    - One-tap "Save all".
    - Low-confidence or missing fields are highlighted and block saving until fixed.
    - No auto-save mode.
    - Raw input text is stored on each entry for audit and re-parsing.
12. **Extracted fields:** besides amount, type, category, date, description, and tags, the LLM extracts:
    - `merchant` (optional) — normalized payee name (trimmed, title-cased, e.g. "Swiggy", "DMart"). Powers the "Top merchants" widget; entries without one are skipped there.
    - `payment_method` (optional) — `UPI | Cash | Card | Net banking | Other`, filled only when the text mentions it.

## 3. Data Model

13. **Currency:** INR only. Stored as `amount_minor` (integer paise) + `currency` (default `'INR'`, hidden in UI). Never floats. If the LLM detects a non-INR currency, the card is flagged for review; no silent conversion.
14. **Dates:** stored as local `date` (`YYYY-MM-DD`, Asia/Kolkata), not timestamps.
15. **Entry types:** `expense`, `income`, `refund`.
    - Refunds link to a category and subtract from that category's spend.
    - Ambiguous text (e.g. "got 500 from Rahul") is flagged for review.
16. **Income:**
    - Always private — group dropdown is disabled for income entries.
    - Separate income categories: Salary, Business, Interest, Gift, Other.
17. **Expense categories:**
    - Global two-level preset tree (~12 parents, ~40 children), India-tuned (Groceries/Kirana, Fuel, Rent, EMI, Utilities, Dining, Travel, Medical, Education, Shopping, Subscriptions, Gifts, …).
    - An "Other" child under every parent.
    - Users can add custom child categories under existing parents only; custom categories are global to all users. No custom parents.
    - LLM picks from the closed list of IDs; falls back to "Other" + review flag when unsure.
    - Deleting a category requires reassigning its entries first; soft delete only.
18. **Tags:** free-form `#tags` as a separate dimension for events (e.g. `#goa-trip`, `#diwali`). LLM extracts them only when explicitly written.
19. **Merchant & payment method:** nullable `merchant` (text) and `payment_method` (enum) columns on entries.
20. **Recurring entries:** out of scope. Known risk: fixed costs (rent, EMI, subscriptions) are missing from analytics unless logged manually.

## 4. Transactions

21. **Transactions page:** paginated list of visible entries using the same global filters as the dashboard, plus text search over description and merchant.
22. **Editing:** the owner taps their entry to open a structured edit form. No LLM re-parse on edit. Other members' entries are read-only. Delete is soft with an undo toast.

## 5. Dashboard

23. **Approach:** fixed set of preset widgets + a global filter bar. No user-configurable layout or per-widget config, no query builder.
24. **Global filters:** date range, scope, category, member, tag, payment method.
25. **Scopes:**
    - **Me:** all entries I own (private + shared in any group), with an `include shared` toggle (default on).
    - **Group:** all entries in that group from all members.
26. **Widgets:**
    - KPI tiles: total spend, avg/day, month-over-month change, savings rate (Me only)
    - Spend over time (day / week / month)
    - Category breakdown with parent → child drill-down
    - Top merchants
    - Calendar heatmap of daily spend
    - Spend by member (group scope)
    - Tag / event totals
    - Month vs. previous month by category
    - Income vs. expense (Me only)
    - Spend by payment method
    - Largest transactions
27. **Income-dependent widgets** (savings rate, net, income vs. expense) appear only in Me scope and only for months with at least one logged income entry; otherwise they show "No income logged".

## 6. Stack, Hosting & Auth

28. **Framework:** Next.js (App Router, TypeScript), full-stack. LLM calls run in server routes; API keys never reach the client.
29. **Hosting:** Vercel free tier.
30. **Database:** Neon Postgres (free tier) + Drizzle ORM. Access control is enforced in application code — every query is scoped by owner and group membership.
31. **Auth:** Auth.js with Google OAuth only (all family members have Google accounts), gated by an email allowlist table (invite = add email). No passwords, no email sender.
32. **Client:** responsive, installable PWA with a mobile-first entry screen. Tailwind + shadcn/ui for UI, Recharts for charts.
33. **Backup:** CSV export of the user's visible entries (mitigates free-tier data-loss risk).
34. **Budget:** ₹0.

## 7. Implementation Notes

Decisions made while building (2026-10-22). They refine the product decisions above; none change them.

**Platform**
35. **Next.js 16 with Cache Components disabled.** Every page is per-user and reads the session, so nothing can be prerendered and `use cache` would add complexity for no gain. Pages are plain dynamic server components.
36. **Neon via the WebSocket driver** (`drizzle-orm/neon-serverless`), not the HTTP driver, because saving a batch and tag updates need real transactions.
37. **PGlite for local dev and tests.** `DATABASE_URL=pglite:<dir>` runs embedded Postgres in a folder. Tests use `pglite:memory`, so `pnpm test` runs the real migrations against real Postgres with no network or Docker.
38. **Business logic lives in `src/server/*`** and takes a `db` argument. Server actions and routes only authenticate and delegate. That keeps the logic testable and keeps authorization in one place (`src/server/access.ts`).
39. **Native `<select>` elements** instead of popover selects. They're better on phones (the main logging device) and need no extra dependency.

**Auth & membership**
40. **JWT sessions** carrying our user id. Every request re-checks that the user is still active, so removing someone from the allowlist takes effect immediately.
41. **The first user to sign in creates the default "Family" group** and is its admin. Every later user joins it automatically as a member (`groups.is_default`). This puts the "UI defaults to Family" decision (#4) into practice without any manual setup.
42. **The 10-person cap (#1) is enforced** when an email is invited.

**Entries**
43. **Restoring a deleted entry is blocked** if its owner has since left the entry's group, so it can't reappear in a group they can no longer see.
44. **Editing never overwrites `raw_text`**: it stays the original input.
45. **Tags are normalized** to lowercase `[a-z0-9-_]`, deduplicated, max 10 per entry.

**Categories**
46. **Categories have stable slugs** (`food.groceries`) that the LLM returns instead of UUIDs: shorter prompts, fewer hallucinated IDs. Custom categories get `parent.c-name` slugs.
47. **Only custom categories can be deleted**, by their creator or the app admin. Presets stay, so the LLM's closed list and "Other" fallbacks are always valid. Deleting moves *everyone's* entries to the chosen replacement (categories are global, #17).

**LLM parsing**
48. **The model returns rupees** (it's unreliable at paise), and the server converts.
49. **Post-validation never trusts the model:**
    - unknown or wrong-kind categories become the relevant "Other" and are flagged;
    - a parent slug maps to that parent's "Other";
    - invalid dates become today and are flagged; future dates are flagged;
    - a tag is kept only if the user literally typed `#tag`.
50. **Provider calls use `maxRetries: 0` and a 12 s timeout.** On failure we move straight to the next provider rather than retrying a rate-limited one. The parse route allows 30 s total.
51. **The per-user parse limit (60/hour) is kept in memory** per server instance. On serverless the real ceiling can be a small multiple of that, which is acceptable for 10 users protecting a shared free quota. Swap in a DB counter if abuse ever shows up.
52. **"Looks right" on a review card** accepts the model's guesses for that card. An empty amount still can't be confirmed; it must be filled in.

**Dashboard**
53. **The comparison period is the previous calendar month(s)** when the range is whole months (Oct vs Sep). Otherwise it's the same number of days immediately before. The KPI is labelled "vs previous period".
54. **Spend-over-time granularity is automatic**: day (≤45 days), week (≤200 days, weeks start Monday), otherwise month.
55. **Category drill-down reuses the global category filter.** Clicking a parent sets `?cat=<parent>`, and the breakdown then shows its children. No separate drill state.
56. **"Spend by member" covers only current members**; entries by people who left still count in group totals. The member filter lists current members only.
57. **Charts follow the dataviz guidance:**
    - spend = blue `#2a78d6`, income = orange `#eb6834` (validated for colour-blind separation and contrast); the comparison period is neutral grey;
    - the calendar heatmap uses a one-hue blue ramp with quantile buckets, so one big day (rent) doesn't wash out the rest;
    - ranked lists are HTML bars with printed values;
    - charts with data offer "Show as table" for accessibility.

**Export & naming**
58. **CSV export:**
    - covers all pages of the current filter, not just the visible page;
    - starts with a UTF-8 BOM, so Excel shows ₹ and Devanagari correctly;
    - cells starting with `= + - @` are prefixed with `'` to block spreadsheet formula injection.
59. **"Expense Tracker" is a placeholder name** (title, PWA manifest, icon `₹`). Rename freely.
60. **Dev-only login bypass.** Setting `DEV_AUTH_BYPASS_EMAIL` makes `pnpm dev` treat every request as that user, who is created as app admin. This lets you use the UI before Google OAuth is configured. It is honored only when `NODE_ENV=development`, so `next build`/`next start` and Vercel (including preview deploys) ignore it. A banner shows while it's active.

71. **Docker for cross-platform runs (Windows included).** `Dockerfile` has a `dev` target (`next dev`, source bind-mounted, used by `docker compose up`) and a `runner` target (`next build` + `next start`, compose profile `prod`). Both run `pnpm db:migrate` on start (idempotent).
    - `node_modules`, `.next` and `.data` (PGlite) live in Docker volumes, never the host folder, so Linux binaries don't clash with Windows/macOS ones and PGlite avoids the slow, lock-unfriendly host file share.
    - No local Postgres container: the app talks to Postgres through the Neon WebSocket driver, which can't reach a plain Postgres. Use Neon or `pglite:./.data/dev`.
    - File polling is opt-in (`NEXT_WATCH_POLL_MS`, wired to `watchOptions.pollIntervalMs`). Next's docs advise against polling; it's only for Windows drives mounted into Docker, where file events don't arrive.
    - `.gitattributes` forces LF so a Windows checkout behaves the same inside the Linux container.
    - The runtime image keeps full `node_modules` (no `output: "standalone"`): the migrate script needs `tsx`, and PGlite is loaded at runtime.

## 8. UI Design System

The "dark premium" redesign (2026-10-22), chosen over soft-fintech, bold-minimal and playful directions.

61. **Style: glass on ink.**
    - Dark base `#070B14` with a fixed "aurora" of blurred teal/blue gradients.
    - Frosted glass surfaces (`glass` utility: translucent fill, 1px hairline, 20px backdrop blur).
    - Gradient-bordered "glow" hero elements.
    - The accent gradient is teal → cyan → blue. Purple/pink "AI" gradients were avoided on purpose.
    - Tokens live in `src/app/globals.css`; utilities are `glass`, `glass-strong`, `glow-ring`, `bg-brand`, `text-gradient`, `aurora`, `shimmer`.
62. **Floating layers are solid, not glass:** the save bar, bottom sheets and dropdowns. Text from cards scrolling underneath bled through translucent layers and hurt readability.
63. **Theme follows the system,** with a Light / Dark / System toggle in the avatar menu (`next-themes`). Dark is the showcase; light mirrors it with a pale aurora and white glass.
64. **Contrast:**
    - Light-mode primary is `#0F766E` (5.5:1 with white text). The brighter `#0D9488` failed at 3.7:1.
    - Gradient buttons use dark ink `#04201C` (≥5:1 across the whole gradient), not white.
    - Body and muted text are ≥4.5:1 in both themes.
65. **Typography:** Space Grotesk for headings and big numbers, Inter for body text, `tabular-nums` on every amount.
66. **Motion** (`motion` library):
    - `MotionConfig reducedMotion="user"`, so the OS "reduce motion" setting turns animations off. Verified: the hero total renders final immediately with the setting on.
    - Interface transitions take 150–250ms; the hero count-up takes 0.6s; list stagger is 40–60ms.
    - Springs for the nav pill and save target; exits are faster than entrances.
    - Only transform and opacity are animated.
67. **Category identity:**
    - Each top-level category has a Lucide icon and a tint (`src/lib/category-style.ts`), shown as an icon avatar beside the category name, never on its own.
    - Charts do **not** use these tints: they stay single-hue blue per the dataviz rules (#57), so 12 categories never become 12 chart colours.
68. **Dashboard numbers are whole rupees** (`formatINRWhole`); individual transactions keep paise.
69. **Mobile navigation:**
    - A floating glass tab bar with a raised gradient "+" in the middle; the "+" opens the log composer in a bottom sheet from any page. Desktop keeps a Log link in the pill nav.
    - Mobile filters collapse into a one-line summary that opens a sheet, plus removable chips.
    - Touch targets are ≥44px (inputs `h-11` on mobile).
70. **Dashboard layout:** rows pair cards of similar height (trend + categories, comparison + merchants, income + heatmap, payment + tags). Long ranked lists show the top 6 with "+N more", so cards don't stretch into empty space.

## Deferred / Out of Scope

- Splits, debts, settle-ups
- Recurring entries and reminders
- Voice input
- Multi-currency and FX conversion
- Custom dashboard layouts, widget configuration, query builder, natural-language "ask your data"
- Auto-save without review
- LLM re-parse when editing an entry
- Email magic-link / password login
- Audit log for entry edits
- Push / email notifications
- Local LLM provider (Ollama)
