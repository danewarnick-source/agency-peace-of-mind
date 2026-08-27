# HIVE go-live readiness — Sep 1 2026 agency test

**App:** Hive (Agency Peace of Mind) — Utah DSPD/DHHS operations for IDD/homecare providers.
**First tenant:** True North Supports (TNS). Services TNS actually runs: **HHS, SLN, SLH, SEI, DSI**.
**Test date:** Tuesday, September 1, 2026.
**This audit:** Thursday, August 27, 2026. Read against repo `main` at merge of PR **#165**. No open PRs or GitHub issues at audit time.
**Method:** Live code, routes, server functions, migrations, and CI config. Older reports (`LAUNCH_READINESS_AUDIT.md` June 9, `FEATURE_INVENTORY.md`, `docs/platform-qa-map.md` June 18) were treated as hypotheses and **re-checked**. Several of them are stale.

**Verdict for a real agency test:** An Owner (admin) and a Staff member **can complete core operational work** if you use the working paths below, seed the right records, and do not expect live UEVV transmission, invite-link onboarding, or NECTAR/HIVE Training unless those flags and AWS Bedrock are turned on. The product is a working operations platform with specific traps — not a demo shell, and not a finished state-submission system.

This file is the punch list. Small code fixes landed in the same PR are listed under [Fixes in this PR](#fixes-in-this-pr).

---

## How to read severity

| Tag | Meaning for Sep 1 |
|-----|-------------------|
| **BLOCKER** | A tester following a labeled button/path will fail or be misled into thinking work happened that did not. Must know before Tuesday. |
| **HIGH** | Will break a core admin or staff workflow unless configured around. |
| **MEDIUM** | Visible stub or incomplete surface. Skip for Sep 1 unless that surface is in scope. |
| **LOW** | Polish, type dirt, or dead nav. Does not stop the test. |

**MUST-HAVE** = required so an admin and a staffer can do real TNS work (people, clients, 1056 authorizations, clock/notes, review, CSV export).
**NICE-TO-HAVE** = valuable, but the Sep 1 test can succeed without it.

---

## 1. What the product actually is (inventory)

### 1.1 Roles (live)

Source: `src/lib/rbac.ts`. Labels are what the UI shows.

| DB role | UI label | Lands on | Nav |
|---------|----------|----------|-----|
| `admin` | Owner | `/dashboard` → Admin Home (`AdminHomeDashboard`) | `ADMIN_NAV` |
| `program_manager` | Program Manager | `/dashboard` (admin-capable) | `ADMIN_NAV` |
| `manager` | Supervisor | `/dashboard` (admin-capable) | `ADMIN_NAV` |
| `employee` | Staff | `/dashboard` caseload (`TodayHero` + client grid) | `STAFF_NAV`; mobile bottom tabs |
| `committee_member` | Committee Member | hard-locked to `/dashboard/hrc` | HRC only |
| `super_admin` | leftover enum | **not assignable** | Platform access is `hive_executives`, not this role |

**Hive Executive** is a separate table (`hive_executives`), not an org role. Exec login sets portal view `hive_exec` and lands on `/dashboard/hive-exec`. Org admins run one company; executives run the platform.

**Behaviorist** is a profile flag (`profiles.bc_role`), not an org role. `/dashboard` redirects them to `/dashboard/behaviorist`.

Portal view (`localStorage` `portal-view`) can switch admin-capable users between Admin / Staff / Staff-mobile preview. First login with no stored view defaults **admin-capable users to Admin Home** (`src/routes/dashboard.tsx`). That June finding is **fixed**.

### 1.2 Live navigation

**Staff (desktop)** — `STAFF_NAV` in `src/routes/dashboard.tsx`:

- My Caseload → `/dashboard`
- Schedule → `/dashboard/schedule` (feature `evv_timesheets`)
- Daily Logs → `/dashboard/daily-logs`
- My Compliance → `/dashboard/my-obligations`
- Historical Records → `/dashboard/my-historical-records`
- My Time Corrections → `/dashboard/my-time-corrections`
- Ask NECTAR → `/dashboard/ask-nectar` (feature `nectar` — **default OFF**)
- My Trainings → `/dashboard/courses` (feature `staff_onboarding`)
- HIVE Training → `/dashboard/hive-training` (feature + addon **default OFF**)

**Staff (phone)** — `src/components/staff-mobile/staff-bottom-tabs.tsx`: Caseload, Schedule, Daily Logs, Ask NECTAR, Obligations, Trainings. Clock-in/out is the punch pad on the client workspace. General (non-client) time clock lives **under Schedule**, not its own tab.

**Admin** — `ADMIN_NAV`:

- Home → `/dashboard`
- Employees → `/dashboard/hub/employees`
- Clients → `/dashboard/hub/clients`
- Scheduler → `/dashboard/scheduler`
- Documentation → `/dashboard/hub/documentation`
- Compliance → `/dashboard/company-obligations`
- Summaries → `/dashboard/summaries`
- Finances → `/dashboard/hub/finances` (`view_billing` + feature `pba_ledgers`)
- HIVE Training / Training Catalog (gated)
- State Audit (gated `state_audit` + `view_analytics`)
- Reports → `/dashboard/reports`
- Inbox → `/dashboard/inbox`
- Settings → `/dashboard/settings`

Deadlines (`/dashboard/deadlines`) **redirects** to Compliance → Action Required. That consolidation is real (`src/routes/dashboard.deadlines.tsx`).

`/dashboard/compliance-desk` (EVV approve + Utah CSV) is **not in the sidebar**. Reach it from Admin Home EVV tile, Documentation → Records (`UtahExportDialog`), or by typing the URL.

### 1.3 Core workflows that are actually wired

| Workflow | Route | Write path | Real? |
|----------|-------|------------|-------|
| Login (email **or** username) | `/login` | `signInWithUsername` → `auth.signInWithPassword` | Yes |
| Add staff (working path) | Employees hub → **Add manually** | `createEmployeeManually` → Auth admin `createUser` + profile + membership | Yes. Forces `must_change_password`. |
| Invite by email | Employees / Invitations / Team Access | Inserts `invitations`; Employees/Invitations also call Resend | Email may send. **Accept is not wired** — see B-1. |
| Add client | Clients hub → Add New Client | `clients.insert` | Yes |
| Smart Import | `/dashboard/smart-import` from Clients | `smart-import.functions.ts` + commit | Yes when Bedrock is configured |
| 1056 authorizations | Client billing / Billing → Imports | `client_billing_codes` upsert | Yes. No 1056 → staff should not clock that code. |
| Caseload assign | Employees roster → caseload dialog | `staff_assignments` | Yes. Empty caseload = empty staff Home. |
| Scheduler | `/dashboard/scheduler` | `scheduler.functions.ts` | Yes. Sole-worker assign requires `profiles.has_passed_launchpad`. |
| Staff schedule | `/dashboard/schedule` | `respondToShift` | Yes (accept/decline exists now). |
| EVV / payroll punch | Client card → workspace `/dashboard/workspace/$clientId` | `evv_timesheets.insert` in `punch-pad.tsx` | Yes. GPS fail-closed. Only staff clock. No voice / Compass path. |
| HHS daily note / attendance | `/dashboard/hhs-hub/$clientId` | `hhs.functions.ts` → `daily_logs` / `hhs_monthly_attendance` | Yes. Hosts do not clock. |
| Daily logs (staff + admin review) | `/dashboard/daily-logs` | `daily_logs` insert/approve | Yes |
| General time (training/admin/travel) | Schedule screen | `general_shifts` table | Yes (June localStorage finding is **fixed**) |
| Compliance register + Action Required | `/dashboard/company-obligations` | `company-obligations.functions.ts` | Yes |
| Staff “My Compliance” | `/dashboard/my-obligations` | `recordCompletion` | Yes |
| Admin Home audit ring | `/dashboard` | Reads only | Yes (daily-log query was broken; fixed in this PR) |
| Progress summaries + packet PDF | `/dashboard/summaries` | `progress-summaries.functions.ts` + client-side `renderSummaryPdf` | Yes |
| Utah EVV **CSV** export | Documentation → Records, or `/dashboard/compliance-desk` | `utah-export-dialog.tsx` / `utah-evv-export.ts` | Yes. Needs DHHS Provider ID in Settings. **Not a live UEVV API.** |
| Form 520 | `/dashboard/billing/form520` | Writes `billing_submissions` drafts | **Submit button disabled** — see H-3. |
| HIVE Training | `/dashboard/hive-training` | Catalog + Stripe checkout | Gated off by default; Stripe 501 if secrets missing |
| MFA | `/mfa-setup` | Redirects to `/dashboard` | **Intentionally off** until PHI launch |

### 1.4 Feature flags a tester will hit

Seed defaults (`supabase/migrations/20260703173539_*.sql`):

| Key | Default | If OFF |
|-----|---------|--------|
| `evv_timesheets` | **on** | Scheduler, staff Schedule, historical records, time corrections lock |
| `client_intake` | **on** | Clients hub locks |
| `pcsp` | **on** | Documentation hub locks |
| `staff_onboarding` | **on** | Employees hub + My Trainings lock |
| `pba_ledgers` | **on** | Finances hub locks |
| `nectar` | **off** | Ask NECTAR, Knowledge base lock. Bedrock still required for AI. |
| `hive_training` | **off** | HIVE Training nav hidden/locked (also needs subscription addon) |
| `state_audit` | **off** | State Audit + Documentation Audit tab lock |

Hive Exec Master Controller (`organization_features`) can override per org. Confirm TNS overrides in the live DB before Tuesday — this repo cannot see them.

### 1.5 Env / config needed to run

**Browser boot (already in committed `.env`):**

- `VITE_SUPABASE_URL` / `SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`

Project in repo: `mmknqtdrefbzwfdtykza` (`https://mmknqtdrefbzwfdtykza.supabase.co`).

**Server (Lovable/AWS secrets — not in git):**

| Var | Needed for |
|-----|------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Login username lookup, create-employee, many server fns |
| `AWS_REGION`, Bedrock model id, and AWS credentials **or** ECS task role | NECTAR, Smart Import extract, daily-log coach |
| `RESEND_API_KEY` on `send-email` edge fn | Invite / notification email |
| `STRIPE_SECRET_KEY` / training webhook secret | HIVE Training checkout |
| `NECTAR_CRON_SECRET` / `CRON_SHARED_SECRET` | Scheduled NECTAR jobs |
| `PUBLIC_APP_URL` / `SITE_URL` | Invite links, emails |
| Playwright: `STAGING_URL`, `TEST_EMAIL`, `TEST_PASSWORD` | Route crawler CI |

**Not in this repo:** `HIVE_DEMO_ADMIN_EMAIL` / `HIVE_DEMO_ADMIN_PASSWORD`. Prior agent PRs used those names; **grep of this tree is empty**. E2E uses `TEST_EMAIL` / `TEST_PASSWORD` GitHub secrets. Whoever runs the Sep 1 test must get credentials from the human who owns staging — they are not in source.

**MFA:** disabled on purpose (`src/routes/__root.tsx`, `src/routes/mfa-setup.tsx`). Do not re-enable for this test.

**`must_change_password`:** enforced at **router root** (`__root.tsx`), not only inside the dashboard. June finding **fixed**. New manual staff **will** hit `/reset-password` on first login. That is correct.

### 1.6 Hypotheses this audit discarded

| Hypothesis | Reality in this repo |
|------------|----------------------|
| Staff “Complete form” dead-ends without `clientId` | **Fixed.** Client picker on `dashboard.forms.index.tsx`. |
| Billing reads orphaned `hhs_daily_records` | **Fixed.** App reads `hhs_daily_records_v`. Do not drop the old table. |
| Reports unreachable / four CSVs identical | **Fixed.** In `ADMIN_NAV`; five distinct exporters in `dashboard.reports.tsx`. |
| HIVE Subscription tab 404 | **Fixed.** Redirects to `/dashboard/settings/subscription`. |
| General time clock is localStorage-only | **Fixed.** `general_shifts`. |
| Admin first login = empty staff caseload | **Fixed.** Admin-capable default to admin Home. |
| `/fix-admin` public privilege button | **Gone.** No route file. |
| Open PRs / issues | **None** as of this audit. Last merge: PR #165. |
| Demo admin env vars in code | **Absent.** Use live/staging credentials from the operator. |
| Live UEVV API | **Does not exist.** CSV export only. |
| `accept_invitation` used by signup | **RPC exists in SQL; frontend never calls it.** |

June `LAUNCH_READINESS_AUDIT.md` is historical. Do not treat it as current.

---

## 2. MUST-HAVE punch list (Sep 1 test)

### BLOCKER

#### B-1. Staff invite accept is unwired — use Add manually
- **Where:** Invite emails and copied links go to `/signup?invite={token}` (`src/lib/invitations.functions.ts`, `dashboard.employees.index.tsx`, `dashboard.invitations.tsx`). `/signup` is **new-agency signup** (payment, team size). It never reads `?invite=` and never calls RPC `accept_invitation` (defined in migrations, typed in `types.ts`, **zero call sites in `src/`**).
- **Team Access** (`/dashboard/settings/team-access`) was worse: it inserted a row and toasted “Invitation sent” with **no email**. Toast/copy corrected in this PR; the row still does not onboard anyone.
- **Why it matters:** A tester who “invites a staff member” will either get nothing, or land on a **new company** signup and think they joined TNS.
- **Do this instead:** Employees → **Add manually** → share temp password → staff hits forced password change on first login.
- **Do not build a half join page for Tuesday.** A real accept flow is a feature (lookup token, create/join user, call RPC, skip billing). Track it after the test.

#### B-2. Clock-in is not UEVV transmission
- **Where:** Punch pad success copy previously said “EVV transmitted” (`punch-pad.tsx`). There is **no** Sandata/Tellus/UEVV HTTP client in the repo. State path is **Export Utah DHHS EVV CSV** (`src/components/evv/utah-export-dialog.tsx`), from Documentation → Records or `/dashboard/compliance-desk`.
- **Why it matters:** Staff/admins will believe the state already has the visit. For SLH/SLN (EVV-mandated) the Sep 1 proof is: punch → (optional approve) → CSV download. Copy is corrected in this PR; the architecture is unchanged.
- **Settings:** DHHS Provider ID + EVV Vendor name (`/dashboard/settings`) must be filled or the export dialog blocks.

#### B-3. Empty org looks like a broken app
- Staff Home is empty until `staff_assignments` exist.
- Punch pad lists codes from `client_billing_codes` (the 1056). No active auth → nothing useful to clock.
- Punch pad **refuses clock-in** without a Utah Medicaid Member ID (`punch-pad.tsx`).
- Scheduler **refuses sole-worker assign** unless `profiles.has_passed_launchpad` (`shifts.functions.ts`).
- HHS path is `/dashboard/hhs-hub/$clientId` (daily note + attendance), **not** the punch pad. Hosts never clock.
- **Pre-seed (or create on Day 1):** at least one SLH or SLN client with medicaid ID + active 1056, one HHS client, one SEI and/or DSI client, staff assigned to those clients, DHHS Provider ID, org not billing-locked.

#### B-4. Policy “gate app access” can trap the whole staff cohort
- **Where:** `__root.tsx` `beforeLoad` — unsigned `nectar_documents` with `requires_acknowledgment` + `gate_app_access` redirect to `/sign-policy/$documentId` on **every navigation**.
- **Why it matters:** If an admin turns that on for `all_staff` before testers have signed, **nobody can reach caseload or clock**. For Sep 1: do not enable gate-app-access, or pre-sign the policy as each test user.

#### B-5. Billing lockout
- **Where:** `dashboard.tsx` `beforeLoad` — `org_subscriptions.locked_at` sends everyone except admin billing/subscription pages to `/billing-locked`.
- **Confirm** the TNS (or demo) org subscription is **not** locked.

### HIGH

#### H-1. Admin Home queried a column that does not exist
- **Where:** `src/components/admin-home/admin-home-dashboard.tsx` selected `daily_logs.updated_at`. Generated types (`types.ts`) have `created_at` / `submitted_at` only. PostgREST fails that query → shift-docs tile and activity feed miss daily logs (page still renders; ring is wrong).
- **Fix in this PR:** select/sort `submitted_at`.
- **Still true:** `utah-dspd-pack/coverage.ts` has many rows missing required `note` (tsc dirt, not runtime). `dashboard.permissions.tsx` was missing a `Role` import (fixed here). CI runs `npx tsc --noEmit || true` (`.github/workflows/typecheck-lint.yml`) so type errors never fail the build.

#### H-2. Punch pad GPS is fail-closed
- **Where:** `src/components/evv/punch-pad.tsx`. Clock-in requires a GPS fix. Staff without location cannot write a timesheet. There is no Compass / voice clock-in path.
- **For Sep 1:** Use **punch pad / workspace** for SLH/SLN.

#### H-3. Form 520 final submit is disabled
- **Where:** `ATTESTATION_COPY_APPROVED = false` in `dashboard.billing.form520.tsx`. Button stays disabled until counsel-approved copy lands.
- **Sep 1:** Review the 520 **draft/export**. Do not plan a live attestation.

#### H-4. NECTAR / Smart Import AI need Bedrock in the deploy env
- `src/lib/ai-bedrock.server.ts` `assertBedrockConfigured()`. Clock, logs, scheduler, compliance register work **without** AI. Extraction, Ask NECTAR, summary drafting fail loudly if Bedrock is missing.
- `nectar` org feature defaults **OFF**. Even with Bedrock, Ask NECTAR nav is locked until Hive Exec enables it.

#### H-5. Live DB vs `supabase/migrations/`
- Per `CLAUDE.md`: migrations **may not match** Lovable Cloud. Confirm with `docs/SQL_HANDOFF.md` queries, not by assuming files were applied.
- Must exist for this test: `hhs_daily_records_v`, `general_shifts`, `company_obligations` (+ instances), `client_billing_codes`, `evv_timesheets`, permission matrix for TNS, `feature_registry` / `organization_features`.

#### H-6. Staff mobile is crowded, not broken
- Six bottom tabs on a phone. Ask NECTAR often shows a **lock** (feature off). Usable; easy to miss Historical Records / Time Corrections (desktop staff nav only).
- Punch-pad dictation needs microphone permission (`vercel.json` Permissions-Policy allows `microphone=(self)` and `geolocation=(self)`).

### MEDIUM (skip or disclose)

| ID | Surface | Notes |
|----|---------|-------|
| M-1 | `/dashboard/hrc` | Real restriction/meeting/review writes exist; **ScaffoldNotice** still on several cards. Not required for TNS HHS/SLH/SLN/SEI/DSI day-to-day. |
| M-2 | Settings → Bank mapping | Connect + SSI sync “coming soon”. Do not demo PBA auto-reconcile. |
| M-3 | `/dashboard/shift/$shiftId` callouts | SMS/voice **simulated**. |
| M-4 | Records custom PDF | “Coming soon”; CSV + Utah EVV CSV work. |
| M-5 | `/dashboard/audit` packet | Checklist + items, not a bundled PDF. Summaries **do** generate a packet PDF. |
| M-6 | `/dashboard/state-audit` | Auditor preview uses synthetic seed data. Feature default OFF. |
| M-7 | Financial Profitability / Cash Flow | Disabled “Soon”. |
| M-8 | Form 520 remaining-units math | Still period-local (old D-2); do not treat remaining as YTD. |
| M-9 | Employees profile “Client assignments — coming soon” | Caseload is assigned from the **roster dialog**, not that tab. |

---

## 3. NICE-TO-HAVE (after Sep 1)

- Wire `/signup?invite=` (or a `/join` route) to `accept_invitation`.
- Live UEVV vendor API (today: CSV).
- Enable `nectar` + `hive_training` for TNS if those are in the Tuesday script; confirm Bedrock + Stripe.
- Stop swallowing `tsc` in CI.
- Fill missing `note` fields in `src/lib/utah-dspd-pack/coverage.ts` (~40 rows) so `PackCoverageRow` typechecks.
- HRC polish (remove scaffold badges).
- Real Plaid/QBO; real callout SMS.
- Form 520 counsel copy → flip `ATTESTATION_COPY_APPROVED`.
- Put Compliance Desk in admin nav (or keep documenting Documentation → Records as the EVV export path).

---

## 4. Day-by-day through Tuesday Sep 1

Today is **Thursday Aug 27**. Test is **Tuesday Sep 1**.

### Thursday 27 — Preflight (human + Hive Exec)

1. Confirm **which URL** is the test environment (Lovable preview vs AWS CloudFront vs production). This repo does not pin a public hostname.
2. Confirm **admin and staff logins**. They are not in git. Do not hunt for `HIVE_DEMO_ADMIN_*`.
3. In Supabase/Lovable: org not `locked_at`; `is_demo` badge expected or not; `nectar` / `hive_training` / `state_audit` on or off for TNS.
4. Settings → DHHS Provider ID + EVV vendor name.
5. Confirm Bedrock on the deploy that will be tested **if** Smart Import / Ask NECTAR are in scope. If not configured, **cut those from the Tuesday script** rather than debugging live.
6. Confirm `RESEND_API_KEY` only if you insist on invite email; **still use Add manually**.
7. Do **not** turn on policy `gate_app_access` for all staff.

### Friday 28 — Admin data path (MUST)

Run [Admin test script](#5-test-script--admin-path) through step 8 (people, clients, 1056, homes, caseload, one published week). Fix data gaps the same day. Do not spend Friday on HRC, PBA bank, or State Audit.

### Saturday 29 — Staff path (MUST)

Second browser/phone. Run [Staff test script](#6-test-script--staff-path). Prove:

- Password change works.
- SLH or SLN punch in/out with GPS (or documented variance).
- HHS daily note + overnight/attendance if that client is Present.
- SEI or DSI timed shift (no geofence wall).
- Daily log submit.
- My Compliance shows at least one obligation (or an honest empty state).

### Sunday 30 — Admin review + export (MUST)

- Documentation → Records: see the punches; run Utah EVV CSV (even if you do not upload to a vendor).
- Daily Logs admin approve one note.
- Summaries: open a period, save a draft, download packet PDF (Nectar draft is optional).
- Compliance → Action Required: open one item; complete or dismiss with a real reason.
- Billing Overview: confirm HHS/daily rows via `hhs_daily_records_v` (not $0 because of the old table). Skip 520 **submit**.

### Monday 31 — Optional AI + freeze

- If Bedrock + `nectar` are on: Smart Import one PCSP. Clock EVV codes on the punch pad only.
- Hive Training only if feature + addon + Stripe are on; otherwise skip.
- Bug-bash anything that blocked Fri–Sun. Freeze new features Monday night.

### Tuesday Sep 1 — Owner test

Owner runs the two scripts below, not a product tour. Timebox: admin ~45 min, staff ~30 min. If something is out of scope (UEVV API, invite links, 520 attest, NECTAR), say so up front.

---

## 5. Test script — admin path

Use an **Owner** (`admin`) account. Desktop.

1. **Login** at `/login` with email or username. MFA must not appear. You should land on **Home** (audit ring, tiles), not an empty caseload.
2. **Portal view** (sidebar): confirm Admin. Optionally preview Staff / mobile frame; switch back.
3. **Settings** → Organization: DHHS Provider ID, EVV vendor name, legal name. Save.
4. **Employees** (`/dashboard/hub/employees`):
   - **Add manually** a Staff user (role Staff). Copy the temp password. Do **not** rely on Invite by email for Tuesday.
   - Open caseload on that staff → assign the test clients + service codes (SLH/SLN, HHS, SEI/DSI as applicable).
5. **Clients** (`/dashboard/hub/clients`):
   - Add or open a client. Set **Utah Medicaid Member ID**.
   - Billing codes: active 1056 rows for the codes you will clock (worksheet rates for HHS/DSI/SEI; table rates for SLH/SLN).
   - Teams & homes: at least one home (`teams`) if you will demo RHS-style coverage later; TNS HHS still needs the host-home hub.
6. **Smart Import** (optional): Clients → Smart Import. Needs Bedrock. If extract fails, use Add New Client instead.
7. **Scheduler** (`/dashboard/scheduler`): publish one SLH/SLN shift for the test staff. If you get Launchpad errors, either set `has_passed_launchpad` on that profile (SQL handoff) **or** skip publish and let staff clock from caseload (punch pad does not require a published shift).
8. **Home**: ring and “needs you” should move after data exists. If shift-docs stay empty after staff submit logs, that was H-1 (fixed in this PR — hard-refresh).
9. After staff have punched (script 6):
   - **Documentation → Records**: find the timesheet; **Export Utah DHHS EVV CSV**.
   - **Daily Logs**: approve one.
   - **Summaries**: open a client period → Save draft → Download packet PDF. For SEI, UPI attest is admin-only (staff must not see UPI).
   - **Compliance**: Action Required tab; Utah pack tab is read-mostly.
   - **Finances** hub → Billing overview (not 520 submit).
10. **Do not** enable HRC as a success criterion. **Do not** click Team Access “Send invite” expecting a working staff account.

---

## 6. Test script — staff path

Use the **Staff** account from step 4. Phone if possible; desktop Staff view is OK.

1. **Login** with the temp password → **forced reset** at `/reset-password` → back to `/dashboard`.
2. If redirected to **sign a policy**, sign it (B-4). If that was unexpected, admin should turn off gate-app-access.
3. **My Caseload** should list assigned clients. Empty = missing `staff_assignments` (admin).
4. **SLH or SLN (EVV):**
   - Open the client → Clock In (workspace punch pad).
   - Allow location. If outside geofence, enter a variance reason (still a real timesheet).
   - Confirm success copy says the timesheet is **saved in HIVE**, not transmitted to the state.
   - Clock out with required paperwork.
5. **HHS:** open Client Hub (`/dashboard/hhs-hub/$clientId`) from the client card or schedule. Write the **daily note**. Set attendance **Present** if you want a billable day (`hhs_daily_records_v.billable` needs Present **and** a note). Hosts do not appear on the punch pad.
6. **SEI or DSI:** clock a timed shift. No geofence wall. DSI: do not exceed 6 hours in the test day if you will look at conflict warnings.
7. **Daily Logs:** submit a log for a client (or HHS note if that is the HHS path you used).
8. **Schedule:** see the published shift if admin published one; Accept/Decline if the card offers it.
9. **My Compliance:** open one obligation if any instances exist; otherwise screenshot the empty state (seed gap, not a crash).

---

## 7. Fixes in this PR (small, obvious only)

| Change | Why |
|--------|-----|
| Admin Home `daily_logs` select uses `submitted_at` not `updated_at` | Runtime PostgREST error; readiness ring missed logs |
| Import `Role` in `dashboard.permissions.tsx` | tsc `Cannot find name 'Role'` on change-history |
| Punch-pad clock-in copy no longer says “EVV transmitted” | False claim; state path is admin CSV |
| Team Access invite toast + helper text tell the truth | Was “Invitation sent” with no email |
| Employees pending-invite copy warns that `/signup?invite=` is new-agency signup | Stops testers from using a dead join link |

**Not built (on purpose):** invite-accept UI, live UEVV, Form 520 legal copy, coverage.ts notes, CI tsc gate, HRC un-scaffold. Compass (Cedar voice) was removed — punch pad is the only staff clock.

---

## 8. Build / tests

- App build: `npm run build` (required before push; regenerates `src/routeTree.gen.ts`).
- Typecheck: `npx tsc --noEmit` reports pre-existing errors; CI **ignores** them (`|| true`). This PR fixes two of the named dirty files (`admin-home-dashboard.tsx` column, `dashboard.permissions.tsx` import). `utah-dspd-pack/coverage.ts` remaining missing-`note` rows are **not** a Sep 1 product blocker.
- Playwright (`e2e/smoke.spec.ts`): unauthenticated **route crawl** (no 404 / blank / spinner). It does **not** prove clock-in, invites, or CSV export. Needs `STAGING_URL` + `TEST_EMAIL` + `TEST_PASSWORD` secrets; crawler **skips** if unset.
- This environment has **no demo login**, so the click-through scripts were not executed against staging here.

---

## 9. Tuesday one-pager (say this out loud)

HIVE can run TNS operations for the test: **people, clients, 1056s, SLH/SLN punches, HHS notes, SEI/DSI time, review, summary PDF, Utah EVV CSV.**

It cannot: **email a staffer into the org**, **push visits to the state aggregator**, **submit a 520**, or **guarantee NECTAR** unless Bedrock and the `nectar` flag are on.

Add staff with **Add manually**. Clock EVV codes on the **punch pad**. Export EVV from **Documentation → Records**. Leave MFA off. Do not turn on policy gate-app-access mid-test.
