# Security & HIPAA-Readiness Audit

**Application:** Agency Peace of Mind (disability-services compliance app)
**Stack:** TanStack Start + Nitro, Supabase (Postgres + Auth + Storage), Cloudflare Workers
**Audit type:** Read-only. No application code, database schema, or configuration was changed. The only file created is this report.
**Date:** 2026-06-07
**Tenancy model:** Multiple provider organizations share one database; rows must be isolated per organization. PHI = client/patient data (names, DOB, address, Medicaid ID, medications, diagnoses, incidents, behavior notes, care plans, documents).

---

## ⚠️ Important limitation — please read first

I was **not able to inspect the live production database**. The Supabase tooling available to me could only reach a *different, inactive* project (`refrpqrxpjeqmygxgekp`), not the production project referenced in `.env` (`mmknqtdrefbzwfdtykza`). Every finding about Row Level Security (RLS) and Storage below is therefore derived from the **migration files in `supabase/migrations/`**, which describe the *intended* state of the database.

Two things follow from this:

1. The migrations are cumulative (155 files). I traced where later migrations drop/replace earlier rules, but the **live database is the only authoritative source**. Before relying on this report, confirm the live state in the Supabase dashboard, and run the built-in Supabase **Security Advisor** (Dashboard → Advisors).
2. I **cannot confirm whether anyone manually changed settings in the dashboard** (for example, flipping a storage bucket back to private). Where this matters, I say so explicitly.

I also **cannot determine from code whether legal agreements (BAAs) exist** with third-party vendors. That is a question for your contracts, not the codebase.

---

## 🔴 Fix these first (CRITICAL)

1. **`client-photos` storage bucket is marked PUBLIC.** Photos of clients (PHI) can be downloaded by anyone on the internet who has the file's URL — no login required. The access rules were tightened in a later migration, but the *bucket itself was never switched back to private*, and a public bucket ignores those rules. **→ Set the bucket to private (`public = false`) and serve photos via short-lived signed URLs.** (Finding C1)

2. **Cross-organization employee deletion/disabling (IDOR) in `src/lib/lifecycle.functions.ts`.** A manager of Organization A can pass the ID of a staff member in Organization B and archive (disable) or even fully delete that person's account. The code uses the all-powerful service-role key, which bypasses all database protections, and never checks the target actually belongs to the manager's org. **→ Verify the target user belongs to the caller's organization before any change.** (Finding C2)

3. **PHI is sent to an outside AI service (Lovable AI Gateway → Google Gemini) and a signed BAA is required.** Many features ship full client records — names, DOB, Medicaid IDs, medication lists, diagnoses, care-plan goals, behavior/seizure protocols — to `ai.gateway.lovable.dev`, which forwards to Google Gemini. Under HIPAA you must have a signed Business Associate Agreement (BAA) with **both Lovable and Google** before sending them PHI. **→ Confirm BAAs are in place; if not, disable the PHI-bearing AI features until they are.** (Finding C3)

Also strongly recommended before go-live: stop committing `.env` (H1), close the anonymous read on the `certifications` table (H2), and add security response headers (M2).

---

## What's already good (so you know it's not all bad)

The core tenant-isolation design is **solid and clearly intentional**:

- **Every one of the 145 tables created in migrations has Row Level Security enabled.** None were left off.
- Tenant isolation uses a clean set of helper functions (`is_org_member`, `has_org_role`, `is_org_admin_or_manager`, `is_super_admin`, `user_org_ids`). They are written safely (`SECURITY DEFINER` with a pinned `search_path`) and all check active membership in `organization_members`.
- The sensitive PHI tables I spot-checked — `clients`, `client_medications`, `client_documents`, `incident_reports`, `daily_logs`, `shift_notes`, `emar_logs`, `hhs_*`, `behavior_support_clients`, `bc_*`, `nectar_documents`, `notifications`, `hr_documents` — are all correctly scoped by organization.
- The team has a visible track record of fixing security issues: earlier `USING (true)` mistakes on `profiles`, and over-broad storage rules on `client-photos`, `client-documents`, and `nectar-documents`, were each found and remediated in later migrations.
- The receipt-OCR edge function was hardened against SSRF and restricts which buckets it can read.
- The public cron endpoint uses a constant-time secret comparison and fails closed.

The findings below are the gaps that remain on top of that foundation.

---

# Findings

Severity key: **CRITICAL** = active PHI exposure or cross-tenant breach likely · **HIGH** = serious weakness, exploit plausible · **MEDIUM** = should fix before handling real PHI · **LOW** = hygiene / defense-in-depth.

---

## 1. Exposed secrets

### H1 — `.env` is committed to the repository
- **Plain English:** The project's environment file is checked into git. Today it contains only the Supabase **publishable ("anon") key**, the project URL, and the project reference. The anon key is *designed* to be public (it is also shipped to the browser), so on its own this is **low-impact**. The real problem is the **process failure**: `.env` is the file where the truly dangerous secret — the `SUPABASE_SERVICE_ROLE_KEY` (which bypasses all database security) — would normally live, and your `.gitignore` does **not** list `.env`, so the next person who adds the service-role key (or any other secret) to it will commit it without warning.
- **Where:**
  - The committed file: `.env` (repo root). Contains `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the `VITE_`-prefixed copies of the same.
  - First committed in git history as commit `abde69e` ("Added CE course phase 1").
  - `.gitignore` (repo root) — it ignores `*.local` and `.dev.vars` but **not** `.env`. That omission is exactly why `.env` was committable.
  - Confirmed: `git check-ignore .env` returns nothing (not ignored) and `git ls-files` shows it as tracked.
- **Why it matters for HIPAA/PHI:** Source code is copied to every developer laptop, CI runner, and fork. A committed service-role key would give anyone with repo access unrestricted read/write to all PHI in the database, defeating every RLS rule. Even the currently-committed values disclose your exact project, which aids targeted attacks.
- **The specific fix:**
  1. Add `.env` (and `.env.*`, keeping a non-secret `.env.example`) to `.gitignore`.
  2. Remove `.env` from tracking: `git rm --cached .env` and commit. (For full hygiene, scrub it from history with `git filter-repo`, since it lives in past commits.)
  3. **Rotate as a precaution:** in the Supabase dashboard, rotate the project API keys. The anon key is low-risk but rotating it is cheap insurance. **If a `SUPABASE_SERVICE_ROLE_KEY` was ever committed at any point, rotate it immediately** — I did not find one in the current tree, but check history.
  4. Store real secrets in the deployment platform's secret manager (Cloudflare/Supabase), not in a file.

### Inventory of every secret found committed or hardcoded
I scanned all tracked files (excluding lockfiles and the generated `types.ts`):
- **Supabase anon/publishable key** — committed in `.env` (5 lines). Public-by-design; rotate as hygiene. **The same key is also intentionally bundled into the browser app** via `VITE_SUPABASE_PUBLISHABLE_KEY` (`src/integrations/supabase/client.ts:9`). That is normal for Supabase and is *not* a leak — but be aware this key is visible to anyone using the app, which is exactly why your RLS rules must be airtight.
- **No `SUPABASE_SERVICE_ROLE_KEY`, no `sk-`/OpenAI keys, no AWS keys, no passwords, no private keys, and no database connection strings** were found hardcoded anywhere. The service-role key and `LOVABLE_API_KEY` are correctly read from environment variables at runtime (`src/integrations/supabase/client.server.ts:10`, and `process.env.LOVABLE_API_KEY` across the AI feature files). Good.
- The many `GRANT ALL ... TO service_role` lines in migrations are **not** secrets — they grant database privileges to the `service_role` database role; no key value is exposed.

---

## 2. Supabase Row Level Security (RLS)

**Overall:** All 145 migration-created tables have RLS enabled, and the PHI tables are correctly tenant-scoped. The issues below are specific over-permissive policies. (Reminder: confirm against the live DB / Security Advisor.)

### H2 — `certifications` table is readable by anyone, logged in or not (`USING (true)` for `anon`)
- **Plain English:** There is a policy that lets **unauthenticated** visitors read the entire `certifications` table. It was meant to support "public certificate verification," but instead of returning one certificate when someone supplies a valid code, it allows reading **all rows for all organizations**.
- **Where:** `supabase/migrations/20260521183750_64546da5-e610-4457-986c-b8f6d8e1a718.sql:228-229`
  ```sql
  CREATE POLICY "public verify cert" ON public.certifications FOR SELECT
    TO anon, authenticated USING (true);
  ```
  The table (same file, line 212) contains `recipient_name`, `course_title`, `organization_id`, `verification_code`, `user_id`. No later migration drops this policy.
- **Why it matters:** Staff names and which organization they belong to are exposed to the open internet. While staff names are PII rather than client PHI, this is still a cross-tenant, fully-anonymous data leak from a healthcare system.
- **The specific fix:** Replace with a function/RPC that returns a single certificate only when the caller supplies the exact `verification_code`, or restrict the policy to `USING (verification_code = current_setting('request.jwt.claims', true)...)`-style scoping. At minimum remove `anon` and scope reads to `is_org_member(organization_id, auth.uid())`.

### H3 — `staff_certifications` table is readable across all tenants (`USING (true)` for authenticated)
- **Plain English:** Any logged-in user from any organization can read **every** organization's staff certification records.
- **Where:** `supabase/migrations/20260521181404_5027edf5-f7aa-4c05-869e-5ec0acd40ea9.sql:58`
  ```sql
  CREATE POLICY "auth can read certs" ON public.staff_certifications FOR SELECT TO authenticated USING (true);
  ```
  The table (line 47) has `staff_name`, `role`, `certification`, dates — and **no `organization_id` column at all**, so it cannot even be tenant-scoped as written. It looks like leftover demo/seed data. Not dropped by any later migration.
- **Why it matters:** Cross-tenant exposure of staff PII. Because there is no org column, this table cannot be made multi-tenant-safe without a schema change.
- **The specific fix:** If unused, drop the table. If used, add `organization_id` and rewrite the policy to `is_org_member(organization_id, auth.uid())`.

### LOW — `USING (true)` policies on global reference/lookup tables (acceptable, listed for completeness)
These tables hold shared, non-PHI catalog/reference data and have no per-organization ownership, so an authenticated-read-all policy is reasonable. Listed so you know they were reviewed and are *not* considered leaks:
- `training_modules` — `supabase/migrations/20260522064701_...:16-19` (global training catalog, no org column)
- `system_features` — `20260525030431_...:13-14`
- `platform_states`, `state_derived_requirements` — `20260602215012_...:26-27, 155-156`
- `hive_base_template_versions` — `20260603011949_...:26-27`
- `training_topics` — `20260605224559_...:20-21`
- `training_checklist_mappings` — `20260606130937_...:17-18`
- `auditor_share_access_log` — `20260601181247_...:115-116` is `FOR INSERT WITH CHECK (true)`; append-only audit log, low risk, though it lets a user insert arbitrary log rows.
- **Resolved item (no action):** `profiles` once had `FOR SELECT ... USING (true)` (`20260529033800_...:42-43`); it was correctly replaced with self-only access in `20260603040839_...`. Good.

### Service-role key reaching the client
- **Good news:** The service-role client (`src/integrations/supabase/client.server.ts`) is server-only and the key is read from `process.env`. It is **never** imported into browser code. The two browser-exposed values (`VITE_SUPABASE_*`) are the anon key and URL only. No service-role exposure to the client was found. (But see C2 for misuse of the service-role client *on the server*.)

---

## 3. PHI exposure

### C3 — PHI sent to a third-party AI service (Lovable AI Gateway → Google Gemini) — BAA REQUIRED
- **Plain English:** Almost every "AI"/"NECTAR"/"coach" feature sends data to `https://ai.gateway.lovable.dev`, which relays it to Google Gemini models. Many of these calls include clear PHI. Under HIPAA, sending PHI to an outside company is only allowed if you have a signed **Business Associate Agreement (BAA)** with that company. Here you would need one with **Lovable** (the gateway operator) **and** assurance that the **Google Gemini** backend is BAA-covered. Whether those agreements exist cannot be told from the code — you must verify it.
- **Where (highest-PHI calls):**
  - `src/lib/pdf-import.functions.ts:230` — sends **entire care-plan (PCSP) document text**: name, Medicaid ID, DOB, address, phone, guardians/emergency contacts, full medication list, diagnoses with ICD-10 codes, allergies, behavior tier, seizure/choking protocols, plan goals.
  - `src/lib/nectar-staff.functions.ts:154` — sends **client full name + plan goals + complete active medication list** (dose, frequency, route, PRN, controlled-substance flag, choking-risk details). The code itself comments at line 359 that this is PHI.
  - `src/lib/medications.functions.ts:44` — sends **MAR / physician order / pharmacy printout** (image + text).
  - `src/lib/billing-budget-parse.functions.ts:82` — sends **full PCSP/1056 budget form image** (client identity + plan).
  - `src/lib/ai-coach.functions.ts:65` — sends **client first name + caregiver shift narratives** (which routinely describe incidents, injuries, medical and behavioral events) + plan goals.
  - `src/lib/nectar-documents.functions.ts:95` — sends **raw document text** (intake/assessment: name, DOB, Medicaid ID).
  - `src/lib/vector-search.functions.ts:44 & 87` — sends **shift-note narratives** to be embedded, plus admin free-text queries.
  - `src/lib/nectar-document-actions.functions.ts:88 & 213`, `src/lib/nectar-help.functions.ts:57` (client names in org snapshot), `src/lib/audit-packet.functions.ts:44`, `src/lib/nectar-reports.functions.ts:139` — varying amounts of client-identifying text.
  - Edge functions: `supabase/functions/parse-receipt-ocr/index.ts:96` (receipt images, which can reveal pharmacy/treatment) and `supabase/functions/format-training-content/index.ts:74` ("person-specific support information").
- **Why it matters:** This is the single largest HIPAA exposure surface in the app. Disclosing PHI to a business associate without a BAA is a reportable HIPAA violation regardless of whether the data is later misused.
- **The specific fix:**
  1. Confirm in writing that a BAA covers Lovable's AI Gateway **and** the underlying Gemini service. Note that Google's *consumer* Gemini and the free/standard Gemini API are generally **not** BAA-eligible — only specific Google Cloud Vertex AI configurations are. Verify which one the gateway uses.
  2. If BAAs are not in place, disable the PHI-bearing features listed above until they are, or route them to a BAA-covered model.
  3. Maintain a data-flow inventory of exactly which fields each feature sends, for your HIPAA documentation.
- **Third parties identified (BAA status to confirm):** **Lovable** (AI gateway — needs BAA), **Google Gemini** (AI backend — needs BAA). No analytics SDKs (PostHog/Segment/Sentry/etc.), no email/SMS vendors (Resend/SendGrid/Twilio), and no other PHI-receiving services were found. One non-PHI external call exists to `https://api.ipify.org` (`src/routes/dashboard.courses.topic.$topicId.tsx:40`) which returns the user's own IP for attestation logging — low risk, but it is an un-vetted third party that sees user IP addresses.

### M5 — Client financial data logged to the browser console
- **Plain English:** A "QuickBooks bridge" feature prints a client's ID, a dollar amount, and a free-text memo to the browser developer console. Browser console output can be captured by browser extensions, screen-share/recording tools, and support sessions.
- **Where:** `src/routes/dashboard.settings.bank-mapping.tsx:189`
  ```js
  console.info("[QBO Bridge] Deposit posted", { client_id: map.client_id, amount: feed.amount, memo: feed.memo });
  ```
- **Why it matters:** Ties a client identifier to a financial transaction (and a memo that may contain a name) in an uncontrolled location.
- **The specific fix:** Remove this log, or strip it from production builds.

### M4 — Over-fetching PHI columns to the browser (`select('*')` on PHI tables)
- **Plain English:** Several screens pull *every* column of PHI tables into the browser even when the view only displays a few fields. RLS still limits this to authorized users, but it puts more PHI than necessary into the browser's memory and cache, widening the blast radius if a device is compromised.
- **Where (examples):**
  - `src/routes/dashboard.clients.tsx:212` — loads `medicaid_id, date_of_birth, physical_address, phone_number, emergency_contact_name/phone, special_directions, pcsp_goals` for *all* clients into the list page.
  - `src/routes/dashboard.hhs-hub.$clientId.tsx:78` — `client_medications.select('*')`.
  - `src/routes/dashboard.admin.emar-audit.tsx:50` — `emar_logs.select('*').limit(2000)`.
  - `src/components/behavior-support/behavior-supports-report.tsx:112,115,119,121,125` — `bc_behaviors/bc_documents/bc_review_notes/bc_flags` all `select('*')`.
  - `src/lib/hhs.functions.ts:324-328` — `hhs_medical_logs`, `hhs_client_inventories` `select('*')`.
- **Why it matters:** HIPAA's "minimum necessary" principle: only move the PHI a screen actually needs.
- **The specific fix:** Replace `select('*')` with explicit column lists matching what each view renders.

### Other PHI surfaces (reviewed, generally clean)
- **PHI in URLs / query params:** **None found.** Client-scoped routes use opaque UUID path params (`$clientId`, etc.). No names/DOB/SSN/Medicaid IDs in URLs. Good.
- **PHI in error messages returned to the client:** **None found** that echo record fields. Errors return generic messages or the error string, not row data.
- **Logging:** Aside from M5, the ~26 `console.*` statements log IDs/roles/error objects, not client records.

---

## 4. Access control (server functions & API routes)

**Overall:** All 48 `createServerFn` handlers attach the `requireSupabaseAuth` middleware (which verifies the JWT), and most org-scoped operations call `requireOrgMembership(...)`. Seven files use the RLS-bypassing service-role client; six of them gate it correctly. The exception is the critical finding below.

### C2 — Cross-organization employee archive/delete (IDOR) in `lifecycle.functions.ts`
- **Plain English:** When archiving or deleting an *employee*, the code checks that the caller is a manager/admin of the organization they *name* — but it never checks that the **target employee actually belongs to that organization**. Because these operations use the all-powerful **service-role client** (which ignores RLS), a manager of Org A can supply the user ID of an employee in Org B and disable, or fully delete, that person's account.
- **Where:** `src/lib/lifecycle.functions.ts`
  - `archiveEntity` (lines ~41-80), employee branch — lines 57-61 update `profiles` by `.eq("id", data.id)` only (no org scoping):
    ```ts
    await supabaseAdmin.from("profiles")
      .update({ account_status: "archived", team_id: null, is_active: false })
      .eq("id", data.id);   // not scoped to the caller's org
    ```
  - `deleteEntity` (lines ~82-151), employee branch — confirms only `profiles.full_name` for `data.id`, then can delete membership, `course_assignments`, `external_certifications`, the `profiles` row, and the auth user.
  - The role check `assertManager(context.userId, data.organizationId)` only validates the caller's role in the named org — never that `data.id` is a member of it.
  - (The *client* branch of the same functions **is** correctly org-scoped — only the employee branch is vulnerable.)
- **Why it matters:** Cross-tenant account takeover / denial of service against staff who handle PHI. Disabling or deleting a competitor org's accounts is a direct breach of tenant isolation.
- **The specific fix:** Before any profile/auth mutation, verify the target is an active member of `data.organizationId` (e.g., `requireOrgMembershipAdmin` against the target, or a `organization_members` lookup), and scope the `profiles` update through that membership.

### LOW (defense-in-depth) — handlers that rely on RLS alone
These are consistent with the documented "RLS is the backstop" model and use the *user-scoped* client (not the service-role client), so they are **not** breaches on their own. They are flagged only because a single mistaken/missing RLS policy on the underlying table would silently turn them into cross-tenant leaks. Adding an explicit `requireOrgMembership(...)` would make them fail safe:
- `src/lib/team-access.functions.ts` `setMemberGrants` (lines ~75-130) updates a membership by `membership_id` without confirming it belongs to `organization_id`.
- Record/list handlers in `nectar-documents.functions.ts` (`getDocument` ~329, `getExtractedFields`, `queryDocuments`), `hhs.functions.ts` (`listDailyRecords` 56, `listAttendance` 194, `listEmarLogs` 304, `listIncidents` 339), `nectar-engine.functions.ts` (466, 525, 929), `other-assignments.functions.ts` (53, 404), `nectar-help.functions.ts` (`getHelpTicketStatus` 534).

### Reviewed and OK
- `login.functions.ts` — `signInWithUsername` is intentionally pre-auth, but hardened (server-side email resolution, uniform error to prevent user enumeration, archived-account session revocation).
- `employees.functions.ts`, `bulk-import.functions.ts` — check membership + admin/manager role before any service-role write, all writes scoped to the org.
- `hive-exec-admin.functions.ts`, `hive-tickets.functions.ts`, `nectar-approvals.functions.ts` — service-role use confined to internal helpers or platform-executive operations gated by `is_hive_executive`.
- Public API route `src/routes/api/public/hooks/nectar-schedules.ts` — authenticates with a **constant-time** secret comparison (`timingSafeEqual`) and **fails closed** if the secret env var is unset; returns only scheduling counts, no PHI. Just ensure `NECTAR_CRON_SECRET` is always set in production.

---

## 5. Supabase Storage

**Buckets found (from migrations):**

| Bucket | Public? | Holds | Status |
|---|---|---|---|
| `certificates` | private | certificate PDFs | Per-user + manager scoped ✅ |
| `training-assets` | **PUBLIC** | training material | Acceptable *if* no PHI — see M1 |
| `client_receipt_snapshots` | private | client receipts (PHI-adjacent) | Org-scoped by path ✅ |
| `client-documents` | private | care plans, intake PDFs (**PHI**) | Org-scoped (fixed in `20260603035136`) ✅ |
| `client-photos` | **PUBLIC** | client photos (**PHI**) | **C1 — see below** 🔴 |
| `audit-documents` | private | audit evidence | Org-scoped by path ✅ |
| `activity-receipts` | private | receipts | Org-scoped by path ✅ |
| `client-spending-receipts` | private | client spending receipts (**PHI**) | Org-scoped by path ✅ |
| `nectar-documents` | private | compliance docs (**PHI**) | Org-scoped (fixed in `20260603035531`) ✅ |

### C1 — `client-photos` bucket is PUBLIC (PHI exposed to the open internet)
- **Plain English:** The `client-photos` bucket was created with `public = true`. A public Supabase bucket serves files through an unauthenticated URL (`/storage/v1/object/public/client-photos/...`), and **that public URL ignores the row-level access rules entirely**. The team later wrote *correct* org-scoped access rules for this bucket (migration `20260603030652`) — but those rules only protect the authenticated and signed-URL paths. **As long as the bucket stays public, anyone with a file's URL can download a client's photo with no login.** I found **no migration that switches this bucket back to `public = false`**.
- **Where:**
  - Created public: `supabase/migrations/20260531204926_b9662dce-2a0a-4745-89a8-76f874b240d5.sql:5` → `VALUES ('client-photos', 'client-photos', true, 5242880)`
  - Access rules later fixed (but bucket flag untouched): `supabase/migrations/20260603030652_3f0ef970-17e0-4f38-8448-54033807b166.sql`
  - No `UPDATE storage.buckets SET public = false ...` exists anywhere in the migrations.
- **Why it matters:** Client photos are identifiable PHI. Publishing them on a public URL means access control depends only on the URL staying secret — which is not acceptable under HIPAA (URLs get cached, logged by CDNs, embedded in pages, and shared).
- **The specific fix:**
  1. Set the bucket private: in the dashboard, or `UPDATE storage.buckets SET public = false WHERE id = 'client-photos';`.
  2. Serve photos with short-lived **signed URLs** (`createSignedUrl`) instead of public URLs; the existing org-scoped RLS policies will then do their job.
  3. **Confirm the live setting** — because I could not query the live DB, verify in the dashboard whether this bucket is currently public. If it is, treat any photos already uploaded as potentially exposed.

### M1 — `training-assets` bucket is PUBLIC
- **Plain English:** This bucket is public and serves training material to all users, which is a reasonable use of a public bucket. The risk is only that **PHI must never be placed here** — anything uploaded becomes world-readable.
- **Where:** `supabase/migrations/20260521220211_e21813e4-3f6a-4ce3-8120-2a9e614d60f8.sql:50-56` (bucket public; read policy `USING (bucket_id = 'training-assets')` for everyone).
- **The specific fix:** Keep it for genuinely public, non-PHI assets only. Add a documented rule/process that no client-identifying content is ever uploaded here. If training content can ever be person-specific, make it private and signed.

**Note on the other private buckets:** they correctly derive the owning organization from the file path (`{organization_id}/...`) and check `is_org_member` / `is_org_admin_or_manager`. That is the right pattern. ✅

---

## 6. Configuration

### M2 — No HTTP security response headers
- **Plain English:** I found no Content-Security-Policy, Strict-Transport-Security (HSTS), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy set anywhere in the app. These headers defend against clickjacking, mixed-content downgrade, and cross-site script injection.
- **Where:** No matches anywhere in `src/` or config for these headers. (They *could* be set at the Cloudflare edge — verify in the Cloudflare dashboard; if so, this is resolved.)
- **Why it matters:** For a PHI app, missing HSTS and CSP materially raise the risk of session/data theft via downgrade or injected scripts.
- **The specific fix:** Add security headers in the Cloudflare Worker / Nitro response (or a Cloudflare Transform Rule): at minimum HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or CSP `frame-ancestors`), `Referrer-Policy: no-referrer`, and a CSP.

### M3 — Edge functions use wildcard CORS (`Access-Control-Allow-Origin: *`)
- **Plain English:** Both Supabase edge functions allow requests from any website. This is partly mitigated because both require a valid login token (`verify_jwt = true` in `supabase/config.toml`, plus an explicit auth-header check), so another website still couldn't act without a stolen token. Still, wildcard CORS on PHI-processing endpoints is broader than necessary.
- **Where:** `supabase/functions/parse-receipt-ocr/index.ts:14-17` and `supabase/functions/format-training-content/index.ts:3-6`.
- **The specific fix:** Restrict `Access-Control-Allow-Origin` to your application's own origin(s) instead of `*`.

### Reviewed, no issue found
- **Debug/verbose modes:** No `debug: true`, no source maps enabled, no `NODE_ENV` overrides found that would leak internals in production.
- **SSRF:** The receipt-OCR function explicitly removed an old SSRF hole and restricts itself to an allow-list of buckets (`parse-receipt-ocr/index.ts:21-26`). Good.
- **Supply-chain guard:** `bunfig.toml` enforces a 24h minimum release age on dependencies — a nice hardening measure.

---

## Suggested order of work

1. **CRITICAL:** Set `client-photos` private + signed URLs (C1); fix the employee-archive/delete org check (C2); confirm/obtain BAAs or disable PHI AI features (C3).
2. **HIGH:** Stop tracking `.env` and rotate keys (H1); close anonymous read on `certifications` (H2); fix/drop `staff_certifications` (H3).
3. **MEDIUM:** Add security headers (M2); narrow `select('*')` on PHI tables (M4); remove the financial console log (M5); tighten edge-function CORS (M3); confirm `training-assets` holds no PHI (M1).
4. **LOW / defense-in-depth:** Add explicit `requireOrgMembership` to the RLS-only handlers; review the `USING (true)` reference-table policies for intent.
5. **Verification you should run regardless of this report:** open the live Supabase project, run **Advisors → Security**, and confirm every bucket's public flag and the live RLS policies match what the migrations intend. I could not reach the live database, so the live state is unverified.

---

*Prepared as a read-only audit. No application code, schema, or configuration was modified. Findings about the database and storage are derived from migration files; verify against the live Supabase project before relying on them.*
