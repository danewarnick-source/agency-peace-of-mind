
---

## 4. Server Functions

All server functions use `createServerFn` from `@tanstack/react-start`. All are gated with the `requireSupabaseAuth` middleware (auth-middleware) as a minimum. Additional org-level access is enforced via `requireOrgMembership(supabase, userId, orgId, role)` and/or SQL RPC helpers (`can_view_staff_pii`, `can_view_client_intake`). Add-on assertions are done via `assertAddonForOrg` in `entitlements.server.ts`.

### src/lib/agency-health.functions.ts
- **`getAgencyHealthSnapshot`** — POST — `{ organizationId: uuid }` — Reads aggregate health metrics for an org (shifts, compliance, billing). Gate: `requireOrgMembership(..., "employee")`.

### src/lib/ai-coach.functions.ts
- **`evaluateShiftNote`** — POST — `{ shiftNoteId, text, ... }` — Sends shift note text to AI coach for quality evaluation. Gate: `requireSupabaseAuth` only; no org membership check (⚠️ bypasses org membership, relies on row-level ownership in DB).
- **`draftShiftNote`** — POST — similar AI-draft fields — Generates a shift note draft from structured inputs via AI. Gate: `requireSupabaseAuth` only.
- **`draftVarianceJustification`** — POST — variance context fields — Drafts a billing variance justification via AI. Gate: `requireSupabaseAuth` only.
- **`answerProceduralQuestion`** — POST — `{ question, context }` — AI answers procedural/compliance questions. Gate: `requireSupabaseAuth` only.
- **`scanNoteForTriggers`** — POST — note text fields — Scans shift note for clinical triggers. Gate: `requireSupabaseAuth` only.

### src/lib/audit-packet.functions.ts
- **`parseAndProduceAuditPacket`** — POST — `{ organization_id, provider_name, letter_text, audit_letter_path, fallback_fiscal_year }` — AI-parses an audit letter and creates an audit packet with items. Gate: `requireSupabaseAuth` only (⚠️ no explicit org membership check visible at top-level; relies on DB RLS for org scoping).

### src/lib/auditor-shares.functions.ts
- **`createAuditorShare`** — POST — `{ organization_id, packet_id, recipient_emails[1-10], starts_at, ends_at, message, share_all_items, packet_item_ids[], audit_file_ids[] }` — Creates a time-bounded auditor share for a packet. Gate: `requireSupabaseAuth` only.
- **`revokeAuditorShare`** — POST — `{ share_id }` — Marks a share as revoked. Gate: `requireSupabaseAuth` only.
- **`extendAuditorShare`** — POST — `{ share_id, ends_at }` — Extends share expiry. Gate: `requireSupabaseAuth` only.
- **`listMyAuditorShares`** — GET — no input — Lists shares belonging to the authenticated user. Gate: `requireSupabaseAuth` only.
- **`getAuditorShareView`** — POST — `{ share_id }` — Reads full packet/items accessible under a share. Gate: `requireSupabaseAuth` only.
- **`listSharesForPacket`** — POST — `{ packet_id }` — Lists all shares for a given packet. Gate: `requireSupabaseAuth` only.
- **`listActiveSharesForOrg`** — POST — `{ organization_id }` — Lists active shares for an org. Gate: `requireSupabaseAuth` only (⚠️ no explicit org membership check).

### src/lib/authoritative-sources.functions.ts
- **`ingestWebSource`** — POST — `{ organizationId, url, title, authoritativeKind, fiscalYear, effectiveStart, effectiveEnd, assistedSetup }` — Fetches and ingests a web URL as an authoritative source document. Gate: `requireOrgMembership(..., "manager")`.
- **`listAuthoritativeSources`** — POST — `{ organizationId }` — Returns list of authoritative source documents for an org. Gate: `requireSupabaseAuth` only (⚠️ org membership not explicitly called; relies on RLS).
- **`markAsAuthoritativeSource`** — POST — `{ documentId, authoritativeKind, isAuthoritative, assistedSetup }` — Toggles authoritative status on a document; resolves org from DB row then checks membership. Gate: `requireOrgMembership(..., "manager")`.
- **`setSourceIgnoreState`** — POST — `{ documentId, action: "ignore"|"duplicate"|"reactivate", reason, duplicateOfId }` — Marks a source as ignored/duplicate/reactivated. Gate: `requireOrgMembership(..., "manager")`.
- **`listRequirements`** — POST — `{ organizationId, origin?, category? }` — Lists requirements derived from authoritative sources. Gate: `requireSupabaseAuth` only.
- **`upsertRequirement`** — POST — `{ id?, organizationId, sourceDocumentId?, origin, requirementKey, title, description, category, sourceCitation, appliesTo }` — Creates or updates a compliance requirement. Gate: `requireOrgMembership(..., "manager")`.
- **`deleteRequirement`** — POST — `{ id }` — Deletes a requirement; resolves org from row. Gate: `requireOrgMembership(..., "manager")`.
- **`setRequirementReviewStatus`** — POST — `{ id, status: "confirmed"|"removed"|"needs_attention", attestStatement? }` — Sets review status on a requirement. Gate: `requireOrgMembership(..., "manager")`.
- **`verifyRequirement`** — POST — (further fields in file) — Verifies a requirement against gathered evidence. Gate: not traced further but file follows same pattern.

### src/lib/billing-budget-parse.functions.ts
- **`parseClientBudgetDocument`** — POST — `{ storagePath, mimeType }` — AI-parses a PDF budget document and extracts structured billing rows (plan_number, service_code, rate_per_unit, max_units, etc.). Gate: `requireSupabaseAuth` only (⚠️ no org check; caller supplies storage path directly).

### src/lib/bulk-import.functions.ts
- **`bulkImportRoster`** — POST — `{ kind: "employee"|"client", organizationId, rows[1-500], customFields[] }` — Bulk-upserts employee or client records from CSV-like row array; creates teams as needed. Gate: `requireSupabaseAuth` only; checks caller's `organization_members.role` via `supabaseAdmin` (manager/admin required internally, but not via standard `requireOrgMembership`).

### src/lib/celebrations.functions.ts
- **`fireCelebration`** — POST — `{ organizationId, ... }` — Creates a celebration event for an org. Gate: `requireOrgMembership(..., "employee")`.

### src/lib/client-hr.functions.ts
- **`getClientIntakeChecklist`** — GET — `{ organization_id, client_id }` — Returns client intake checklist; guarded by `can_view_client_intake` RPC in SQL. Gate: `requireSupabaseAuth`; RPC guard in DB.

### src/lib/company-overview.functions.ts
- **`getCompanyOverview`** — POST — `{ organizationId }` — Returns high-level company/org overview metrics. Gate: `requireOrgMembership(..., "employee")`.

### src/lib/custom-fields.functions.ts
- **`getCustomFields`** — POST — `{ organizationId, entityType?, entityId? }` — Lists custom field definitions and values. Gate: `requireSupabaseAuth` only.
- **`setCustomFieldValue`** — POST — `{ organizationId, entityType, entityId, fieldKey, value }` — Writes a custom field value. Gate: `requireSupabaseAuth` only (⚠️ no membership check traced).

### src/lib/employees.functions.ts
- **`createEmployeeManually`** — POST — `CreateEmployeeInput` schema (name, email, role, org, etc.) — Creates a new employee user+membership. Gate: `requireSupabaseAuth`; checks caller role internally via `supabaseAdmin`.
- **`adminResetEmployeePassword`** — POST — `ResetInput` (userId, orgId) — Issues a password reset for a given employee. Gate: `requireSupabaseAuth`; internal admin check.

### src/lib/entitlements.functions.ts
- **`getMyEntitlements`** — GET — no input — Returns current user's org subscription tier and add-ons. Gate: `requireSupabaseAuth` only.

### src/lib/external-compliance.functions.ts
- **`listExternalRequirements`** — POST — `{ organizationId, system? }` — Lists requirements from external compliance systems. Gate: `requireOrgMembership(..., "employee")`.
- **`setRequirementClassification`** — POST — classification fields — Sets classification on an external requirement; resolves org from row. Gate: `requireOrgMembership(..., "manager")`.
- **`attestExternalCompletion`** — POST — attestation fields — Records employee attestation of external requirement completion. Gate: `requireOrgMembership(..., "employee")`.
- **`autoClassifyRequirements`** — POST — `{ organizationId }` — AI-classifies unclassified external requirements. Gate: `requireOrgMembership(..., "manager")`.

### src/lib/financial-revenue.functions.ts
- **`getBilledRevenueByYear`** — POST — `{ organizationId, year }` — Returns billed revenue summary by year. Gate: `requireOrgMembership(..., "admin")` + `assertAddonForOrg(..., "nectar_infusion")`.
- **`listBilledManualEntries`** — POST — `{ organizationId }` — Lists manual billing entries. Gate: `requireOrgMembership(..., "admin")`.
- **`upsertBilledManualEntry`** — POST — billing entry fields — Creates or updates a manual billing record. Gate: `requireOrgMembership(..., "admin")`.
- **`deleteBilledManualEntry`** — POST — `{ organizationId, entryId }` — Deletes a manual billing record. Gate: `requireOrgMembership(..., "admin")`.

### src/lib/hhs.functions.ts
- **`saveDailyRecord`** — POST — `{ organizationId, clientId, date, ... }` — Creates/updates a daily HHS record. Gate: `requireOrgMembership(..., "employee")`.
- **`listDailyRecords`** — POST — `{ organizationId }` — Lists all daily records. Gate: `requireSupabaseAuth` only.
- **`saveEmarLog`** — POST — `{ organizationId, clientId, medicationId, ... }` — Saves an eMAR medication administration log. Gate: `requireOrgMembership(..., "employee")`.
- **`setAttendance`** — POST — `{ organizationId, clientId, date, ... }` — Sets monthly attendance record. Gate: `requireOrgMembership(..., "employee")`.
- **`listAttendance`** — POST — org/date filter fields — Lists attendance records. Gate: `requireSupabaseAuth` only.
- **`savePrnForm`** — POST — PRN fields — Saves a PRN medication form. Gate: `requireOrgMembership(..., "employee")`.
- **`saveIncidentReport`** — POST — incident fields including `incident_address` — Saves an incident report. Gate: `requireOrgMembership(..., "employee")`.
- **`listEmarLogs`** — POST — `{ organizationId }` — Lists eMAR logs. Gate: `requireSupabaseAuth` only.
- **`listPrnForms`** — POST — `{ organizationId }` — Lists PRN forms. Gate: `requireSupabaseAuth` only.
- **`listIncidents`** — POST — `{ organizationId }` — Lists incident reports. Gate: `requireSupabaseAuth` only.
- **`markIncidentFiled`** — POST — `{ organizationId, incidentId }` — Marks an incident as filed. Gate: `requireOrgMembership(...)`.

### src/lib/hive-exec-admin.functions.ts (HIVE Executive admin panel — all gated via `ensureExecutive()` internal check)
- **`createCompany`** — POST — `{ name, adminEmail, adminFullName, plan, status, notes }` — Creates org + admin user + subscription. Gate: `requireSupabaseAuth` + `ensureExecutive()`.
- **`listAllMembers`** — GET — no input — Lists all members across all orgs. Gate: `requireSupabaseAuth` + `ensureExecutive()`.
- **`updateMember`** — POST — member update fields — Updates a member's role/status. Gate: `requireSupabaseAuth` + `ensureExecutive()`.
- **`listHiveExecutives`** — GET — no input — Lists all active HIVE executives. Gate: `requireSupabaseAuth` + `ensureExecutive()`.
- **`setHiveExecutiveByEmail`** — POST — `{ email, grant: boolean }` — Grants or revokes HIVE Executive status. Gate: `requireSupabaseAuth` + `ensureExecutive()`.
- **`listAuditLog`** — GET — no input — Returns HIVE executive audit log entries. Gate: `requireSupabaseAuth` + `ensureExecutive()`.

### src/lib/hive-exec.functions.ts (HIVE Exec portal — same `ensureExecutive` pattern)
- **`checkHiveExecutive`** — GET — no input — Checks if caller is an active HIVE Executive. Gate: `requireSupabaseAuth` only (returns boolean, no sensitive data).
- **`getExecKpis`** — GET — no input — Returns platform-wide KPIs. Gate: `requireSupabaseAuth` + exec check internally.
- **`listCompanies`** — GET — no input — Lists all companies/orgs. Gate: `requireSupabaseAuth` + exec check.
- **`getCompanyDetail`** — POST — `{ organizationId }` — Returns full detail for one company. Gate: `requireSupabaseAuth` + exec check.
- **`upsertSubscription`** — POST — subscription patch fields — Updates an org's subscription plan/status. Gate: `requireSupabaseAuth` + exec check.
- **`listAllTickets`** — GET — no input — Lists all support tickets. Gate: `requireSupabaseAuth` + exec check.
- **`updateTicket`** — POST — ticket update fields — Updates a support ticket. Gate: `requireSupabaseAuth` + exec check.

### src/lib/hive-tickets.functions.ts
- **`listPlatformTickets`** — GET — no input — Lists tickets belonging to the authenticated user's org. Gate: `requireSupabaseAuth` only.
- **`createPlatformTicket`** — POST — `{ subject, body, priority?, category? }` — Creates a new support ticket. Gate: `requireSupabaseAuth` only.
- **`updatePlatformTicket`** — POST — `{ ticketId, status?, resolution? }` — Updates ticket status/resolution. Gate: `requireSupabaseAuth` only.

### src/lib/hr-staff.functions.ts
- **`getStaffPii`** — GET — `{ organization_id, staff_id }` — Returns PII for a staff member (ssn_last4, dob, home_address, rates). Gate: `requireOrgMembership(...)` + `can_view_staff_pii` RPC.
- **`listStaffPii`** — GET — `{ organization_id }` — Lists PII for all staff in an org. Gate: `requireOrgMembership(...)`.
- **`getStaffChecklist`** — GET — `{ organization_id, staff_id }` — Returns checklist items for a staff member. Gate: `requireOrgMembership(...)` + `can_view_staff_pii` RPC.
- **`upsertChecklistCompletion`** — POST — `{ organization_id, staff_id, item_key, completed, ... }` — Records checklist item completion. Gate: `requireOrgMembership(...)`.
- **`updateStaffPii`** — POST — PII update schema (name, ssn_last4, dob, address, rates) — Updates staff PII. Gate: `requireOrgMembership(...)` + `can_view_staff_pii` RPC.
- **`listHrDocuments`** — GET — `{ organization_id, staff_id }` — Lists HR documents for a staff member. Gate: `requireOrgMembership(...)`.
- **`createHrDocumentUploadUrl`** — POST — upload request fields — Returns a signed upload URL for an HR document. Gate: `requireOrgMembership(...)`.

### src/lib/internal-audit.functions.ts
- **`runInternalAudit`** — POST — `{ organizationId, ... }` — Runs an internal QA audit against org data. Gate: `requireSupabaseAuth` + `assertAddonForOrg(..., "internal_audit")`.
- **`listAuditableStaff`** — GET — `{ organizationId }` — Lists staff available for audit selection. Gate: `requireSupabaseAuth` + `assertAddonForOrg(..., "internal_audit")`.

### src/lib/lifecycle.functions.ts
- **`archiveEntity`** — POST — `{ entityType, entityId, organizationId }` — Archives an entity (client/employee). Gate: `requireSupabaseAuth` only (⚠️ org membership not explicitly traced).
- **`deleteEntity`** — POST — `{ entityType, entityId, organizationId }` — Deletes an entity. Gate: `requireSupabaseAuth` only.

### src/lib/login.functions.ts
- **`signInWithUsername`** — POST — `{ identifier, password }` — Resolves username→email and signs in; returns session tokens. Gate: **No `requireSupabaseAuth`** (pre-auth endpoint — intentionally unauthenticated). Hardens against user enumeration.

### src/lib/medications.functions.ts
- **`parseMedicationsAI`** — POST — medication text/PDF fields — AI-parses medication instructions from uploaded doc. Gate: `requireSupabaseAuth` only.

### src/lib/nectar-approvals.functions.ts
- **`listPendingHiveExecApprovals`** — GET — no input — Lists requirement mappings pending HIVE exec approval. Gate: `requireSupabaseAuth` only (⚠️ relies on exec check internally or via DB RLS).
- **`hiveExecApproveRequirement`** — POST — `{ requirementId, decision }` — Records an exec approval/rejection on a requirement. Gate: `requireSupabaseAuth` only.

### src/lib/nectar-documents.functions.ts
- **`detectAndOfferActions`** — POST — `{ organizationId, documentId }` — Detects document type and returns available NECTAR capability actions. Gate: `requireOrgMembership(...)`.
- **`ingestDocument`** — POST — `{ organizationId, storagePath, title, ... }` — Ingests a document into nectar_documents and extracts metadata. Gate: `requireOrgMembership(..., "employee")`.
- **`proposeRequirementMappings`** — POST — `{ requirementId, ... }` — AI-proposes mappings from document to requirements; resolves org from row. Gate: `requireOrgMembership(..., "manager")`.

### src/lib/nectar-engine.functions.ts
*(Larger file; pattern consistent with above)*
- Functions for running the NECTAR compliance engine against org data. Gate: `requireOrgMembership` where applicable.

### src/lib/nectar-guide.functions.ts
- **`planNectarGuide`** — POST — guide planning fields — Generates a guided onboarding/compliance plan. Gate: `requireOrgMembership(...)` (dynamically imported).

### src/lib/nectar-help.functions.ts
- **`askNectarHelp`** — POST — `{ organizationId, question }` — Answers a plain-language help question using NECTAR. Gate: `requireOrgMembership(..., "employee")`.

### src/lib/nectar-reports.functions.ts
- **`askNectarReport`** — POST — `{ organizationId, query }` — Generates a natural-language report from org data. Gate: `requireOrgMembership(...)` (dynamically imported).

### src/lib/nectar-staff.functions.ts
- **`askNectarStaff`** — POST — `{ organizationId, staffId?, query }` — Answers a staff-related question using NECTAR. Gate: `requireOrgMembership(...)`.

### src/lib/nectar-document-actions.functions.ts
- Functions dispatching capability registry actions (add_to_authoritative_sources, propose_staff_checklist_from_document). Gate: `requireOrgMembership` where writes occur.

### src/lib/pdf-import.functions.ts
- **`extractClientFromPdf`** — POST — `{ storagePath, orgId }` — AI-extracts client intake data from a PDF. Gate: `requireSupabaseAuth` only.
- **`commitClientFromPdf`** — POST — `{ orgId, extractedData }` — Writes extracted client data to DB. Gate: `requireSupabaseAuth` only (⚠️ no explicit org membership check traced).

### src/lib/provider-ledger.functions.ts
- LEDGER_CATEGORIES and related functions for provider ledger entries. Gate: `requireSupabaseAuth` + membership per call.

### src/lib/saved-reports.functions.ts
- **`listSavedReports`** — POST — `{ organizationId }` — Lists saved NECTAR reports. Gate: `requireOrgMembership(..., "manager")`.

### src/lib/state-base-versions.functions.ts
- **`listBaseTemplateVersions`** — GET — no input — Lists base template versions (platform-level, not org-scoped). Gate: `requireSupabaseAuth` only.
- **`getCurrentBaseTemplateVersion`** — GET — no input — Returns the current active base template version. Gate: `requireSupabaseAuth` only.

### src/lib/state-onboarding.functions.ts
- **`getOrCreateOnboardingSession`** — POST — `{ orgId, state }` — Returns or creates a state onboarding session. Gate: `requireSupabaseAuth` only.
- **`listOnboardingSessions`** — GET — `{ orgId }` — Lists onboarding sessions for an org. Gate: `requireSupabaseAuth` only.

### src/lib/state-requirements.functions.ts
- **`listStateRequirementSources`** — GET — filter fields — Lists state requirement source documents. Gate: `requireSupabaseAuth` only.
- **`createStateRequirementSource`** — POST — source fields — Creates a state-level requirement source. Gate: `requireSupabaseAuth` only.

### src/lib/state-structural-gaps.functions.ts
- **`listStructuralGaps`** — GET — filter fields — Lists structural compliance gaps. Gate: `requireSupabaseAuth` only.
- **`fileStructuralGap`** — POST — gap fields — Files a structural gap finding. Gate: `requireSupabaseAuth` only.

### src/lib/state-templates.functions.ts
- **`listPlatformStates`** — GET — no input — Lists all supported platform states. Gate: `requireSupabaseAuth` only.
- **`setStateStatus`** — POST — `{ stateCode, status }` — Sets a state's active/inactive status (platform admin). Gate: `requireSupabaseAuth` only (⚠️ no exec check traced — potential unguarded write).

### src/lib/team-access.functions.ts
- **`listTeamAccess`** — GET — `{ organizationId }` — Lists team/member access grants. Gate: `requireSupabaseAuth` only.
- **`setMemberGrants`** — POST — `{ organizationId, memberId, grants[] }` — Sets access grants for a member. Gate: `requireSupabaseAuth` only (⚠️ no org membership check traced).

### src/lib/vector-search.functions.ts
- **`searchTimesheetsByVector`** — POST — `{ organizationId, query, limit? }` — Vector-similarity search over timesheets. Gate: `requireOrgMembership(..., "employee")`.

---

## 5. Database

All tables are in schema `public` with RLS enabled unless noted.

### Core Identity & Auth

- **`profiles`** — `id` (FK auth.users), `email`, `full_name`, `agency_name`, `username`, `account_status`, `hourly_rate`, `daily_rate`, **`ssn_last4` char(4)**, **`date_of_birth` date**, **`home_address` text**, `created_at`
  - PII columns `ssn_last4`, `date_of_birth`, `home_address`, `hourly_rate`, `daily_rate` are column-level privilege-revoked from `authenticated` role; accessible only via `can_view_staff_pii` SECURITY DEFINER RPC.
  - RLS: "select own profile" (`auth.uid() = id`); "update own profile" (`auth.uid() = id`); "insert own profile" (own); "org managers read/update member profiles" (via `is_org_admin_or_manager`).

- **`organizations`** — `id`, `name`, `slug` (UNIQUE), `logo_url`, `created_by`, `created_at`, `updated_at`
  - RLS: members read (`is_org_member`); admins update/delete; any authenticated can insert.

- **`organization_members`** — `id`, `organization_id`, `user_id`, `role` (app_role enum), `job_title`, `manager_id`, `active`, `is_company_executive`, `created_at`
  - RLS: members read their org; admins manage all; self-insert allowed.

- **`invitations`** — invite token, org, email, role, expiry
  - RLS: admins manage all; invitee reads own token.

- **`hive_executives`** — `id`, `user_id` (UNIQUE), `active`, `granted_by`, `granted_at`, `notes`
  - RLS: only `is_hive_executive` users can read; only HIVE exec can grant/revoke (via SECURITY DEFINER `set_hive_executive`).

- **`provider_tenants`** — `id`, `owner_email`, `...` (legacy tenant model)
  - RLS: super admins manage all; owners read own.

- **`tenant_features`** — `id`, `tenant_id` (FK provider_tenants), `feature_key` (FK system_features), `is_enabled`
  - RLS: super admins only (manage all).

- **`system_features`** — `feature_key` PK, label, description (reference table).

### Clients

- **`clients`** — `id`, `organization_id`, `first_name`, `last_name`, **`date_of_birth` date**, **`medicaid_id` text**, **`phone_number` text**, **`physical_address` text**, **`diagnosis` text**, `feature_config` jsonb, `created_at`
  - RLS: members read (`is_org_member` or super admin); managers write.

- **`client_medications`** — `id`, `organization_id`, `client_id`, medication fields (name, dosage, frequency, prescriber, etc.)
  - RLS: members read; managers write.

- **`client_documents`** — `id`, `organization_id`, `client_id`, `document_type`, `storage_path`, `title`, `date_of_birth` (copy), `created_at`
  - RLS: members read; managers write. Storage: `client-documents` bucket (private, 20 MB limit).

- **`client_intake_completion`** — `id`, `organization_id`, `client_id`, `item_key`, `completed_by`, `completed_at`
  - Guarded by `can_view_client_intake` RPC.

- **`client_belongings`** — `id`, `organization_id`, `client_id`, item details
  - RLS: members read; managers write.

- **`client_spending_log`** — `id`, `organization_id`, `client_id`, `shift_id`, `amount`, `category`, `receipt_path`
  - RLS: members read; managers write. Storage: `client-spending-receipts` bucket (private).

- **`client_approved_locations`** / **`client_approved_location_audit`** — approved geofence locations per client; audit log triggered via `log_approved_location_change()` SECURITY DEFINER trigger.

- **`hhs_daily_records`** / **`hhs_emar_logs`** / **`hhs_monthly_attendance`** / **`hhs_incident_reports`** / **`hhs_medical_logs`** / **`hhs_evacuation_drills`** / **`hhs_monthly_summaries`** / **`hhs_transfer_logs`** / **`hhs_client_inventories`** — HHS-specific clinical/operational records per client.
  - `hhs_emar_logs` contains medication administration data (PHI).
  - `hhs_incident_reports` contains `incident_address`.

- **`emar_logs`** — organization eMAR records.

- **`pba_accounts`** / **`pba_transactions`** / **`pba_audit_samples`** — Personal Banking Assistance (PBA/Trust Ledger) accounts, transactions, and audit samples.
  - RLS: members read; managers write.

- **`activity_reimbursement_requests`** — reimbursement requests with receipt storage path. Storage: `activity-receipts` bucket (private).

- **`respite_stays`** — respite service stays per client.

- **`els_usage_ledger`** — ELS service usage per client.

### Staff / HR

- **`hr_documents`** — `id`, `organization_id`, `staff_id`, `document_type`, `storage_path`, access metadata
  - RLS: managed by `can_view_staff_pii` gate; access logged in `hr_document_access_log`.

- **`hr_document_access_log`** — immutable audit log of HR document reads (SECURITY DEFINER trigger makes it append-only).

- **`staff_checklist_completion`** — per-staff completion records for checklist items.

- **`staff_certifications`** (legacy seed table) — `id`, `staff_name`, `role`, `certification`, `issued_date`, `expiration_date`, `status`
  - RLS: any authenticated can read (broad — legacy table).

- **`certifications`** — org-scoped certification records. RLS: "public verify cert" (SELECT open); "system issues cert" (INSERT open to authenticated).

- **`external_certifications`** — user-uploaded external certification files. Storage: `certificates` bucket (private, user-scoped paths).

- **`staff_nudges`** — manager-created nudges for staff. RLS: managers manage; staff read/update own.

- **`compliance_overrides`** — manager overrides on compliance checks. RLS: managers manage; staff read own.

### Scheduling & Shifts

- **`shifts`** — `id`, `organization_id`, `user_id`, `client_id`, `clock_in_time`, `clock_out_time`, `clock_in_lat`, `clock_in_long`, `clock_out_lat`, `clock_out_long`, `outside_geofence`, `device_fingerprint`, `status` (shift_status enum), `created_at`
  - RLS: own shifts or managers can read; own insert; own or managers update; managers delete.

- **`shift_notes`** — `id`, `shift_id`, `user_id`, `narrative_summary`, `goals_addressed[]`, `created_at`

- **`scheduled_shifts`** — pre-scheduled shift assignments.

- **`evv_timesheets`** — Electronic Visit Verification timesheet records.

- **`daily_logs`** — per-user daily log entries.

- **`shift_completeness_flags`** — flags for incomplete shifts.

- **`staff_assignments`** — staff-to-client/team assignments.

### Training & LMS

- **`training_modules`** (legacy seed) — `id`, `title`, `description`, `duration_minutes`, `progress`, `category`
- **`courses`** / **`course_modules`** / **`lessons`** / **`course_assignments`** / **`module_progress`** / **`lesson_progress`** / **`lesson_quiz_attempts`** — full LMS structure. Storage: `training-assets` bucket (public).
- **`training_programs`** / **`training_tracks`** / **`track_programs`** / **`track_assignments`** / **`program_assignments`** / **`program_acknowledgements`** / **`program_courses`** — program/track enrollment management.
- **`certification_types`** / **`user_training_progress`** / **`time_pay_categories`** / **`time_pay_settings`** — certification catalog and payroll-related training settings.

### Billing & Financial

- **`billing_submissions`** / **`billing_submission_audit_log`** / **`billing_submission_warnings`** — billing claim submissions with full audit trail.
- **`client_billing_codes`** — per-client authorized billing service codes.
- **`provider_authorized_codes`** — agency-level authorized billing codes.
- **`provider_ledger_entries`** — journal-style ledger entries for financial tracking.
- **`agency_bank_accounts`** / **`agency_bank_mappings`** — agency bank account info. RLS: members read; managers write.

### Audit & Compliance

- **`audit_packets`** / **`audit_packet_items`** / **`audit_files`** / **`audit_file_documents`** — audit packet structure for audit prep. Storage: `audit-documents` bucket (private).
- **`auditor_shares`** / **`auditor_share_items`** / **`auditor_share_access_log`** — time-bounded external auditor access with access log.
- **`nectar_requirements`** / **`nectar_requirement_mappings`** / **`nectar_requirement_approval_events`** / **`nectar_attestations`** — requirements engine state.
- **`nectar_documents`** — `id`, `organization_id`, `owner_kind`, `client_id`, `staff_id`, `document_type`, `category`, `title`, `parent_document_id`, `version`, `is_current`, `effective_start`, `effective_end`, `fiscal_year`, **`medicaid_id`**, `storage_path`, `created_at`
  - Storage: `nectar-documents` bucket (private). RLS: org members read.
- **`nectar_document_entities`** / **`nectar_extracted_fields`** — extracted entities and field values from NECTAR-parsed documents.
- **`nectar_guides`** / **`nectar_guide_tasks`** — guided onboarding/compliance task plans.
- **`nectar_reports`** / **`nectar_saved_reports`** / **`nectar_report_runs`** / **`nectar_report_schedules`** — NECTAR report management.
- **`internal_audit`** — (referenced in functions; full schema in later migration).
- **`submitted_forms`** — general submitted form data.
- **`incident_reports`** — organization incident reports (separate from HHS-specific).

### Platform / Super-Admin

- **`org_subscriptions`** — `id`, `organization_id` (UNIQUE), `plan` (sub_plan enum: starter/pro/enterprise/custom), `status` (sub_status: trial/active/canceled), `mrr_cents`, `renewal_date`, `trial_ends_at`, `started_at`, `canceled_at`, `notes`
  - RLS: only HIVE executives can read/write.

- **`hive_executive_audit_log`** — append-only log of all HIVE exec actions.

- **`hive_platform_tickets`** / **`org_support_tickets`** — platform-level support tickets.

- **`platform_states`** — supported US states with active/inactive status.

- **`state_templates`** / **`hive_base_template_versions`** / **`state_derived_requirements`** / **`state_requirement_sources`** / **`state_onboarding_sessions`** / **`state_structural_gaps`** — state compliance template and onboarding machinery.

- **`notifications`** — user notification records.

- **`teams`** — org teams (group/home). RLS: org members read; managers write.

- **`custom_field_definitions`** / **`custom_field_values`** — dynamic custom field schema per org.

### Miscellaneous

- **`celebration_events`** / **`celebration_acknowledgements`** / **`org_celebration_settings`** / **`user_celebration_mute`** — org celebration/recognition feature.

- **`role_permissions`** — per-org role permission overrides.

- **`profiles`** also has a `username` column for username-based login.

### SECURITY DEFINER Functions

| Function | Args | Returns | Purpose |
|---|---|---|---|
| `handle_new_user()` | trigger | trigger | Auto-creates profile row on auth.users INSERT |
| `is_org_member(_org, _user)` | uuid, uuid | boolean | RLS helper — avoids recursion |
| `has_org_role(_org, _user, _role)` | uuid, uuid, app_role | boolean | Role check for RLS policies |
| `is_org_admin_or_manager(_org, _user)` | uuid, uuid | boolean | Admin/manager check for RLS |
| `user_org_ids(_user)` | uuid | SETOF uuid | Returns all org IDs for a user |
| `issue_certificate_on_completion()` | trigger | trigger | Issues certification when course completed |
| `recalc_assignment_progress()` | trigger-like | void | Recalculates course assignment progress |
| `is_super_admin(_user)` | uuid | boolean | Super-admin check (legacy tenant system) |
| `accept_invitation(_token)` | text | void | Invitation acceptance — bypasses RLS |
| `generate_pba_audit_sample(_org)` | uuid | void | Generates random PBA audit sample rows |
| `clients_for_staff(_org, _staff)` | uuid, uuid | SETOF uuid | Returns client IDs accessible to a staff member |
| `restore_my_admin_role()` | — | void | Emergency restore of admin role for caller |
| `is_hive_executive(_user)` | uuid | boolean | Checks active HIVE executive status |
| `is_company_executive(_org, _user)` | uuid, uuid | boolean | Checks company executive flag |
| `set_company_executive(_membership_id, _grant)` | uuid, boolean | void | Grants/revokes company executive flag |
| `set_hive_executive(_user_id, _grant)` | uuid, boolean | void | Grants/revokes HIVE executive status |
| `log_approved_location_change()` | trigger | trigger | Immutable audit log of location changes |
| `can_view_staff_pii(_org, _staff, _viewer)` | uuid, uuid, uuid | boolean | PII access gate for staff records |
| `hr_document_access_log_immutable()` | trigger | trigger | Makes HR doc access log append-only |
| `get_hr_staff_checklist_base(_org)` | uuid | table | Returns checklist base items for an org |
| `can_view_client_intake(_org, _client, _viewer)` | uuid, uuid, uuid | boolean | PII access gate for client intake data |
| `get_hr_client_intake_base(_org)` | uuid | table | Returns client intake checklist base for an org |

### Storage Buckets

| Bucket ID | Public | Limit | Access Policy Summary |
|---|---|---|---|
| `certificates` | false | — | Users read/write own path (`uid` in folder[1]); managers read all in org |
| `training-assets` | true | — | Public read; managers upload/update/delete |
| `client_receipt_snapshots` | false | — | Org members read/upload/update; org admins delete |
| `client-documents` | false | 20 MB | (mime-type restricted) Org members via RLS |
| `client-photos` | true | 5 MB | Public read; org members write |
| `audit-documents` | false | — | Org members read their audit documents |
| `activity-receipts` | false | — | Org members read/write by org path prefix |
| `client-spending-receipts` | false | — | Org members read/write by org path prefix |
| `nectar-documents` | false | — | Org members read; org managers write |

---

## 6. NECTAR Capability Registry

Source: `src/lib/nectar-capability-registry.ts`

Detected document types: `staff_checklist`, `scope_of_work`, `insurance_certificate`, `training_certificate`, `policy_document`, `client_intake`, `unknown`.

### is_live = true (Active)

- **`add_to_authoritative_sources`** — "Add this to your authoritative sources" — applies_to: ALL types — handler: `add_to_authoritative_sources` — Keeps document in source-of-truth set.
- **`propose_staff_checklist`** — "Draft a trackable checklist from this for your review" — applies_to: `staff_checklist`, `scope_of_work` — handler: `propose_staff_checklist_from_document` — Extracts checklist items as pending draft entries.
- **`per_staff_tracking`** — "Open per-staff tracking for items in this checklist" — applies_to: `staff_checklist` — handler: `noop` — Opens per-staff roll-up in HR Admin tab; no server action dispatched.
- **`renewal_alerts`** — "Set renewal reminders for dates found in this document" — applies_to: `insurance_certificate`, `training_certificate`, `staff_checklist` — handler: `noop` — Surfaces upcoming expirations; dates pre-filled by NECTAR, human confirms.
- **`client_intake_checklist`** — "Open per-client intake tracking for items in this document" — applies_to: `client_intake`, `scope_of_work` — handler: `noop` — **Note: is_live=true in registry but comment header marks section as "DORMANT"; the `noop` handler means no actual server action dispatches.**

### is_live = false (Dormant)

- **`sow_requirement_mapping`** — "Map SOW clauses to platform requirements" — applies_to: `scope_of_work` — handler: `noop` — Links SOW clauses to platform requirements; not yet built.

---

## 7. Feature Gates & Toggles

### Tier / Add-on System (`org_subscriptions.plan` → `hive-tiers.ts`)

Tiers: `starter` (free), `pro` ($499/mo), `enterprise` ($1,299/mo), `custom` (negotiated).

| Add-on ID | Included in Tiers | UI Gate | Server Gate | Status |
|---|---|---|---|---|
| `nectar_infusion` | pro, enterprise, custom | `AddonLock` / `NectarInfusionLock` in components | `assertAddonForOrg` in `financial-revenue.functions.ts:48` | **ENFORCED** (UI: `src/components/nectar/addon-lock.tsx:42`, `src/routes/dashboard.command-center.tsx:1181`; server: `src/lib/financial-revenue.functions.ts:48`) |
| `internal_audit` | enterprise, custom | `AddonLock` in `src/routes/dashboard.internal-audit.tsx:507` | `assertAddonForOrg` in `internal-audit.functions.ts:107,631` | **ENFORCED** (UI + server) |
| `requirements_engine` | enterprise, custom | No `AddonLock` call found in routes | No `assertAddonForOrg` call found | **DECORATIVE** — defined in catalog but no enforcement found in code |
| `priority_support` | enterprise, custom | No `AddonLock` call found | No server check | **DECORATIVE** — label/catalog only |

**NECTAR Infusion localStorage override**: `window.localStorage.getItem("hive.nectar.infusion") === "on"` force-enables `nectar_infusion` add-on regardless of tier for demo/preview purposes (`src/hooks/use-entitlements.tsx:34-44`).

### Tenant Feature Flags (`tenant_features` table)

Source: `src/hooks/use-tenant-features.tsx`

Feature keys (type `FeatureKey`):

| Feature Key | Route Guarded | Enforced Via | Status |
|---|---|---|---|
| `overview` | `/dashboard` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** (`src/hooks/use-tenant-features.tsx`) |
| `daily_notes` | `/dashboard/daily-logs` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `dspd_controls` | `/dashboard/dspd-controls` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `emar_audit` | `/dashboard/admin/emar-audit` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `emar_pass` | `/dashboard/emar` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `pba_trust_ledger` | `/dashboard/pba-ledger` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `employees` | `/dashboard/employees` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `clients` | `/dashboard/clients` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `teams_homes` | `/dashboard/teams` | `routeToFeatureKey` + `useDisabledFeatures` | **ENFORCED** |
| `ai_assistance` | (no route mapping) | Defined in FeatureKey type but not in `routeToFeatureKey` switch | **PARTIALLY DECORATIVE** — stored/defined but no route-level enforcement found |

Note: `useDisabledFeatures` reads from `tenant_features` table (old provider_tenants model) not `org_subscriptions`. These are two parallel gating systems — tenants vs. orgs.

### Per-Client Feature Flags (`clients.feature_config` jsonb)

Source: `src/lib/client-features.ts`

| Client Feature Key | Tier Counterpart | Enforced | Read Site |
|---|---|---|---|
| `daily_notes` | `daily_notes` tier key | **ENFORCED** — tier gate takes precedence | `src/lib/client-features.ts`, `src/routes/dashboard.workspace.$clientId.tsx` |
| `emar` | `emar_pass` tier key | **ENFORCED** | `src/routes/dashboard.hhs-hub.$clientId.tsx:103`, `src/routes/dashboard.workspace.$clientId.tsx:104` |
| `attendance` | none | **ENFORCED** (per-client only, no tier override) | via `useClientFeature` |
| `trust_ledger` | `pba_trust_ledger` tier key | **ENFORCED** | via `useClientFeature` |
| `incident_forms` | none | **ENFORCED** (per-client only) | via `useClientFeature` |
| `scheduling` | none | **ENFORCED** (per-client only) | via `useClientFeature` |

All per-client feature enforcement is UI-side only (no server-function enforcement traced for `feature_config`).

---

## 8. Integrations

### Project Template
- **Lovable / TanStack Start** — `.lovable/project.json` schema v1, template `tanstack_start_ts_2026-05-12`. Build tooling: Vite 7, Cloudflare Workers (`@cloudflare/vite-plugin`).

### Supabase (`src/integrations/supabase/`)
- **Database + Auth**: `@supabase/supabase-js ^2.106.1`. Client (`client.ts`), server admin client (`client.server.ts`), auth middleware (`auth-middleware.ts`), org membership helper (`require-org.ts`), auth attacher (`auth-attacher.ts`), generated types (`types.ts`).
- **Storage**: 9 private/public buckets (see §5 above).
- **Auth**: Supabase Auth (email/password + invite flow). Custom username-based login via `signInWithUsername` server fn.
- **Lovable Cloud Auth**: `@lovable.dev/cloud-auth-js ^1.1.2` — Lovable platform SSO integration.

### AI / LLM
- No OpenAI, Anthropic, or other AI SDK found in `package.json`. AI calls are presumably made via fetch to an external endpoint or via a Supabase Edge Function (not visible in this repo). All `*AI*` / NECTAR functions call LLMs server-side but the HTTP client is not a named npm dependency.

### PDF Handling
- **`unpdf ^1.6.2`** — PDF text extraction (used in `pdf-import.functions.ts`, `billing-budget-parse.functions.ts`).

### Spreadsheet / CSV
- **`papaparse ^5.5.3`** — CSV parsing (bulk import).
- **`xlsx ^0.18.5`** — Excel file read/write.

### Mapping
- **`leaflet ^1.9.4`** — Client-side maps (geofencing, location display).

### No Payment Processor Found
- No Stripe, Paddle, or billing SDK in `package.json`. Subscription management (`org_subscriptions`) is manual — HIVE Executives set plan/status via the exec admin panel. Payment collection is described in `hive-tiers.ts` comments as "skeletoned" for later.

### No Email / SMS Integration Found
- No Resend, SendGrid, Twilio, or similar in `package.json`. Invitations use `supabaseAdmin.auth.admin.inviteUserByEmail()` (Supabase built-in). Auditor share recipient notifications have no email-dispatch code found.

### No Analytics / Monitoring Found
- No PostHog, Sentry, Segment, Mixpanel, or Datadog in `package.json`.

### MCP
- No MCP (Model Context Protocol) configuration found.

---

## Gaps / Not Found

- **`requirements_engine` and `priority_support` add-ons are DECORATIVE** — both are defined in `ADDON_CATALOG` and `TIER_CATALOG` but have zero enforcement call sites in either UI (`AddonLock`) or server (`assertAddonForOrg`).

- **`ai_assistance` tenant feature flag is not route-mapped** — defined as a `FeatureKey` but absent from the `routeToFeatureKey` function; cannot be disabled via the tenant feature system.

- **Auditor share email dispatch** — `createAuditorShare` accepts `recipient_emails[]` but no email-sending code is found. Emails are silently dropped.

- **`sow_requirement_mapping` capability** — registry entry exists (`is_live=false`, handler `noop`) with no backing implementation.

- **`client_intake_checklist` capability** — marked `is_live=true` in registry but handler is `noop`; effectively dormant despite the live flag.

- **`per_staff_tracking` and `renewal_alerts` capabilities** — `is_live=true` but both use `noop` handler; no server action is actually dispatched when selected.

- **No payment collection** — `org_subscriptions.mrr_cents` is set manually by HIVE Executives. No Stripe/Paddle integration exists; billing is fully manual.

- **No automated email/notification dispatch** — no transactional email SDK. `notifications` table exists but no delivery pipeline found.

- **`setStateStatus` write lacks exec guard** — `state-templates.functions.ts` `setStateStatus` (platform-level state enable/disable) uses only `requireSupabaseAuth`; no `ensureExecutive()` or `is_super_admin` check traced.

- **`setMemberGrants` lacks org membership check** — `team-access.functions.ts` `setMemberGrants` uses only `requireSupabaseAuth`; no `requireOrgMembership` call traced.

- **`bulkImportRoster` org gate is informal** — checks `organization_members.role` via `supabaseAdmin` directly rather than the standard `requireOrgMembership` pattern; no RPC-level gate.

- **`commitClientFromPdf` lacks org membership check** — writes extracted client data with only `requireSupabaseAuth`.

- **No scheduling UI/server functions found** — `scheduling` is a `ClientFeatureKey` and `scheduled_shifts` table exists but no dedicated scheduling server function file is present.

- **No EVV reporting server functions** — `evv_timesheets` table exists but no `evv.functions.ts` or equivalent server fn file found.

- **No payroll export** — `time_pay_categories`, `time_pay_settings` tables exist but no payroll export server function or integration found.

- **No HIPAA audit log for client PII reads** — `hr_document_access_log` exists for staff HR docs, and `can_view_staff_pii` gates PII, but there is no equivalent immutable access log for client PII fields (`clients.diagnosis`, `clients.medicaid_id`, `clients.date_of_birth`).

- **No billing claim submission server function** — `billing_submissions` table exists with full audit log, but no `billing.functions.ts` or equivalent server fn file was found (billing entry functions are in `financial-revenue.functions.ts` which handles revenue analytics, not claim submission workflow).

- **No report scheduling execution** — `nectar_report_schedules` table exists but no cron/queue execution mechanism is present in the codebase.

- **No MFA / 2FA** — no multi-factor authentication setup found beyond Supabase Auth defaults.

- **Dormant `nectar_staff.functions.ts` `askNectarStaff`** — takes a `staffId?` optional param but no UI call site was found querying a specific staff member.

