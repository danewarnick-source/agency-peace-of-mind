# Launch-Readiness Audit

**App:** Agency Peace of Mind (HIVE) — disability-services platform (TanStack Start + Supabase).
**Type:** READ-ONLY audit. No application code, routes, queries, RLS, or data were changed. The only new files are this report and its companion `ROUTE_MAP.md`.
**Date:** 2026-06-09. **Reviewer:** automated code audit (6 area passes + structural cross-checks).

---

## ⚠️ How to read this report

- **Plain English.** Every finding names the file *and* the human screen/button, says what's wrong, why it matters, the severity, and a one-line suggested fix. **Fixes are NOT implemented** — they'll be done one scoped change at a time.
- **The database was NOT trusted for conclusions.** Everything here is judged from the repository code (including the SQL migration files, which are part of the repo). Anything that genuinely needs a running app with real data is listed under **"Needs live-data confirmation"** instead of being marked pass/fail.
- **Three product roles only**, as you specified: **Company Admin** (`admin`), **Behaviorist** (`bc_role` flag → lands on `/dashboard/behaviorist`), **Staff/DSP** (`employee`). The code also contains internal `manager`, `super_admin`, `committee_member` (HRC), and a separate **HIVE Executive** platform-operator context — noted where relevant.
- **Good news up front:** all three roles can log in; the core writes (create client/employee, daily logs, eMAR, notes, schedule publish, Smart Import commit) persist for real; and EVV clock-in/clock-out write real records. The problems are concentrated in a few specific places below.

---

## 🚨 Fix these first

1. **Staff cannot complete a form from the Forms page (broken page for the Staff role).** The "Complete form" buttons on the staff Forms list jump to the fill screen without the required client ID, which fails the screen's validation and dead-ends. *(Blocker — B-1; workaround exists via the client workspace.)*
2. **All daily-rate / Host-Home billing reads an empty table — Medicaid billing & pay show $0 for daily services.** Daily records are now saved to `daily_logs`/`hhs_monthly_attendance`, but Billing, the Form 520 Medicaid export, Financial Revenue, and the staff pay-period card all still read the old `hhs_daily_records` table, which nothing writes anymore. *(High — D-1; behaves like a Blocker for any agency that bills daily/Host-Home codes. Confirm with live data, item L-2.)*
3. **The whole Reports page is unreachable from the app** — no menu item or link points to `/dashboard/reports`; you can only get there by typing the URL. And the four report "Download CSV" buttons all export the *same* dataset with the wrong labels. *(High — R-1 / R-2.)*
4. **The "HIVE Subscription" billing tab 404s** — it's a visible tab that points to a route that doesn't exist. *(High — F-1.)*
5. **General (non-client) time — Training/Admin/Travel/Meeting hours — is saved only in the browser, never to the server**, so payroll/reports can't see it and it's lost on device change. *(High — S-2.)*
6. **Admins land on an empty Staff "caseload" screen on first login** instead of the admin Home, because the portal view defaults to "Staff." *(High — H-1.)*
7. **`/fix-admin` is a publicly reachable page with a "Restore My Admin Access" button** and no role guard. *(Medium, but confirm the server-side RPC is locked down — item L-7.)*

---

# Findings by severity

> Within each severity, findings are grouped by area: **Auth/Roles, Home, Scheduling, Documentation/EVV, Reports, Finances/Billing, Clients, Employees, Smart Import, Settings, Training, Compliance.**

## 🟥 Blocker

### Documentation / Forms — B-1: Staff "Complete form" dead-ends (missing client ID)
- **Where:** `src/routes/dashboard.forms.index.tsx:165` and `:185` (the staff Forms list — "Needs attention" and "Start anytime" sections). The fill screen requires a client: `src/routes/dashboard.forms.$formId.fill.tsx:14` (`validateSearch: z.object({ clientId: z.string().uuid() })`).
- **What:** Those buttons link to `/dashboard/forms/$formId/fill` with no `clientId`, so the destination's required-parameter check fails and the user hits an error/dead end. The *working* path is the client workspace's Forms tab (`src/components/workspace/forms-hub-tab.tsx:69`), which passes the client correctly.
- **Why it matters:** A Staff/DSP clicking "Complete form" on the obvious Forms screen lands on a broken page. (Impact softened by the workspace workaround.)
- **Fix:** Route the staff Forms-list buttons through a client picker (or to the client workspace) so a `clientId` is supplied before reaching `/fill`.

## 🟧 High

### Documentation/EVV — D-1: Daily-rate / Host-Home chain reads an orphaned table
- **Where:** writes go to `src/lib/hhs.functions.ts:32-33` (`saveDailyRecord` → `daily_logs`) and `:177` (`setAttendance` → `hhs_monthly_attendance`). Readers still use `hhs_daily_records`: `src/hooks/use-nectar-pay-period.tsx:141`, `src/routes/dashboard.billing.index.tsx:52`, `src/routes/dashboard.billing.form520.tsx:116`, `src/lib/financial-revenue.functions.ts:104`, `src/lib/nectar-reports.functions.ts:426`. Confirmed in migrations: `hhs_daily_records` is a real table (`20260526074052…sql:7`) with **no** backfill trigger, and there's a literal `// FIX: writes to daily_logs instead of hhs_daily_records` comment at `hhs.functions.ts:10`.
- **What:** `hhs_daily_records` is read by 8+ consumers but written by none. The write path was migrated; the readers were never repointed.
- **Why it matters:** Daily-rate staff see 0 days / $0 on the pay-period card; admin Billing, the **Form 520 Medicaid export**, and Financial Revenue show no daily-service rows. For a Host-Home/daily-billing agency this silently drops their entire daily revenue and billing.
- **Fix:** Repoint the daily readers at `hhs_monthly_attendance` + `daily_logs`, or add a database view named `hhs_daily_records` that unions them.

### Documentation/EVV — S-2: General (non-client) Time Clock never saves to the server
- **Where:** `src/hooks/use-general-shift.tsx:76-100` (start/stop write `localStorage` only); read for pay at `src/hooks/use-nectar-pay-period.tsx:182-205`. Confirmed: **no `general_shifts` table exists** in any migration.
- **What:** Training/Admin/Travel/Meeting time has no server table; the "Clock In" button on the General Time Clock persists nothing server-side.
- **Why it matters:** Non-client hours are per-device only — admin payroll and reports can't see them, and the time is lost on a different device or after clearing browser storage.
- **Fix:** Persist general shifts to a server table (e.g., `evv_timesheets` with a non-client entry type, or a new `general_shifts`) on start/stop.

### Reports — R-1: The Reports page is unreachable from the UI
- **Where:** `src/routes/dashboard.reports.tsx` exists, but no nav item or `Link`/`navigate` anywhere targets `/dashboard/reports` (verified by full-repo scan; it's not in `ADMIN_NAV` in `dashboard.tsx:44-52`).
- **What:** Users can only reach Reports by typing the URL.
- **Why it matters:** A primary admin surface is effectively hidden — and it's the page with the export bug below.
- **Fix:** Add a "Reports" link to the admin navigation (or fold it into the Finances/Documentation hubs).

### Reports — R-2: All four "Standard Reports" exports return the same data, mislabeled
- **Where:** `src/routes/dashboard.reports.tsx:59-104`. The "Download CSV" buttons for Compliance Summary, Training Completion, Overdue Training, and Certification Renewals all export the raw `course_assignments` dataset; the report name only changes the filename.
- **What:** "Overdue Training" isn't filtered to overdue; "Certification Renewals" returns training rows, not certifications.
- **Why it matters:** An auditor downloading "Certification Renewals" gets unrelated data — wrong output on a compliance-facing path.
- **Fix:** Branch the export on the report key to query/filter the correct rows per report.

### Finances/Billing — F-1: "HIVE Subscription" tab points to a missing route (404)
- **Where:** `src/routes/dashboard.billing.tsx:20` defines a real, rendered tab `{ to: "/dashboard/billing/subscription", label: "HIVE Subscription" }`, but there is no `dashboard.billing.subscription.tsx` route file. (Also referenced by the unused `company-overview/billing-plan-card.tsx:47`.)
- **What:** Clicking the tab dead-ends on a 404.
- **Why it matters:** A primary billing nav control is broken.
- **Fix:** Add the subscription route, or remove the tab until it exists.

### Auth/Roles — A-1: Behaviorist sees a flash of the wrong (Staff) screen on every login
- **Where:** `src/routes/dashboard.tsx:107-125`. The redirect to `/dashboard/behaviorist` runs only after an async `profiles` fetch resolves and only when `pathname === "/dashboard"`.
- **What:** On login the Behaviorist first renders the Staff "My Caseload" home (time clock, staff caseload), then bounces to their page once the profile query returns.
- **Why it matters:** Every Behaviorist login flashes content meant to be hidden from them; the landing is eventually correct but visibly wrong first.
- **Fix:** Hold the `/dashboard` home behind the `bc_role` query resolving (show the loading spinner until role is known).

### Home — H-1: Company Admin lands on the empty Staff caseload on first login
- **Where:** `src/hooks/use-portal-view.ts:14-16` defaults Portal View to `"staff"`; `src/routes/dashboard.index.tsx:132` renders the admin Company Overview only when `view === "admin"`.
- **What:** A Company Admin who has never toggled "Admin View" lands on `/dashboard` and sees the Staff caseload (which shows "No clients assigned yet" for them). The real admin Home is hidden behind a sidebar dropdown.
- **Why it matters:** Wrong, empty first impression for the primary paying role.
- **Fix:** Default Portal View to `"admin"` when the user `isAdminCapable`.

### Compliance — C-1: Human Rights Committee (HRC) page is an explicit scaffold
- **Where:** `src/routes/dashboard.hrc.tsx` — labeled "Scaffold — workflow to be built" (`:22`), "No data wiring yet — placeholder" (`:77`). "Add placeholder meeting" writes `attendees: "(placeholder)"` (`:188`); "Add placeholder review" writes `restriction_summary: "(placeholder restriction)"` (`:250`). Only the admin "Grant/revoke Committee Member" control does a real write.
- **What:** The flagged-client list is a hardcoded empty placeholder; the meeting/review buttons insert literal placeholder rows.
- **Why it matters:** This is the *only* page a `committee_member` can see, and it's non-functional. If HRC is a launch feature, it isn't built.
- **Fix:** Hide HRC behind a "Coming soon"/feature flag, or build the real workflow before launch.

## 🟨 Medium

### Auth/Roles — A-2: Forced password change is only enforced inside the dashboard
- **Where:** `src/routes/dashboard.tsx:114-117` redirects to `/reset-password` when `must_change_password` is set, but only from the dashboard layout; `/reset-password` itself has no guard.
- **Why it matters:** A user under forced reset who navigates to a non-dashboard route isn't trapped. (Those routes hold no sensitive org data for them, so impact is limited.)
- **Fix:** Enforce `must_change_password` at the auth/root level so it applies on every authenticated route.

### Home — H-2: "Incident reports pending review" lands on a screen with no incidents
- **Where:** `src/components/company-overview.tsx:316` links to `/dashboard/records-desk`, which redirects to the Documentation hub **Review** tab (`dashboard.records-desk.tsx:37-44`). Incidents are actually actioned in **Command Center → Urgent** (`dashboard.command-center.tsx:1213-1249`).
- **Why it matters:** Admin clicks an incident count and sees no incidents.
- **Fix:** Point this item to `/dashboard/command-center?cc=urgent`.

### Home — H-3: CE "behind on training" notification lands where there's no training data
- **Where:** `src/components/NotificationBell.tsx:156` links to `/dashboard/records-desk?tab=training-records`, which maps to the Documentation **Review** tab (`dashboard.records-desk.tsx:30`) — no training/CE data there.
- **Why it matters:** The notification body says "Open Training Records to see who's behind," but the destination has none.
- **Fix:** Link to the actual CE/training roster (e.g., `/dashboard/courses`).

### Home — H-4: Several "Needs your attention" items imply a filtered view but land generic
- **Where:** `src/components/company-overview.tsx` — "Notes awaiting signature" (`:324`) and "Audit readiness" (`:153`) → generic `/dashboard/records-desk`; "Reimbursements pending," "Clients off budget pace," "Billing warnings," "Claims ready to submit" (`:319-327`) → bare `/dashboard/billing` with no sub-filter.
- **Why it matters:** The counts are specific; the destinations dump the admin on a generic page to re-find them.
- **Fix:** Add the relevant `?tab=`/filter parameter to each link.

### Scheduling — S-5: Staff have no Accept/Decline control, but the admin side expects responses
- **Where:** staff `src/routes/dashboard.schedule.tsx:188-255` renders shift status as a read-only badge; admin `src/routes/dashboard.scheduling.tsx:714-738` filters by accepted/pending/declined.
- **Why it matters:** Staff can never accept/decline, so the admin's Accepted/Pending/Declined stats and the confirmation loop never populate.
- **Fix:** Add Accept/Decline buttons on the staff shift card that update `scheduled_shifts.status`.

### Documentation/EVV — S-4: Clock-in/out only refreshes one of three live views
- **Where:** `src/components/evv/punch-pad.tsx:525,1038` invalidate `["evv-active"]`, but the persistent clocked-in bar uses `["active-shift"]` (`use-active-shift.tsx:24`) and the overview uses `["active-timesheet-overview"]` (`use-today-shift.tsx:74`).
- **Why it matters:** After clocking in/out, the green bar/overview can lag up to ~30s (their refetch interval). Data is correct; the UI is slow to reflect it.
- **Fix:** Invalidate all three keys (or standardize on one shared key).

### Finances/Billing — D-2: Form 520 "Remaining units" subtracts only the current period
- **Where:** `src/routes/dashboard.billing.form520.tsx:185`. `remaining_units = annual authorization − (this period's units)` — it ignores cumulative prior usage, so the "annual auth exhausted" warning (`:230`) under-fires.
- **Why it matters:** Overstates remaining units on a State-facing Medicaid submission. (The exported units/rate columns themselves are correct.)
- **Fix:** Compute remaining from cumulative usage across the authorization window (as `useClientBudget` already does).

### Settings — SET-1: Bank Mapping presents mock Plaid/SSI data as a live feed
- **Where:** `src/routes/dashboard.settings.bank-mapping.tsx` — `MOCK_PLAID_ACCOUNTS` (`:42`), `linkBank` inserts hardcoded banks (`:109-121`), "Run Bank Feed Sync" injects random fake SSI deposits from `SSI_DEPOSIT_FEED` (`:49`) into the real `pba_transactions` trust ledger with `auto_reconciled: true` (`:163-191`); the "QuickBooks push" is a `console.info` (`:189`). UI labels these "Live Bank Stream / Active."
- **Why it matters:** Fabricated deposits land in a real fiduciary client-trust ledger — risky for a healthcare/financial product.
- **Fix:** Gate the whole page behind a clearly-labeled demo/sandbox flag, or block it from production until real Plaid/QBO integration ships.

### Settings — SET-2: "Send invite" reports success but never emails anyone
- **Where:** `src/routes/dashboard.settings.team-access.tsx:88` toasts "Invitation sent"; the server fn `src/lib/team-access.functions.ts:154` only inserts an `invitations` row — no email. The Invitations page confirms email isn't wired (`dashboard.invitations.tsx:172`), and the team-access page exposes no copyable link.
- **Why it matters:** The invitee receives nothing; the admin thinks an invite went out.
- **Fix:** Change the toast to "Invitation created — share the link from the Invitations page," or surface the signed invite link inline.

### Auth/Roles — A-3: `/fix-admin` is reachable by any logged-in user
- **Where:** `src/routes/fix-admin.tsx:24` calls `supabase.rpc("restore_my_admin_role")` and forces admin view; the route has no role guard.
- **Why it matters:** If the server-side RPC isn't locked to a hard allowlist, this is a self-service privilege-escalation button. At minimum it shouldn't ship to production.
- **Fix:** Remove `/fix-admin` from production (or gate it behind HIVE Executive) and verify the RPC enforces a server-side allowlist (see L-7).

## 🟩 Low (polish / non-blocking)

- **Auth — A-4:** Signup always navigates to `/dashboard` even when email confirmation is pending, so the dashboard immediately bounces the un-sessioned user to `/login` with no explanation. `src/routes/signup.tsx:99-105`. *Fix: if no session, route to `/login` with a "check your email" message.*
- **Auth — A-5:** The login screen footer shows the raw current path (`← Back to site · {pathname}`) — a debug leftover. `src/routes/login.tsx:309`. *Fix: remove the `· {pathname}` suffix.*
- **Auth — A-6:** "Continue with Google" hardcodes a `/dashboard` redirect, bypassing the exec-aware landing logic used by password login. `src/routes/login.tsx:156`. *Fix: let the post-auth effect own the landing.*
- **Auth — A-7:** The top-level `/admin`, `/manager`, `/employee`, `/super-admin` routes only redirect (to each role's home), not to an explicit "denied." Functionally safe (they render no protected UI). `src/lib/role-entry.tsx:20-23`. *Fix: optionally send disallowed roles to `/unauthorized`; or delete these vestigial routes.*
- **Home — H-5:** The entire `src/components/company-overview/` directory (9 card components) is dead code — nothing imports it (the page uses its own inline cards). One of them links to the non-existent `/dashboard/billing/subscription`. *Fix: delete the directory or wire it up.*
- **Home — H-6:** Behaviorists keep the generic Staff nav (My Caseload/Schedule/Daily Logs), some of which is irrelevant to a no-time-clock clinical role; "My Caseload" just loops back to their page. `dashboard.tsx:120-122`. *Fix: give Behaviorists a dedicated nav set.*
- **Home — H-7:** The Agency Command Center isn't in the admin nav — it's reachable only from the NotificationBell footer or a direct URL. `dashboard.tsx:44-52`. *Fix: add a Command Center link to `ADMIN_NAV`.*
- **Scheduling/EVV — S-1:** Client clock-in doesn't set `clock_in_timestamp` in the insert; it relies on the DB default. Confirmed the column has `NOT NULL DEFAULT now()` (`migrations/20260526011358…sql:10`), so inserts succeed — but pay/elapsed timers use server `now()` rather than the captured punch time (`raw_clock_in`). `src/components/evv/punch-pad.tsx:498-522`. *Fix: set `clock_in_timestamp: nowIso` explicitly.*
- **Scheduling/EVV — S-6:** Which codes geofence-lock for EVV is a hard-coded static list (`src/lib/evv-codes.ts:13-64`), not the service-catalog `evv_required` flag (that flag exists in the State template catalog and the HIVE-Exec editor but is **not** read anywhere in the app's clock-in logic). Positive: non-EVV codes correctly KEEP their clock-in — only the geofence wall is skipped (`punch-pad.tsx:557-571`), so the "don't remove clock-ins for non-EVV codes" requirement is satisfied. *Fix: drive EVV-lock from a DB `evv_required` flag, falling back to the static list.*
- **Scheduling — S-7:** `src/routes/dashboard.schedule.tsx:35` redefines `DAILY_CODES` locally instead of importing the shared list — currently identical but can drift. *Fix: import from `@/lib/service-billing`.*
- **Clients — CL-1:** "Add New Client" awaits address geocoding (Nominatim, up to ~10s) before writing the row, so the spinner can hang before the (still successful) insert. `src/routes/dashboard.clients.tsx:227`. *Fix: insert first, geocode in the background.*
- **Clients — CL-2:** "File Critical Event Report Now" uses a hard `window.location.href` (full reload) instead of SPA navigation. `src/routes/dashboard.daily-logs.tsx:830`. *Fix: use `navigate({ to, params })`.*
- **Documentation — DOC-1:** A complete "NECTAR Medication Importer" dialog (and its write path) is defined but never rendered — dead code. `src/components/clients/medications-manager.tsx:677,105,205`. *Fix: delete or wire a trigger.*
- **Smart Import — SI-1:** PCSP files upload to a per-org temp path and the commit records that temp path rather than re-keying under the new client ID, so storage objects accumulate under a tmp prefix (DB row + signed URL still work). `src/components/clients/ai-pdf-importer.tsx:248`. *Fix: re-key the object to `${org}/${clientId}/…` after commit.*
- **Training — TR-1:** The "My Trainings" core card shows a hardcoded "22 topics" badge next to a live `{coreDone} of {coreCount}` count; if the topic count isn't 22 the badge is wrong. `src/routes/dashboard.courses.index.tsx:129`. *Fix: render `{coreCount}`.*
- **Compliance — C-2:** `/dashboard/admin/ce-hours` double-redirects (→ records-desk → documentation hub). `src/routes/dashboard.admin.ce-hours.tsx`. *Fix: point it straight at `/dashboard/hub/documentation?tab=review`.*
- **Finances/Billing — D-3:** The PBA Trust Ledger ships a "Mock Receipt Deck / Test NECTAR Extraction" sandbox (fake `setTimeout` values) visible in production alongside the real OCR path. `src/routes/dashboard.pba-ledger.tsx:316-343,553-636`. *Fix: gate behind a dev/sandbox flag.*
- **Finances/Billing — D-4:** Three legal texts are explicitly marked placeholder/"pending legal review": Form 520 attestation (`dashboard.billing.form520.tsx:776`), Revenue disclaimer (`dashboard.financial.revenue.tsx:356`), loan attestation (`client-loans.functions.ts:15`). *Fix: route to counsel before launch.*
- **Finances/Billing — D-5:** Financial "Profitability" and "Cash Flow" tabs are intentionally disabled with a "Soon" badge; HIVE-Exec Plans shows "Payment processing — coming soon" (`dashboard.hive-exec.plans.tsx:307`). Intentional stubs — listed for visibility.
- **Structural — X-1:** 16 routes are reachable only by typing the URL (no in-app link points to them): `/dashboard/reports`, `/dashboard/roles`, `/dashboard/permissions`, `/dashboard/reimbursements`, `/dashboard/assignments`, `/dashboard/emar`, `/dashboard/team`, `/dashboard/billing-520`, `/dashboard/client-billing-codes`, `/dashboard/external-compliance`, `/dashboard/host-home-control`, `/dashboard/internal-audit`, `/dashboard/programs-admin`, `/dashboard/admin/ce-hours`, `/dashboard/admin/emar-audit`, `/fix-admin`. Some are intentional deep-links or tab targets; `/dashboard/reports` (R-1) and `/dashboard/roles` + `/dashboard/permissions` (likely superseded by Settings → Team Access) are worth confirming. *Fix: link or retire each.*

---

## ✅ Verified working (what's solid)

**Auth/Roles**
- `/dashboard` redirects unauthenticated users to `/login`; a spinner shows while auth resolves (no protected content paints first). `dashboard.tsx:102-104,216`.
- All three roles reach a non-broken landing; HIVE Executive area is double-gated (component guard + every exec server fn calls `ensureExecutive`). Super-Admin console is permission-gated. `committee_member` is fail-closed to `/dashboard/hrc`.
- Username login is enumeration-safe (generic error, email never returned); archived accounts are blocked server- and client-side.

**Home/Hubs** — all five hub pages and every page they wrap exist and resolve; `?tab=` deep-linking and RBAC guards are wired; Command Center triage (approve/deny/reopen, incident submission, NECTAR Infusion) and all empty states are real and non-crashing. Staff and Behaviorist homes have clean empty/loading states.

**Scheduling/EVV** — Schedule Publish (single, bulk, NECTAR auto-assign) writes real `scheduled_shifts` and reflects to staff; EVV clock-in writes a real `evv_timesheets` row for both EVV and non-EVV codes (non-EVV keeps the clock-in, only skipping the geofence wall); clock-out is a real update with full paperwork; hourly EVV time feeds payroll/billing/reports; caseload, other-assignments, and teams persist.

**Clients/Employees/Documentation/Smart Import** — create/edit/archive client, create/edit/disable employee, password reset, caseload assignment, invitations, daily logs (+ admin approve/return), eMAR pass, behaviorist notes, and all HHS-Hub writes persist via real server functions and refresh the UI. The **Smart Import** chain (upload → AI extract → editable review → commit) writes real clients + billing codes + meds + document + custom fields and dedupes — it is not a stub. Role gating is correct: Staff cannot reach client/employee admin screens; Behaviorists are isolated to their caseload.

**Reports/Finances** — every finance view guards empty arrays and divide-by-zero and shows explicit empty-state rows (no crashes found). Real, working: Form 520 exports (Copy/CSV/PDF/Excel), Behavior Supports packet (CSV/PDF), Ask-NECTAR CSV, saved-report CRUD/scheduling, manual billed + Your-Inputs ledger, 520 submission/attestation with immutable audit log, reimbursement and PBA mutations. All finance server fns enforce per-org membership/role and routes are role-gated.

**Settings/Training/Compliance** — settings profile/org save, role changes, permission-matrix save, team create/drag-drop, HR Admin rollups, the full Courses/Training/Tracks/Programs flows, Forms builder/publish/assign/submit (when reached with a client), submissions export, certifications verify/PDF, external certs upload/review, external-compliance attestation, audit-packet creation/sharing, internal audit, compliance desk approve/exports, authoritative-sources ingest/draft — all backed by real reads/writes with correct guards.

**Structural** — every static `to=`/`navigate` target in the codebase (90 distinct) resolves to a real route *except* the templated "HIVE Subscription" tab (F-1). No empty/no-op `onClick` handlers or `href="#"` dead buttons were found.

---

## 🔬 Needs live-data confirmation

These can't be judged from code alone — verify by running the app with fake data:

- **L-1:** After a staff clock-in, does a real `evv_timesheets` row appear and show up in the active-shift bar and pay period? (Insert relies on the `clock_in_timestamp` default, which the migration confirms exists.)
- **L-2:** Is `hhs_daily_records` actually empty in the live DB (confirming D-1's impact), or does some DB trigger/RPC backfill it from `daily_logs`/`hhs_monthly_attendance`? This determines whether daily billing is truly broken.
- **L-3:** Does the Form 520 export reconcile against a real multi-month authorization (units/rate correct; "remaining" per D-2)?
- **L-4:** Does the saved-report **scheduler** actually run? `upsertReportSchedule` writes `next_run_at`, but the consuming cron worker isn't in this codebase — "Email results" may never deliver.
- **L-5:** Are the AI features configured in prod (`LOVABLE_API_KEY`)? Smart Import extraction, eMAR med parse, the daily-log coach, Ask-NECTAR, and Nectar form drafting all hard-fail without it.
- **L-6:** Do the storage buckets exist in prod (`certificates`, `training-assets`, `audit-documents`, `client-documents`, etc.)? Uploads error without them.
- **L-7:** Does the `restore_my_admin_role` RPC enforce a hard server-side allowlist? This decides whether `/fix-admin` (A-3) is merely ugly or a privilege-escalation hole.
- **L-8:** Agency Health Snapshot returns 100% when a metric's denominator is 0 — confirm that "empty org looks Optimal" is the intended empty-state behavior. `agency-health-snapshot.tsx`.
- **L-9:** Ask-NECTAR / Help deep-links navigate to an LLM-provided path (`window.location.assign`) — a hallucinated path would hard-404. `dashboard.help.tsx:229-236`.
- **L-10:** Several writes assume specific columns/constraints exist (e.g., `clients.authorized_dspd_codes`, `client_billing_codes` unique key, `org_member_directory` view). They fail loudly (caught → toast) if missing — confirm schema parity in prod.

*See `ROUTE_MAP.md` for the full clickable-control map grouped by area and role.*
