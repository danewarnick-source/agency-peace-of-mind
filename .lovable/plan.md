# Switch the backend from Lovable Cloud to your own Supabase

## The key constraint (verified from Lovable docs)

You **cannot** convert this project in place. Lovable Cloud and a connected (your own) Supabase account are mutually exclusive on a single project, and there's no automatic migration. So the move is:

1. Export the database from Lovable Cloud.
2. Create a **new Lovable project** connected to your own Supabase, and push this repo's code to it.
3. Import the data, redeploy edge functions + secrets, reconfigure auth, transfer storage.
4. Verify, then repoint the domain and cut over.
5. Only after you're stable do you "Remove Lovable Cloud" on the old project (irreversible).

The app itself (React/TanStack code) carries over via GitHub — you're not rebuilding it, just re-homing it. Your team operates the new Supabase (backups, monitoring, billing).

## Reversibility (shapes the whole plan)

You can back out at **any point until you click "Remove Lovable Cloud"** on the old project. Until then the old project keeps running as a live safety net; reverting = keep using the old project / repoint the domain back. "Remove Lovable Cloud" permanently deletes the old Cloud database, storage, auth, and edge functions — do it last, optionally after pausing (not deleting) for a week.

---

## Phase 0 — Fix the pre-existing build errors (me, first)

The app currently does not build: `src/lib/utah-dspd-pack/coverage.ts` has many `TS2741` errors — `PackCoverageRow` requires a `note` field that the data rows don't provide. This is unrelated to the migration but blocks every commit/push (CLAUDE.md requires a green build before pushing `src/routeTree.gen.ts`). Fix it first: make `note` optional on `PackCoverageRow` (or add `note` to the rows), verify `npm run build` passes. **This is a prerequisite for all code edits below.**

## Phase 1 — Create your Supabase project (you)

1. Create a Supabase project in your own org, production-appropriate plan, region near your users/AWS.
2. Enable extensions before import: `vector`, `pg_cron`, `pg_net`, `pgcrypto` (+ any others the dump references).
3. Do **not** create tables manually — the import brings the full schema.

## Phase 2 — Export from Lovable Cloud (you)

1. Current project → Cloud tab → Overview → Advanced settings → **Export project data** (full DB: schema + data + RLS + functions/triggers + cron).
2. Not included: storage files, edge function code, secrets (handled in later phases).
3. The export dump is the source of truth — the repo's `supabase/migrations/` is known out of sync; don't rely on it for import.

## Phase 3 — Import into your Supabase (you)

1. Restore the dump (Supabase CLI / `psql` / dashboard SQL editor, per the dump format).
2. Verify: extensions, tables, RLS policies, functions/triggers, `cron.jobs` all present.
3. Spot-check row counts (clients, evv_timesheets, profiles) against the export.

## Phase 4 — Create the new Lovable project + connect your Supabase (you + me)

1. In Lovable, create a **new project** and connect your Supabase account during setup (Cloud and connected-Supabase are mutually exclusive, so it must be a fresh project).
2. Link the new project to this GitHub repo so the codebase loads (import from GitHub).
3. Lovable regenerates env for the new project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, server `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`). You now own the **service role key** — set it as a secret where the app runtime and edge functions need it.
4. I'll run `supabase--rebind_secrets` after connection and confirm the new project builds green.

## Phase 5 — Code edits (me, on the repo — applies to whichever project loads it)

1. **Google sign-in** — `src/routes/login.tsx`: replace `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" })` with `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`. Fix the redirect off the protected `/dashboard` to a public origin; navigate after the session hydrates. Google provider configured in your Supabase dashboard (Phase 8).
2. **Remove the Lovable auth broker** — drop `@lovable.dev/cloud-auth-js` usage from `login.tsx` (`src/integrations/lovable`). Keep `@lovable.dev/mcp-js` (build-time library, works with any Supabase — not Cloud-coupled).
3. **`parse-receipt-ocr` AI key** — this edge function reads `LOVABLE_API_KEY` (Lovable AI Gateway), auto-provisioned only in the app runtime, not on an external Supabase edge function. Default: move the OCR call into a `createServerFn` so it uses the provisioned `LOVABLE_API_KEY` (cleaner, follows the no-new-edge-function rule). Alternative: set `LOVABLE_API_KEY` manually as an edge-function secret. Tell me if you prefer the alternative.
4. **`deploy-aws.yml`** — add `SUPABASE_SERVICE_ROLE_KEY` from GitHub secrets as a deploy env var (it's absent today because Lovable injected it). Needed only if you keep the AWS self-host path running.

## Phase 6 — Edge functions + secrets (you)

13 edge functions in `supabase/functions/`. On external Supabase you deploy them yourself.

1. `supabase functions deploy <name>` for all 13 (or a GitHub Action).
2. Set edge-function secrets: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID`, `RESEND_API_KEY`, Stripe keys, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LOVABLE_API_KEY` only if you keep `parse-receipt-ocr` as an edge function.
3. Reconfigure the **auth hook** (`auth-send-email`, custom email via Resend) in Auth settings, incl. its hook secret.

## Phase 7 — Storage file transfer (you)

1. DB export brings bucket definitions + `storage.objects` RLS policies, but **not the files**.
2. Download files from old project → Cloud tab → Storage, per bucket; re-upload to matching buckets in your project.
3. Confirm object paths match the DB references.

## Phase 8 — Auth reconfiguration (you)

1. Enable **Google** in Auth → Providers (same Google OAuth client, redirect URI = your app's published/preview URL).
2. Reconfigure email templates / custom email hook (Resend).
3. **User passwords are not exported** — plan a one-time password reset email to all staff at cutover.

## Phase 9 — Verify on the new project (you + me)

Before cutover: sign in (email + Google) with correct RLS scoping; load dashboard, clients, shifts/timesheets, billing, incidents, compliance; run one edge function end-to-end; read a storage file; confirm pg_cron jobs exist and their target URLs resolve to a reachable app URL; confirm the MCP server authenticates against the new project's issuer. I'll run targeted server-function checks and read logs.

## Phase 10 — Cutover (you, maintenance window)

1. Low-traffic window; freeze writes / maintenance banner.
2. Final delta export from old Cloud + import (catches anything since Phase 2); re-transfer any new storage files.
3. Repoint the published URL / custom domain to the new project; send password-reset emails to all staff.
4. Smoke-test live flows.

## Phase 11 — Remove Lovable Cloud on the old project (you, last)

1. Only after stable running on the new backend for a few days. Optional: pause the old Cloud (`supabase--pause`) for a week first.
2. Then: old project → Cloud tab → Overview → Advanced → **Remove Lovable Cloud**. Permanent; deletes DB/storage/auth/edge functions. Take a final export as an offline archive first.

---

## Decisions / risks

- **`parse-receipt-ocr` + `LOVABLE_API_KEY`** — needs Phase 5 decision (default: move to a server fn).
- **Service role key is now yours** — it bypasses RLS. Treat as critical: never commit, rotate if leaked, scope the edge functions that use it.
- **pg_cron target URLs** — verify cron jobs point at a reachable app URL after the domain move.
- **Published URL / custom domain** — the `agency-peace-of-mind.lovable.app` subdomain belongs to the old project; the new project gets a new publish URL and you re-point any custom domain.
- **Project history/plans** — don't transfer to the new Lovable project; code does (via GitHub).
- **SQL workflow change** — once you own the dashboard, the `docs/SQL_HANDOFF.md` human-runs-SQL workflow can be replaced by running SQL directly in your dashboard.

## Alternative path (if you'd rather drop Lovable entirely)

**Option B — fully self-host on AWS + your own Supabase.** You already deploy via `deploy-aws.yml`. Point that AWS deployment at your Supabase (all `SUPABASE_*` env incl. service role), import data, deploy edge functions via CLI, and stop using Lovable hosting. Cost: you lose Lovable's in-chat editing/preview/publish for this project — you'd develop via your own env + GitHub + AWS. I defaulted to the new-project path (above) because it preserves the chat-based development you rely on; say the word if you'd rather go full self-host.

## Out of scope

- App hosting stays on Lovable (new project) unless you choose Option B — Supabase doesn't host the web app.
- `@lovable.dev/mcp-js` / `@lovable.dev/vite-tanstack-config` build libraries stay (npm packages, not Cloud-coupled).
