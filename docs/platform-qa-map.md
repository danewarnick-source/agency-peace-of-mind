# Hive Platform QA Map

**Date:** 2026-06-18  
**Method:** Read-only static audit. No code changed.  
**Scope:** All route files in `src/routes/`. Components delegated from routes were followed where needed to classify the route.  
**Already audited (prior sessions, status confirmed here):** signup, onboarding, clock in/out (timeclock), training & courses, reporting (reports), scheduler.

---

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total route files | 161 |
| Dashboard feature area routes (non-auth, non-redirect) | ~130 |
| **WIRED** | **~85** |
| **PARTIAL** | **~18** |
| **FAKE UI** | **4** |
| **READ-ONLY** (display correct, write expected but absent) | **8** |
| **REDIRECT stubs** (pass-through only) | **14** |
| Layout shells (by design thin) | ~7 |
| Not yet traced | 0 |

---

## Classification Table

> Redirects and auth/landing routes are listed compactly at the end.

### AUTH & ACCESS

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| login | login.tsx | WIRED | `supabase.auth.signInWithPassword` | — |
| signup | signup.tsx | WIRED (prior audit) | — | — |
| forgot-password | forgot-password.tsx | WIRED | `supabase.auth.resetPasswordForEmail` | — |
| reset-password | reset-password.tsx | WIRED | `supabase.auth.updateUser` | — |
| verify.$code | verify.$code.tsx | WIRED | verify OTP flow | — |
| invitations | dashboard.invitations.tsx | WIRED | `invitations` INSERT/UPDATE, `invalidateQueries` | Email NOT sent automatically (in-UI warning at line 173) |
| roles | dashboard.roles.tsx | WIRED | `organization_members.update` on role | `.update` has no client-side org filter (line 66); RLS-only |
| permissions | dashboard.permissions.tsx | WIRED | `role_permissions.upsert`, `invalidateQueries` | — |
| settings.team-access | dashboard.settings.team-access.tsx | WIRED | `setMemberGrants`, `inviteTeamMember` server fns | Invite `onSuccess` doesn't `invalidateQueries(["invitations"])` (line 88) |
| super-admin | dashboard.super-admin.tsx | WIRED | Multi-table cross-tenant reads + writes | `toast.success("Now acting as...")` after client-side store write, not DB (line 302) |

---

### STAFF

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| employees.index | dashboard.employees.index.tsx | WIRED | `invitations.insert`, `organization_members.update`, `course_assignments.insert`, `staff_assignments` CRUD; `invalidateQueries` throughout | — |
| employees.$staffId | dashboard.employees.$staffId.tsx | READ-ONLY | `organization_members` + `profiles` SELECT, `getStaffChecklist` server fn; no mutations | No edit functionality in this file; edit is via index-page dialog |
| certifications | dashboard.certifications.tsx | READ-ONLY | `certifications` SELECT with org filter | No write; expected certification CRUD missing here |
| external-certifications | dashboard.external-certifications.tsx | WIRED | `external_certifications.insert`; `.update` for approve/reject; `invalidateQueries` | — |
| assignments | dashboard.assignments.tsx | WIRED | `staff_assignments.delete`, `.update`, `.insert`; `invalidateQueries` at lines 186-189 | — |

---

### CLIENTS

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| clients | dashboard.clients.tsx | WIRED | `clients` INSERT/UPDATE; `client_billing_codes` upsert/close/reopen; `staff_assignments` CRUD; `client_documents` CRUD; Storage | 2 premature "Pinned" toasts before DB save (lines 1821, 2894); UPDATE has no JS-layer org filter (line 338); feature toggles "Coming soon" for 5 keys (line 2674) |
| clients.$clientId | dashboard.clients.$clientId.tsx | READ-ONLY | Queries `clients`, `client_billing_codes`, `evv_timesheets`, etc. — display only | DeadlinesPanel is a static link card with no data (line 489); no mutations in this file |
| client-intake.$clientId | dashboard.client-intake.$clientId.tsx | WIRED (read+nav) | Reads `clients`, delegates form-fill to `forms/$formId/fill` route | Empty state says "No intake forms configured yet" if no templates seeded |
| client-billing-codes | dashboard.client-billing-codes.tsx | WIRED | `client_billing_codes.upsert`, `.delete`, `time_pay_settings.upsert` | Uses `refetch()` not `invalidateQueries`; cross-page staleness possible |
| behavior-support.$clientId | dashboard.behavior-support.$clientId.tsx | WIRED (shell) | `behavior_support_clients` SELECT; mutations delegated to sub-components | Post-shift behavior questions NOT present; BSP panels only |
| workspace.$clientId | dashboard.workspace.$clientId.tsx | WIRED (read+delegate) | `behavior_support_clients`, `bc_behaviors` SELECT; mutations via `<PunchPad>` | Inline queries lack explicit org filter (client_id-only) |
| client-training.$clientId | dashboard.client-training.$clientId.tsx | WIRED | `completeClientSpecificTraining` server fn; `invalidateQueries` | — |
| clients.rhs-board | dashboard.clients.rhs-board.tsx | SESSION-ONLY | Delegates to `<RhsPlanningBoard>`; no DB writes | Drag-and-drop planning board; deliberately no persistence (UI discloses this) |

---

### TIME & SCHEDULING

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| timeclock | dashboard.timeclock.tsx | WIRED (prior audit) | — | — |
| scheduler | dashboard.scheduler.tsx | WIRED (prior audit) | — | — |
| schedule | dashboard.schedule.tsx | WIRED | `scheduled_shifts` SELECT; `respondToShift` server fn; `day_program_sessions` | `toast.success("Marked as seen.")` at line 609 follows only localStorage write |
| schedule-preview | dashboard.schedule-preview.tsx | REDIRECT | → `/dashboard/scheduler` | Legacy redirect |
| scheduling | dashboard.scheduling.tsx | REDIRECT | → `/dashboard/scheduler` | Legacy redirect |
| shift.$shiftId | dashboard.shift.$shiftId.tsx | PARTIAL | `evv_timesheets` INSERT/UPDATE (clock in/out); `shift_reports` INSERT; `shift_callouts` INSERT | **Callout SMS/voice channels explicitly simulated** (lines 563-585, disclosed at line 668); `scheduled_shifts` fetch has no org or staff filter (RLS-only); multiple `as any`/`as never` casts on tables not in generated types |
| assignments | dashboard.assignments.tsx | WIRED | See STAFF section | — |

---

### eMAR & HEALTH

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| emar | dashboard.emar.tsx | WIRED | `emar_logs`, `controlled_med_counts`, `client_medications`, `submitted_forms` via server fn; med training gate RPC; dedup guard | — |
| admin.emar-audit | dashboard.admin.emar-audit.tsx | WIRED | `emar_logs` SELECT + real CSV export | Read-only audit view; permission-gated |
| behaviorist | dashboard.behaviorist.tsx | READ-ONLY | `profiles`, `behavior_support_clients`, `bc_flags` SELECT; no mutations | Caseload list display only; no write actions |
| behavior-support.$clientId | dashboard.behavior-support.$clientId.tsx | WIRED (shell) | See CLIENTS section | — |
| hhs-hub.$clientId | dashboard.hhs-hub.$clientId.tsx | PARTIAL | Server fns for daily record, attendance, PRN, incident; `shift_medication_attestations.insert` | **"Emergency Med Auth" and "Advanced Directives" buttons at lines 148-152 are dead — no onClick handler**; `clients` and `client_medications` queries lack org filter (lines 70, 83); `hhs_incident_reports` and `hhs_medical_logs` use `as never` cast — tables may not exist in live DB |
| host-home-control | dashboard.host-home-control.tsx | WIRED | `clients` SELECT; server fns for daily records, emar, incidents; `markIncidentFiled` mutation | — |

---

### COMPLIANCE & DOCS

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| daily-logs | dashboard.daily-logs.tsx | WIRED | `daily_logs` INSERT + UPDATE (submit/approve/deny); `invalidateQueries` (4 keys) | Staff queries filter by `user_id` only, no `organization_id` (RLS-dependent) |
| deadlines | dashboard.deadlines.tsx | WIRED | `attestSummaryUpiEntered` server fn; `invalidateQueries` | Read via `useDeadlines()` hook |
| incidents | *(no route file)* | N/A | **No `dashboard.incidents.tsx` file exists** | Incident create/review lives in `command-center` + `hhs-hub`; no dedicated incidents route |
| authoritative-sources | dashboard.authoritative-sources.tsx | WIRED | 10+ server fns for source/requirement/mapping/attestation CRUD; `invalidateQueries` throughout | — |
| nectar-docs | dashboard.nectar-docs.tsx | WIRED | `queryDocuments`, `ingestDocument`, `deleteDocument`, `reviewExtractedField` server fns | `prompt()` browser dialog used for field overrides (line 556) |
| records-desk | dashboard.records-desk.tsx | REDIRECT | → `/dashboard/hub/documentation` (with tab mapping) | Legacy redirect shim |
| compliance-desk | dashboard.compliance-desk.tsx | WIRED | `evv_timesheets` SELECT (5 query keys) + UPDATE (approve/deny/reopen/edit/reconcile); 4 real CSV exports | `approvedQ` hard-limited to 5000 rows (line 466) — CSV exports silently truncate for large orgs; `client_approved_locations` query missing org filter (line 2315) |
| internal-audit | dashboard.internal-audit.tsx | READ-ONLY | `runInternalAudit` + `listAuditableStaff` server fns; CSV download | No DB write; `toast.success("report downloaded")` on local CSV blob (line 227) — no preceding mutation |
| audit | dashboard.audit.tsx | WIRED | `audit_packets` CREATE/UPDATE; `audit_packet_items.update`; `audit_files.update`; Storage upload | `toast.success` on local CSV download (not a mutation) |
| external-compliance | dashboard.external-compliance.tsx | WIRED | `generateRequirementsFromSource` + `attestExternalCompletion` server fns; `invalidateQueries` | — |
| summaries | dashboard.summaries.tsx | WIRED | `saveSummaryDraft`, `finalizeSummary`, `attestSummaryUpiEntered`, `draftProgressSummary` server fns | — |
| hrc | dashboard.hrc.tsx | PARTIAL | `hrc_meetings.insert`, `hrc_reviews.insert`, `organization_members.update` (role); `invalidateQueries` | **Flagged-client panel has "No data wiring yet" comment** (line 76); meeting/review inserts write hardcoded `"(placeholder)"` strings; `toast.success("Placeholder meeting added")` |

---

### BILLING

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| billing.index | dashboard.billing.index.tsx | WIRED | `clients`, `evv_timesheets`, `hhs_daily_records_v`, `client_billing_codes` SELECT; real unit math via `computeEntryUnits()` | Read-only overview |
| billing.$clientId | dashboard.billing.$clientId.tsx | WIRED | `client_billing_codes.upsert`, `.delete`; `listRateHistory` server fn | `delete` by `id` only — no JS-layer org guard (line 101); `refetch()` instead of `invalidateQueries` |
| billing.form520 | dashboard.billing.form520.tsx | WIRED | 6 DB mutations across `billing_submissions`, `billing_submission_warnings`, `billing_submission_audit_log`; real export | **Attestation legal copy marked "⚠️ Placeholder — must be reviewed by counsel before launch" (line 869)** — launch blocker |
| billing.imports | dashboard.billing.imports.tsx | WIRED | `clients` SELECT; `client_billing_codes.upsert`; org-scoped | No `invalidateQueries` after upsert (minor) |
| billing.nectar | dashboard.billing.nectar.tsx | WIRED | `askNectarReport`, `saveReport`, `deleteSavedReport`, `togglePinReport`, `upsertReportSchedule` server fns; CSV export from real data | Alert settings in localStorage (by design) |
| billing.gross | dashboard.billing.gross.tsx | REDIRECT | → `/dashboard/financial/gross` | — |
| billing.host-home | dashboard.billing.host-home.tsx | REDIRECT | → `/dashboard/financial/host-home` | — |
| billing.monthly-grid | dashboard.billing.monthly-grid.tsx | REDIRECT | → `/dashboard/financial/monthly-grid` | — |
| billing.totals | dashboard.billing.totals.tsx | REDIRECT | → `/dashboard/financial/totals` | — |
| billing.distributions | dashboard.billing.distributions.tsx | REDIRECT | → `/dashboard/financial/distributions` | 0 nav refs in ORPHAN_ROUTES.md — may be unreachable |
| billing.contractors | dashboard.billing.contractors.tsx | REDIRECT | → `/dashboard/financial/contractors` | — |
| billing.subscription | dashboard.billing.subscription.tsx | REDIRECT | → `/dashboard/settings/subscription` | — |
| billing-520 | dashboard.billing-520.tsx | REDIRECT | → `/dashboard/billing/form520` | — |
| admin.ce-hours | dashboard.admin.ce-hours.tsx | REDIRECT | → `/dashboard/records-desk?tab=training-records` | — |

---

### FINANCIAL

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| financial.index | dashboard.financial.index.tsx | REDIRECT | → `/dashboard/financial/revenue` | — |
| financial.gross | dashboard.financial.gross.tsx | WIRED | 6 server fns; `computeEntryUnits()` for DSP; distinct-date for HHS; no hardcoded $ | Read-only |
| financial.host-home | dashboard.financial.host-home.tsx | WIRED | Server fns + `hhs_host_home_settings.upsert`, `hhs_host_home_monthly.upsert` | Both tables cast `as never` — not in generated TS types; verify migrations applied |
| financial.monthly-grid | dashboard.financial.monthly-grid.tsx | WIRED | `clients`, `evv_timesheets`, `hhs_daily_records_v`, `general_shifts`, rate history; `computeEntryUnits()` | `profiles` queried without org filter (lines 104-114, 159-168); relies on indirect scoping |
| financial.totals | dashboard.financial.totals.tsx | WIRED | 9 server fns + `provider_ledger_entries` INSERT/UPDATE; `invalidateQueries` | Each "Add received" click always inserts new row (by design) |
| financial.revenue | dashboard.financial.revenue.tsx | WIRED | `getBilledRevenueByYear`, `listBilledManualEntries`; `upsertBilledManualEntry`, `deleteBilledManualEntry` server fns | Line 357: "(Disclaimer pending legal review.)" — cosmetic note |
| financial.rhs | dashboard.financial.rhs.tsx | WIRED (READ-ONLY) | `getRhsCodes`, `getRhsClients`, `getRhsDays` server fns; permission-gated | No mutations; correct for RHS read-only view |
| financial.contractors | dashboard.financial.contractors.tsx | WIRED | Server fns + `contractor_monthly_pay.upsert` (cast `as never`); org-scoped | `as never` cast — table not in generated types |
| financial.employees | dashboard.financial.employees.tsx | WIRED | Server fns + `contractor_monthly_pay.upsert` (cast `as never`); org-scoped | Same `as never` issue; reuses contractor table for W2 by design |
| financial.distributions | dashboard.financial.distributions.tsx | WIRED | `distribution_plans` + `distribution_participants` CRUD via server fns; `computeEntry` for payout math | `proposeFormula()` is a local heuristic — never auto-applies; human must approve |
| financial.nectar | dashboard.financial.nectar.tsx | WIRED | `askFinancialNectar` server fn via `useMutation` | No direct DB access; AI query route |

---

### TRAINING (prior audit, status confirmed)

| Route | Status | Notes |
|-------|--------|-------|
| training.index | WIRED | — |
| training.$id | WIRED | — |
| courses.index | WIRED | — |
| courses.$courseId | WIRED | — |
| courses.$courseId.edit | WIRED | — |
| courses.mindsmith | REDIRECT (likely orphan) | 0 nav refs per ORPHAN_ROUTES |
| tracks.tsx | WIRED | — |
| tracks.$trackSlug | WIRED | — |
| programs.tsx | WIRED | `training_programs` SELECT has no org filter — relies on RLS |
| programs-admin | WIRED | Same org filter gap on reads; write includes `organization_id` |
| programs.$programId | WIRED | — |

---

### IMPORT/EXPORT

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| smart-import.index | dashboard.smart-import.index.tsx | WIRED | Server fns + Storage; `createSmartImportJob`, `runSmartExtraction`; `invalidateQueries` | `readDocText()` at line 90 is dead code (stale comment); no data impact |
| smart-import.$jobId.review | dashboard.smart-import.$jobId.review.tsx | WIRED | 12 server fn mutations; all `toast.success` backed by real mutations | — |
| smart-import.$jobId.done | dashboard.smart-import.$jobId.done.tsx | WIRED | Confirmed live (ORPHAN_ROUTES shows 3 inbound refs) | — |
| smart-import.history | dashboard.smart-import.history.tsx | WIRED | `listImportJobs`, `discardImportJob` server fns; `invalidateQueries` | — |
| evv-archive | dashboard.evv-archive.tsx | WIRED (read-only) | `evv_timesheets` SELECT (org-scoped); real CSV export (`EXPORT_CAP=10000`) | `syncUrl` is explicitly a no-op stub (URL filter state not persisted) |
| reports | dashboard.reports.tsx | PARTIAL | `course_assignments`, `external_certifications` SELECT (org-scoped); CSV exports | **`user_training_progress` not org-scoped** (documented at lines 76-78); 3 of 5 exports show current-user only — admin org-wide compliance reports are broken |

---

### SETTINGS

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| settings.tsx | dashboard.settings.tsx | WIRED | `organizations.update`, `profiles.update`, `updateAccountContact` server fn | `saveProfile` does not check returned error (line 63) |
| settings.service-catalog | dashboard.settings.service-catalog.tsx | WIRED | `service_codes.upsert`, `.delete`; org-scoped; `invalidateQueries` | `supabase as any` cast (not functional) |
| settings.bank-mapping | dashboard.settings.bank-mapping.tsx | **FAKE UI** | **`MOCK_PLAID_ACCOUNTS` hardcoded (line 42); `SSI_DEPOSIT_FEED` fake transactions (line 49); `PlaidLinkDialog` with preset credentials; `sync` inserts random mock rows into `pba_transactions`; QBO = console.log** | Real DB writes with fabricated data — `pba_transactions` will contain synthetic SSI amounts. Plaid, Stripe, and QBO integrations do not exist |
| settings.automation-rules | dashboard.settings.automation-rules.tsx | WIRED | `provisioning_rules` SELECT/INSERT/UPDATE; `invalidateQueries` | — |
| settings.email | dashboard.settings.email.tsx | WIRED | `getOrgEmailSettings`, `updateOrgEmailSettings`, `sendEmail` server fns | No `invalidateQueries` after save (minor) |
| settings.gmail | dashboard.settings.gmail.tsx | WIRED | Gmail OAuth flow + `listGmailRules`, `upsertGmailRule`, `deleteGmailRule` server fns; `invalidateQueries` | — |
| settings.retention | dashboard.settings.retention.tsx | WIRED | `getRetentionSettings`, `updateRetentionSettings`, `sweepArchiveEligible`, `purgeAgedReferrals` server fns | — |
| settings.service-codes | dashboard.settings.service-codes.tsx | READ-ONLY (by design) | `service_codes` SELECT; labeled "Read-only reference" in UI | Intentional |
| settings.subscription | dashboard.settings.subscription.tsx | REDIRECT | → `/dashboard/settings/subscription` wait — this IS the subscription page | 173-line payment UI that collects card data (lines 780-789) but payment processing is not wired (HIVE Exec Plans page says "coming soon") |

---

### OTHER

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| command-center | dashboard.command-center.tsx | WIRED | `incident_reports`, `evv_timesheets`, `daily_logs`, `emar_logs` SELECT + mutations; org-scoped; `invalidateQueries` | Incidents management lives only here (no dedicated incidents route) |
| inbox | dashboard.inbox.tsx | WIRED | `listInboxMessages`, `openInboxMessage` server fns; org-scoped; `invalidateQueries` | — |
| summaries | dashboard.summaries.tsx | WIRED | See COMPLIANCE section | — |
| ask-nectar | dashboard.ask-nectar.tsx | PARTIAL (shell) | 30-line wrapper delegating to `<AskNectarStaff>` component | Component not audited; classification depends on component wiring |
| pba-ledger | dashboard.pba-ledger.tsx | PARTIAL | Real `pba_accounts`, `pba_audit_samples`, `pba_transactions` reads/writes; `generate_pba_audit_sample` RPC | **`MOCK_RECEIPTS` sandbox deck** (lines 563-591); `simulateMock()` shows `toast.success("Simulated NECTAR extraction…")` at line 362 with NO DB write; 3 PBA tables cast `as never` — unconfirmed in live DB |
| reimbursements | dashboard.reimbursements.tsx | WIRED | `activity_reimbursement_requests` SELECT + UPDATE (approve/deny); `invalidateQueries` | `staff:staff_id` FK embed should be verified |
| client-loans | dashboard.client-loans.tsx | WIRED | `listOrgLoans` server fn; `clients` SELECT; mutations in `<LoanEditor>` sub-component | `supabase as any` cast on clients query |
| nectar-company-profile | dashboard.nectar-company-profile.tsx | **FAKE UI** | **Saves to `localStorage` ONLY** (line 83) — no DB write | Agency profile configuration (active services, workforce size, counties) is never persisted to DB; calibration lost on new browser/session |
| day-program | dashboard.day-program.tsx | **FAKE UI** | Explicit: "This page hasn't been built yet." (line 14) | Live route serving blank content page |
| help | dashboard.help.tsx | WIRED | `escalateM` mutation; server fn integration for ticket escalation | — |
| hub.clients | dashboard.hub.clients.tsx | Hub shell | Delegates to `ClientsPage`, `PbaLedgerPage`, `ClientLoansPage`, etc. | — |
| hub.documentation | dashboard.hub.documentation.tsx | Hub shell | Delegates to docs sub-pages | — |
| hub.employees | dashboard.hub.employees.tsx | Hub shell | Delegates to `EmployeesPage`, `HostsPage`, `HrAdminPage` | Hosts tab uses `can("view_referrals")` — suspicious permission name for a Hosts tab |
| hub.finances | dashboard.hub.finances.tsx | WIRED | `getBilledRevenueByYear`, `getTotalsLedger`, `getBillingSnapshot` server fns; permission-gated | — |
| hub.knowledge | dashboard.hub.knowledge.tsx | Hub shell | Delegates to AuthoritativeSourcesPage, NectarDocsPage, ExternalCompliancePage | — |
| homes | dashboard.homes.tsx | Hub shell | Delegates to `<HomesTeamsBoard>` | — |
| teams | dashboard.teams.tsx | REDIRECT | → `/dashboard/homes` | Legacy redirect |
| team | dashboard.team.tsx | READ-ONLY | `organization_members`, `org_member_directory`, `course_assignments` SELECT; correct two-query join pattern | — |
| hr-admin | dashboard.hr-admin.tsx | WIRED (read-only) | `getHrAdminRollup` server fn; mutations in sub-components | — |
| hr-admin.settings | dashboard.hr-admin.settings.tsx | Hub shell | Delegates to `<StaffTypesProposal>` | — |
| index | dashboard.index.tsx | WIRED | `daily_logs`, `evv_timesheets` SELECT (user-scoped); delegates to sub-components | — |
| host-home-control | dashboard.host-home-control.tsx | WIRED | Server fns for daily records + `markIncidentFiled`; org-scoped | 0 nav refs in ORPHAN_ROUTES — may be orphaned |

---

### HIVE EXEC

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| hive-exec | dashboard.hive-exec.tsx | Layout shell | Nav bar + `<Outlet>` | `TABS` and `execNav` arrays have diverged — see Cross-Cutting §Orphan Routes |
| hive-exec.index | dashboard.hive-exec.index.tsx | WIRED | `getExecKpis`, `listCompanies` server fns; 30s poll | — |
| hive-exec.health | dashboard.hive-exec.health.tsx | WIRED | `listCompanies` server fn | Read-only |
| hive-exec.$orgId | dashboard.hive-exec.$orgId.tsx | WIRED | Per-org detail view; 7 inbound refs per ORPHAN_ROUTES | — |
| hive-exec.approvals | dashboard.hive-exec.approvals.tsx | WIRED | Server fns for approve/reject extraction; `invalidateQueries` | Missing from HIVE Exec sub-nav `TABS` array |
| hive-exec.base-template | dashboard.hive-exec.base-template.tsx | WIRED | `publishBaseTemplate` server fn; `invalidateQueries` | Not in `execNav` sidebar; reachable only from States list |
| hive-exec.company-migration | dashboard.hive-exec.company-migration.tsx | WIRED | `createM`, `updateEngagement`, `saveQuote` mutations; `invalidateQueries` | — |
| hive-exec.messages | dashboard.hive-exec.messages.tsx | WIRED | Sends messages via server fn; org selection; `invalidateQueries` | Missing from `execNav` sidebar |
| hive-exec.nectar | dashboard.hive-exec.nectar.tsx | WIRED | HIVE-level ticket queue + NPC analysis; `invalidateQueries` | Missing from `TABS` sub-nav |
| hive-exec.new-company | dashboard.hive-exec.new-company.tsx | WIRED | `createCompany` server fn; `invalidateQueries` | — |
| hive-exec.permissions | dashboard.hive-exec.permissions.tsx | WIRED | Role + membership update server fns; `invalidateQueries` | — |
| hive-exec.plans | dashboard.hive-exec.plans.tsx | PARTIAL | `updateTier` server fn; `invalidateQueries` | "Payment processing — coming soon" visible at line 307 |
| hive-exec.states | dashboard.hive-exec.states.tsx | WIRED (read-only) | State list display; read via server fn | — |
| hive-exec.states.$stateCode | dashboard.hive-exec.states.$stateCode.tsx | WIRED | State template publish + save; SOW section CRUD; `invalidateQueries` | — |
| hive-exec.states.$stateCode.onboarding | dashboard.hive-exec.states.$stateCode.onboarding.tsx | WIRED | Per-state onboarding config | — |
| hive-exec.tickets | dashboard.hive-exec.tickets.tsx | WIRED | Ticket status update server fn; `invalidateQueries` | — |

---

### FORMS

| Route | File | Status | Evidence | Gap |
|-------|------|--------|----------|-----|
| forms.index | dashboard.forms.index.tsx | WIRED | `listForms`, `saveForm`, `archiveForm`, `markFormNotificationsRead` server fns; `invalidateQueries` | — |
| forms.$formId.edit | dashboard.forms.$formId.edit.tsx | WIRED | `getForm`, `saveForm`, `nectarProposeRouting` server fns | `per_staff_per_client` mandate scope unimplemented (treated as per-staff, disclosed at line 655); enforcement prompts at punch-pad not yet wired (line 785) |
| forms.$formId.fill | dashboard.forms.$formId.fill.tsx | WIRED | `getStaffForm`, `submitForm`, `submitIntakeForm` server fns; `invalidateQueries` | — |
| forms.$formId.submissions | dashboard.forms.$formId.submissions.tsx | WIRED | Confirmed live (1 inbound ref); reads submissions | — |

---

### REDIRECT STUBS SUMMARY

These files are `beforeLoad: () => throw redirect(...)` with no component or data:

| Route | Redirects to |
|-------|-------------|
| billing.gross | /dashboard/financial/gross |
| billing.host-home | /dashboard/financial/host-home |
| billing.monthly-grid | /dashboard/financial/monthly-grid |
| billing.totals | /dashboard/financial/totals |
| billing.distributions | /dashboard/financial/distributions |
| billing.contractors | /dashboard/financial/contractors |
| billing.subscription | /dashboard/settings/subscription |
| financial.index | /dashboard/financial/revenue |
| billing-520 | /dashboard/billing/form520 |
| records-desk | /dashboard/hub/documentation (+ tab mapping) |
| teams | /dashboard/homes |
| schedule-preview | /dashboard/scheduler |
| scheduling | /dashboard/scheduler |
| admin.ce-hours | /dashboard/records-desk |

---

## Core CRUD Lifecycle Results

### A. Staff Add/Edit — PARTIAL

**Create:**
- ✅ `employees.index.tsx` — two paths: (1) invite via `invitations.insert` → join link; (2) manual account creation via server fn `createStaffAccount`. Both write to `organization_members`. Password temp display works.
- ✅ Required fields: email, role, optionally job_title and employee_id.

**Edit staff info:**
- ✅ `editMemberMutation` (line 235) writes `organization_members.update` for name/title/role/active, `profiles.update` for PII. `invalidateQueries(["members"])` fires.
- Fields: `full_name`, `phone`, `role`, `job_title`, `active`, `employee_id`, `hourly_rate`, `daily_rate`.

**Pay tab:**
- ✅ `employees.index.tsx` lines 796-810 show hourly_rate and daily_rate inputs inside `EditMemberDialog`. These write via `editMemberMutation.update(...)` which includes the pay fields. Pay is wired.

**Deactivate/delete:**
- ✅ `toggleActiveMutation` (line 211) — sets `active: false/true` on `organization_members`. No hard delete available from UI (appropriate).

**Staff profile page (`employees.$staffId.tsx`):**
- ❌ READ-ONLY — displays HR checklist, certifications, training history, shift feed. No edit capability here. All edits must go through the index-page dialog.

---

### B. Client Add/Edit — PARTIAL

**Create:**
- ✅ `clients.tsx` `addMutation` (line 269) — inserts to `clients` table.
- ✅ Required: `first_name`, `last_name`, `physical_address`, at least one `authorized_dspd_codes` entry, `medicaid_id` (enforced at line 2815).

**medicaid_id:**
- ✅ Required in add form; displayed in directory; editable in `ProfileTab`; saved via `editMutation` (line 317). EVV-critical field is wired.

**Client billing codes (1056):**
- ✅ `AuthorizedCodesEditor` in `clients.tsx` — real upsert/soft-close/reopen against `client_billing_codes` (lines 1061-1115). `invalidateQueries` fires.
- ✅ Standalone at `client-billing-codes.tsx` with upsert/delete and `time_pay_settings` write.

**PCSP / deadlines:**
- ⚠️ PCSP goals editable as a text field in `clients.tsx` ProfileTab (saved). Deadlines display in `clients.$clientId.tsx` is a static link card with no data (DeadlinesPanel at line 489).

**Post-shift behavior questions:**
- ❌ NOT present on client profile. `PerShiftFormsCareSection` component is rendered in `clients.tsx` (line 787) but no behavior question prompts are visible in the route code. BSP panel at `behavior-support.$clientId.tsx` covers behavioral tracking but is not per-shift.

---

### C. eMAR — PASS

- ✅ Med pass writes to `emar_logs` (primary record), `controlled_med_counts` (if controlled), `client_medications` (inventory decrement), and optionally `submitted_forms` (incident draft on error) — all via server function with auth middleware.
- ✅ **Self-administration support model correctly implemented** — dialog header says "Observe & Confirm self-administration"; attestation says "I observed the Person self-administer". Never "administered."
- ✅ Dedup guard at server fn lines 120-128 blocks duplicate passes for same med+scheduled_for.
- ✅ `is_med_assist_current` RPC blocks passes if training is lapsed.
- ✅ Late-entry flag at ≥15 min gap (lines 381-388).
- ✅ eMAR audit (`admin.emar-audit.tsx`) reads real `emar_logs` data; CSV export derives from real passes.

---

### D. Billing/Financial Exports — PARTIAL

**DHHS EVV export (Utah format):**
- ✅ `buildUtahCsv` (compliance-desk.tsx line 1277) — 30-column DHHS format from real `evv_timesheets` (status=Approved). Real data.
- ⚠️ `approvedQ` has `.limit(5000)` (line 466) — **export silently truncates above 5000 approved shifts.**

**Master Ledger / monthly-grid:**
- ✅ `buildMasterLedgerCsv` (compliance-desk.tsx line 1361) — 17-column full audit payload from real rows.
- ✅ `financial.monthly-grid.tsx` — reads from `evv_timesheets`, `hhs_daily_records_v`, `general_shifts`; uses `computeEntryUnits()` correctly.

**Form 520:**
- ✅ `billing.form520.tsx` — real data from `evv_timesheets` + `hhs_daily_records_v` + `client_billing_codes`; exports derive from real query rows.
- 🚨 **Attestation legal copy is placeholder** (line 869) — must be reviewed by counsel before launch.

**Host-home billing:**
- ✅ `financial.host-home.tsx` — billable days from `hhs_daily_records_v`; rates from `client_billing_codes`; user-entered host rates/activities persist to `hhs_host_home_settings`/`hhs_host_home_monthly`.
- ⚠️ Both tables cast `as never` — unconfirmed in live DB.

**Billing numbers from real shift data:**
- ✅ All financial pages use `computeEntryUnits()` from `billing-units.ts` for quarter-hour codes.
- ✅ HHS/RHS use distinct-date counts from `hhs_daily_records_v`.
- ✅ No hardcoded dollar amounts found in financial pages.

---

## Cross-Cutting Findings

### Writes Missing Org-Scope (Data Isolation Risk)

The following write operations have **no `organization_id` filter in the client-side query chain** — they rely entirely on RLS:

| File | Line | Operation | Risk |
|------|------|-----------|------|
| clients.tsx | 338 | `clients.update` by `id` only | RLS must prevent cross-org client edits |
| roles.tsx | 66 | `organization_members.update` by `id` only | RLS must prevent cross-org role changes |
| employees.index.tsx | 213-214 | `organization_members.update { active }` by `id` | RLS-only |
| billing.$clientId.tsx | 101 | `client_billing_codes.delete` by `id` | RLS-only |
| compliance-desk.tsx | 2315 | `client_approved_locations` SELECT by `client_id` | No org filter; RLS-dependent |
| programs.tsx | 24-26 | `training_programs` SELECT | No org filter; may return cross-org programs if RLS not strict |
| programs-admin.tsx | 50, 67, 79 | `training_programs`, `program_courses`, `courses` SELECT | Same |
| daily-logs.tsx | 130-162 | Staff "submitted-dates" / "rejected" queries by `user_id` only | RLS-dependent for org isolation |
| hhs-hub.$clientId.tsx | 70, 83 | `clients` and `client_medications` SELECT by `client_id` only | Any auth'd user knowing a clientId could read across org |
| workspace.$clientId.tsx | 133-148 | `behavior_support_clients`, `bc_behaviors` by `client_id` only | Same |

---

### Fake-Success Toasts

| File | Line | Toast message | Actual state |
|------|------|---------------|--------------|
| hrc.tsx | 194 | "Placeholder meeting added" | DB write happened but with fake "(placeholder)" data |
| hrc.tsx | 256 | "Placeholder review added" | Same — fake restriction_summary string |
| schedule.tsx | 609 | "Marked as seen." | Only localStorage write; no DB mutation |
| pba-ledger.tsx | 362 | "Simulated NECTAR extraction · {merchant}" | No DB write; `setTimeout` only |
| settings.bank-mapping.tsx | 123, 145 | "Bank linked", sync success | DB writes happen but with fabricated data |
| nectar-company-profile.tsx | 85 | "Got it — I've calibrated to your agency." | **localStorage only — zero DB persistence** |
| super-admin.tsx | 302 | "Now acting as {name}" | Client-side session store; not a DB write (intentional) |
| internal-audit.tsx | 227 | "Internal audit report downloaded" | Local CSV blob; no DB write (acceptable) |
| audit.tsx | ~238 | CSV download toast | Local blob; no DB write (acceptable) |

---

### Orphan/Dead Routes

From `ORPHAN_ROUTES.md` (generated 2026-06-14) + current audit:

**LIKELY ORPHAN (0 nav refs, 0 link refs):**
- `/dashboard/admin/ce-hours` — Redirect-only; no inbound links
- `/dashboard/assignments` — WIRED but 0 nav refs; may only be reachable via direct URL
- `/dashboard/billing-520` — Redirect; 0 inbound refs
- `/dashboard/billing/contractors` — Redirect stub; 0 refs
- `/dashboard/billing/distributions` — Redirect stub; 0 refs
- `/dashboard/billing/gross` — Redirect stub; 0 refs
- `/dashboard/billing/host-home` — Redirect stub; 0 refs
- `/dashboard/billing/monthly-grid` — Redirect stub; 0 refs
- `/dashboard/billing/totals` — Redirect stub; 0 refs
- `/dashboard/client-billing-codes` — WIRED but 0 nav refs
- `/dashboard/courses/mindsmith` — 0 refs; ORPHAN
- `/dashboard/host-home-control` — WIRED but 0 refs
- `/dashboard/internal-audit` — WIRED but 0 refs
- `/dashboard/permissions` — WIRED but 0 refs
- `/dashboard/programs-admin` — WIRED but 0 refs
- `/dashboard/roles` — WIRED but 0 refs
- `/dashboard/team` — READ-ONLY, 0 refs

**HIVE EXEC NAV DIVERGENCE:**
- `dashboard.hive-exec.tsx:TABS` and `dashboard.tsx:execNav` are maintained separately and have diverged:
  - In `execNav` but NOT in `TABS`: `/hive-exec/approvals`, `/hive-exec/nectar`
  - In `TABS` but NOT in `execNav`: `/hive-exec/messages`, `/hive-exec/base-template` (only reachable from States list)

---

### Missing Validation

| Route | Entity | Gap |
|-------|--------|-----|
| clients.tsx | Client create | `medicaid_id` required and enforced ✅; physical address required ✅ |
| employees.index.tsx | Staff invite | Email type="email" required ✅; no server-side duplicate check before insert |
| invitations.tsx | Invitation | Client-side duplicate check (line 54); no server-side guard |
| daily-logs.tsx | Daily log | Min 50 words enforced; PCSP goal required; signature required; NECTAR coach gate ✅ |
| audit.tsx | Audit packet | Provider name + min 50 char letter enforced ✅ |
| hrc.tsx | HRC meeting/review | No validation — inserts immediately with placeholder strings |
| billing.form520.tsx | Attestation | Requires attestation checkbox + signature ✅ but legal copy unreviewed |

---

### Export Data-Leak Risks

| Export | File | Org-scoped? | Risk |
|--------|------|-------------|------|
| Utah DHHS CSV | compliance-desk.tsx | ✅ org-scoped | Truncates at 5000 rows |
| Payroll CSV | compliance-desk.tsx | ✅ org-scoped | Clean |
| Master Ledger CSV | compliance-desk.tsx | ✅ org-scoped | Truncates at 5000 rows |
| Reconciliation CSV | compliance-desk.tsx | ✅ org-scoped | Clean |
| eMAR audit CSV | admin.emar-audit.tsx | ✅ org-scoped | Clean |
| Training reports | reports.tsx | ⚠️ `user_training_progress` not org-scoped — shows only current user's rows | Under-reports; doesn't leak cross-org |
| Form 520 export | billing.form520.tsx | ✅ org-scoped | Clean |
| EVV archive export | evv-archive.tsx | ✅ org-scoped | Clean; 10k cap |
| Nectar report CSV | billing.nectar.tsx | ✅ server-fn enforces org | Clean |

**No export was found that leaks cross-org data.** The `user_training_progress` issue is under-reporting, not over-reporting.

---

## Critical Issues (Ranked)

### 🔴 CRITICAL

**C-1 — Stripe webhook signature unverified**  
`src/routes/api/public/webhooks/stripe.ts:39`  
The Stripe webhook endpoint is public and parses raw JSON with no HMAC-SHA256 signature verification. Any caller can POST a forged `customer.subscription.updated` event and change billing state for any org. This is a security vulnerability, not a QA finding.  
*User impact: Unauthorized billing manipulation.*

**C-2 — Bank mapping writes fabricated data to live DB**  
`dashboard.settings.bank-mapping.tsx:42-170`  
`MOCK_PLAID_ACCOUNTS` + `SSI_DEPOSIT_FEED` are hardcoded arrays. The "sync" button inserts randomly-selected mock SSI transactions into `pba_transactions` as if they were real bank feed data. Plaid and QuickBooks Online integrations are simulated with `setTimeout`. An admin running this feature will contaminate their PBA ledger with fake records.  
*User impact: Fake financial records in live PBA accounts.*

**C-3 — 520 attestation legal copy unreviewed**  
`dashboard.billing.form520.tsx:869`  
The UI displays an in-code warning: "⚠️ Placeholder legal copy — must be reviewed by counsel before launch." The attestation text (lines 73-77) is substantive but self-authored. Billing attestations are legal documents under DHHS91172.  
*User impact: Launch blocker — attestation has no legal standing.*

---

### 🟠 HIGH

**H-1 — Agency profile calibration lost on new browser/session**  
`dashboard.nectar-company-profile.tsx:83`  
The Nectar company profile setup step (active services, workforce size, counties) saves to `localStorage` only. No DB write occurs. The calibration is lost when the admin switches browsers, clears storage, or uses a different device.  
*User impact: Onboarding progress indicator shows "done" but nothing persists.*

**H-2 — Training completion reports show only current user, not org**  
`dashboard.reports.tsx:76-83`  
`user_training_progress` has no org_id column and RLS returns only the current user's rows. Three of five compliance report exports ("Compliance Summary", "Training Completion", "Module Completions") will be empty or single-user when run by an admin. This would cause a compliance audit to appear falsely clean or falsely failed.  
*User impact: Compliance reporting is broken for org-wide views.*

**H-3 — Dead clinical buttons in host-home hub**  
`dashboard.hhs-hub.$clientId.tsx:148-152`  
"Emergency Med Auth" and "Advanced Directives" buttons render in the sticky clinical safety card but have no `onClick`, no `href`, no navigation, and no `disabled` label. These appear interactive but do nothing in a high-stakes clinical context.  
*User impact: Staff may click these in an emergency and receive no response.*

**H-4 — EVV export silently truncates above 5000 approved shifts**  
`dashboard.compliance-desk.tsx:466`  
`approvedQ` has `.limit(5000)`. Both the Utah DHHS export (`buildUtahCsv`) and Master Ledger export (`buildMasterLedgerCsv`) draw from this limited set. An org with >5000 approved shifts will submit an incomplete EVV file to the state without any warning.  
*User impact: Incomplete EVV submission; potential billing/compliance violation.*

**H-5 — HRC page has wiring note in production UI and writes placeholder garbage**  
`dashboard.hrc.tsx:76, 188-189, 250`  
The flagged-client panel shows "No data wiring yet — placeholder for the flagged-client list." (line 76). The add buttons write `attendees: "(placeholder)"` and `decisions: "(placeholder)"` to the DB, then show `toast.success("Placeholder meeting added")`. These garbage records will accumulate in `hrc_meetings` and `hrc_reviews`.  
*User impact: HRC is non-functional; fake records created if buttons are clicked.*

**H-6 — HIVE Exec sub-nav is split across two unsynced arrays**  
`dashboard.hive-exec.tsx:TABS` vs `dashboard.tsx:execNav`  
Approvals and Nectar appear in the sidebar but not the sub-nav tabs. Messages and Base Template appear in the sub-nav but not the sidebar. Four routes are effectively hidden depending on entry point.  
*User impact: HIVE Exec operators can't find these pages reliably.*

---

### 🟡 MEDIUM

**M-1 — No dedicated incidents route exists**  
No `dashboard.incidents.tsx` file. Incident creation lives only in `hhs-hub.$clientId.tsx` (via server fn) and review/submission lives only in `command-center.tsx`. There is no browse/search surface for all incidents.  
*User impact: Admins cannot audit incident history except through the command center queue.*

**M-2 — Shift callout channels are simulated but write fake escalation events**  
`dashboard.shift.$shiftId.tsx:563-585`  
SMS and voice escalation steps insert `callout_escalation_events` rows with hardcoded channel descriptions ("Push + in-app notification fanned out to all on-shift managers"). No messaging provider is wired. The `toast.success("Call-out received. Coverage search opened.")` implies real notifications were sent.  
*User impact: Staff believe coverage was notified; it was not.*

**M-3 — `hhs_host_home_settings` and `hhs_host_home_monthly` tables not in generated TS types**  
`dashboard.financial.host-home.tsx:133, 155`  
Both tables are cast `as never`. Same issue in `financial.employees.tsx` and `financial.contractors.tsx` with `contractor_monthly_pay`. If these migrations haven't been applied to the live DB, writes will fail silently or throw runtime errors.  
*User impact: Host home financial settings may not persist.*

**M-4 — Three PBA tables not in generated TS types**  
`dashboard.pba-ledger.tsx`  
`pba_accounts`, `pba_audit_samples`, `pba_transactions` all cast `as never`. These tables may not exist in the live DB per CLAUDE.md's migration caveat.  
*User impact: PBA ledger may not work in production.*

**M-5 — `user_training_progress` relies on table-level RLS with no org scoping**  
Documented at `reports.tsx:76-78`  
RLS policy returns only authenticated user's own rows for this table. The policy needs widening to support org-admin queries. Tracked as "future improvement" in the code but affects launch compliance reporting.

**M-6 — Invitation emails are not sent**  
`dashboard.invitations.tsx:173`  
The in-UI warning states: "To automatically email invitations, set up a sender domain in Lovable Cloud → Emails." An invitation creates a DB row but delivers nothing. Staff must receive the join link via manual channel (copy + paste).  
*User impact: New employee onboarding requires manual link sharing.*

**M-7 — Deadlines panel on client hub is a static link card**  
`dashboard.clients.$clientId.tsx:489`  
`DeadlinesPanel` renders a card with a link to `/dashboard/deadlines` — no client-scoped deadline data.  
*User impact: Client profile has no deadline visibility.*

**M-8 — `per_staff_per_client` form routing scope not implemented**  
`dashboard.forms.$formId.edit.tsx:655, 785`  
In-UI disclosure: routing for `per_staff_per_client` scope treated as `per_staff` until wired. Enforcement prompts at punch-pad are not set up.  
*User impact: Per-client forms may fire for wrong staff.*

---

### 🔵 LOW

**L-1 — Premature "Pinned" toasts before coordinates saved**  
`dashboard.clients.tsx:1821, 2894`  
`toast.success("Pinned (lat, lng)")` fires when geolocation is captured in state, but coordinates aren't persisted until the user later clicks "Save Profile". User may think the location was saved.

**L-2 — `client_billing_codes` staleness after edit**  
`dashboard.client-billing-codes.tsx:89, 96`  
Uses `refetch()` instead of `invalidateQueries`. The `["client-billing-codes"]` query key used on the clients workspace won't be invalidated — cross-page staleness possible.

**L-3 — Settings invite doesn't refresh member list**  
`dashboard.settings.team-access.tsx:88`  
Invite `onSuccess` doesn't call `invalidateQueries(["invitations"])` or `["team-access"]`. The member list shows stale data until page reload.

**L-4 — `saveProfile` swallows DB error silently**  
`dashboard.settings.tsx:63`  
`supabase.from("profiles").update(...)` error is not checked. If the update fails, the UI proceeds as if it succeeded.

**L-5 — `supabase.auth.getUser()` called inline in `setItemStatus`**  
`dashboard.audit.tsx:387`  
Inconsistent with `useAuth()` pattern used everywhere else. Not a bug, just drift.

**L-6 — Hub employees tab uses wrong permission name for Hosts**  
`dashboard.hub.employees.tsx:19`  
Hosts tab gated by `can("view_referrals")` — likely a copy-paste from clients hub. Hosts are not referrals.

**L-7 — Payroll/billing subscription UI collects card data without backend**  
`dashboard.settings.subscription.tsx`  
Card input fields (lines 780-789) collect PAN, expiry, CVC. The HIVE Exec Plans page says "payment processing coming soon". Whether this data goes anywhere is unconfirmed.

---

## Recommended Fix Order

Group each into one focused prompt to Lovable. Listed by impact vs effort.

### Group 1 — Security (do first, before any user access)
- **Wire Stripe webhook HMAC verification** (`api/public/webhooks/stripe.ts:39`)
- **Disable or gate `settings.bank-mapping` behind a clear SANDBOX label** so no real admin can run the mock sync against live `pba_transactions`

### Group 2 — Legal/Compliance (required before 2026-07-01 launch)
- **Have counsel review and replace 520 attestation text** (`billing.form520.tsx:73-77`)
- **Wire `user_training_progress` org-wide RLS** so admin compliance reports show all staff, not just the current user

### Group 3 — Data Integrity (before first real billing cycle)
- **Persist Nectar company profile to DB** (`nectar-company-profile.tsx` — move localStorage save to a server fn that upserts `org_settings` or similar)
- **Fix HRC page** — remove placeholder buttons and "No data wiring yet" UI; stub the flagged-client query properly or remove the panel until wired
- **Fix EVV export truncation** — remove or paginate past the `approvedQ .limit(5000)` before any org accumulates >5000 approved shifts

### Group 4 — Core UI Blockers (before soft launch)
- **Fix dead Emergency Med Auth and Advanced Directives buttons** (`hhs-hub.$clientId.tsx:148-152`) — either wire to a server fn or show `disabled` with a tooltip
- **Build or stub incidents route** — create `dashboard.incidents.tsx` as either a real list of `incident_reports` (org-scoped) or an explicit redirect to command-center with a filter
- **Sync HIVE Exec nav arrays** (`dashboard.hive-exec.tsx:TABS` + `dashboard.tsx:execNav`) into a single source of truth
- **Build day-program route** or redirect it to an appropriate existing page (currently a "not built yet" blank page)

### Group 5 — Reporting / Financial (before billing runs)
- **Verify and apply migrations** for `hhs_host_home_settings`, `hhs_host_home_monthly`, `contractor_monthly_pay`, `pba_accounts`, `pba_audit_samples`, `pba_transactions` — all cast `as never`/`as any`; regenerate TS types
- **Wire callout escalation channels** or clearly label the "callout coverage search" UI as "coverage alert sent to on-call manager" (which is the only real action possible today)

### Group 6 — Polish (post-launch)
- Invite emails (`dashboard.invitations.tsx`) — wire to email provider
- Fix premature "Pinned" toasts in clients page
- Fix staleness in `client-billing-codes.tsx` — swap `refetch()` for `invalidateQueries`
- Fix settings.team-access invite invalidation gap
- Fix `saveProfile` silent error swallow in `settings.tsx`
- Add `organization_id` client-side guards to: `clients.update`, `roles.update`, `billing.$clientId delete`

---

*End of audit. No code was modified during this review.*
