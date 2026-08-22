# Switch the backend from Lovable Cloud to your own Supabase

## What "Supabase only" means here

This switches the **backend** — database, auth, storage, and edge functions — from Lovable Cloud's managed Supabase to a Supabase project you own. You get the full dashboard, SQL editor, and direct connection strings, and you manage backups, monitoring, upgrades, and billing.

Supabase does **not** host the web app itself. The React app keeps running where it runs today: Lovable preview/publish and/or your AWS deployment (`deploy-aws.yml`). So "everything to Supabase" = the data/auth/storage/function layer, not app hosting.

## Reversibility (the one rule that shapes this whole plan)

You can back out at any point **until you click "Remove Lovable Cloud,"** which is permanent and deletes the Cloud instance. So:

- We keep Lovable Cloud fully running (DB, auth, edge functions, storage) the entire time.
- We build and verify the new Supabase project in parallel.
- You personally sign off on a verification checklist.
- Only then — and optionally after keeping Cloud as a read-only safety net for a week — do you click "Remove Lovable Cloud."

Until that click, reverting is: point the app back at the Lovable Cloud env values. No data loss.

## Who does what

- **You (in dashboards/CLI):** create the Supabase project, run the export/import, set GitHub + edge-function secrets, reconfigure auth provider/hooks, transfer storage files, click the final Remove.
- **Me (in code):** swap the Google sign-in off the Lovable broker, remove the dead `lovable.auth` wrapper, fix the `parse-receipt-ocr` AI-key dependency, and update `deploy-aws.yml`/secrets references.

---

## Phase 1 — Prepare the new Supabase project (you)

1. Create a Supabase project in your own org. Pick a paid plan suitable for production (you own backups/uptime now).
2. Note the region (keep it close to your users / AWS region).
3. Enable the extensions the schema depends on, before import: `vector`, `pg_cron`, `pg_net`, `pgcrypto`, and any others the dump references. (The import will error on missing extensions.)
4. Do **not** create tables manually — the import brings the full schema.

## Phase 2 — Export from Lovable Cloud (you)

1. Lovable → Cloud tab → Overview → Advanced settings → **Export project data**. This downloads the full DB (schema + data + RLS policies + functions/triggers + cron jobs).
2. The export does **not** include: storage files, edge function code, or secrets. Handle those in later phases.
3. Keep this export safe; it's your source of truth (the `supabase/migrations/` folder in the repo is known to be out of sync with the live DB, so do **not** rely on it for the import).

## Phase 3 — Import into the new project (you)

1. Restore the dump into the new project (Supabase CLI `db push` / `psql` / the dashboard SQL editor, per the dump format Lovable gives you).
2. Verify after import: extensions enabled, all tables present, RLS policies present, functions/triggers present, `cron.jobs` present.
3. Spot-check row counts on key tables (clients, evv_timesheets, profiles, etc.) against the export.

## Phase 4 — Connect external Supabase to Lovable (you + me)

1. In Lovable, connect your Supabase account/project (Settings → Supabase / Cloud). Lovable regenerates `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, and server `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`).
2. The service role key is now **yours to own** (Lovable no longer injects it). Set it where the app runtime needs it:
   - GitHub Actions secrets for the AWS deploy: `SUPABASE_SERVICE_ROLE_KEY` (new), plus update `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` to the new project's values.
   - Edge-function secret `SUPABASE_SERVICE_ROLE_KEY` (Phase 6).
3. I'll run `supabase--rebind_secrets` to refresh the sandbox binding once the connection is live.

## Phase 5 — Code edits (me)

1. **Google sign-in** — `src/routes/login.tsx`: replace `lovable.auth.signInWithOAuth("google", …)` with `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`. The current `redirect_uri` points at `/dashboard` (a protected route); switch it to a public origin and redirect after the session hydrates, per the auth guidance. Google provider gets configured in your Supabase dashboard (Phase 8).
2. **Remove the Lovable auth broker** — delete usage of `src/integrations/lovable` (`@lovable.dev/cloud-auth-js`) from `login.tsx`. The MCP `@lovable.dev/mcp-js` stack stays (build-time library, not Cloud-coupled).
3. **`parse-receipt-ocr` AI-key fix** — this edge function reads `LOVABLE_API_KEY` (the Lovable AI Gateway), which is auto-provisioned only inside the Lovable app runtime, not on an external Supabase edge function. Two options (your call):
   - (a) Set `LOVABLE_API_KEY` manually as an edge-function secret in your project, or
   - (b) Move the OCR call into a `createServerFn` so it uses the provisioned `LOVABLE_API_KEY` in the app runtime (cleaner; recommended). I'll do (b) unless you prefer (a).
4. **`deploy-aws.yml`** — confirm `SUPABASE_SERVICE_ROLE_KEY` is passed as an env var from GitHub secrets (it isn't today, because Lovable injected it). Add it so the AWS-deployed worker can do privileged operations.

## Phase 6 — Edge functions + secrets (you)

There are 13 edge functions in `supabase/functions/`. On external Supabase you deploy them yourself.

1. Deploy all 13 via `supabase functions deploy <name>` (or a GitHub Action). The code is already in the repo.
2. Set edge-function secrets in the new project. Known secrets to carry over: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID`, `RESEND_API_KEY`, Stripe keys, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and (per Phase 5) `LOVABLE_API_KEY` if you keep `parse-receipt-ocr` as an edge function.
3. Reconfigure the **auth hook** (`auth-send-email`, used for custom email sending via Resend) in Supabase Auth settings, including its hook secret.

## Phase 7 — Storage file transfer (you)

1. The DB export brings bucket definitions and `storage.objects` RLS policies, but **not the files**.
2. Download files from Lovable → Cloud tab → Storage, per bucket.
3. Re-upload to the matching buckets in the new project. Confirm object paths match the rows referenced by the DB.

## Phase 8 — Auth reconfiguration (you)

1. Enable the **Google** provider in your Supabase dashboard (Auth → Providers). Use the same Google OAuth client you use today, with the redirect URI set to your app's published/preview URL.
2. Reconfigure email templates / custom email hook if you rely on the Resend hook.
3. **User passwords are not exported.** Plan a one-time password reset for every staff member (they'll get a reset email). This happens at cutover (Phase 10).

## Phase 9 — Verify against the app (you + me)

Before cutover, run through the app pointed at the new backend:
- Sign in (email + Google), confirm session + RLS scoping.
- Load dashboard, clients, shifts/timesheets, billing, incidents, compliance/obligations.
- Trigger one edge function (e.g., a receipt OCR or a training checkout) end-to-end.
- Confirm storage file reads (client documents, audit packages).
- Confirm pg_cron jobs exist and their target URLs still resolve to your reachable app URL.
- Confirm the MCP server authenticates against the new project's issuer.
I'll help by running targeted server-function checks and reading logs.

## Phase 10 — Cutover (you, maintenance window)

1. Pick a low-traffic window. Freeze writes (or put up a maintenance banner).
2. Take a **final delta export** from Lovable Cloud (catches anything written since Phase 2) and import it, so the new backend is current.
3. Re-transfer any storage files added since Phase 7.
4. Switch the app to the new backend (it already is, if Phase 4 is done) and send password-reset emails to all staff.
5. Smoke-test the live flows.

## Phase 11 — Remove Lovable Cloud (you, last, optional delay)

1. Only after the verification checklist passes and you've run on the new backend for a few days.
2. Optional: keep Lovable Cloud **paused** (not removed) for a week as a read-only safety net. `supabase--pause` can pause it.
3. When confident: Lovable → Cloud tab → Overview → Advanced settings → **Remove Lovable Cloud**. This is permanent and deletes the instance + data. Take a final export first as an offline archive.

---

## Decisions / risks to flag

- **`parse-receipt-ocr` + `LOVABLE_API_KEY`** — won't auto-port; needs Phase 5 decision (manual secret vs. move to a server fn). Tell me which.
- **Service role key is now yours** — it bypasses RLS. Treat as a critical secret: never commit it, rotate if leaked, scope edge functions that use it.
- **pg_cron target URLs** — verify the cron jobs point at a reachable app URL (published domain or AWS). Reconfigure if the URL changed.
- **MCP auth** — the MCP server's OAuth issuer is built from `VITE_SUPABASE_PROJECT_ID`; it will point at the new project. Verify the MCP flow still authenticates after the switch.
- **SQL workflow change** — once you own the dashboard, the `docs/SQL_HANDOFF.md` human-runs-SQL workflow can be replaced by you running SQL directly in your dashboard. I can still apply migrations via chat if the connected integration supports it; otherwise SQL is yours to run. We'll confirm which chat DB tools remain after the switch.
- **AWS self-host** — `deploy-aws.yml` needs `SUPABASE_SERVICE_ROLE_KEY` added to GitHub secrets (Phase 4/5). On the plus side, the AWS deployment can finally do privileged operations it couldn't before.

## Out of scope (not changing)

- App hosting (Lovable publish + AWS) — Supabase doesn't host the web app.
- The `@lovable.dev/mcp-js` and `@lovable.dev/vite-tanstack-config` build libraries — these are npm packages, not Cloud-coupled.
