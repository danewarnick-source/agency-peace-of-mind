# Hive Database Schema

## Cleanup status (2026-08-19)

A cleanup pass targeted dropping ~40 tables to bring the schema under 150
for database-engineer review. A full-codebase grep audit (every
`.from("...")`/`.rpc("...")` call site) found that almost all of the
proposed drop list is actively used by live code and reachable routes —
see `docs/SQL_HANDOFF.md` ("Database cleanup batch 1 (revised)") for the
full list and evidence. Only 12 tables were confirmed dead and dropped.
`staff_training_hours_entries` was folded into `ce_ledger`
(`source = 'manual_entry'`). Everything below reflects the schema as it
actually stands, not the aspirational post-cleanup state — a real code-removal
pass is still needed before the remaining scheduling-V2 / training-tracks /
gmail-ingestion / financial-distribution / state-onboarding / NECTAR
compliance-flag tables can be safely dropped, if they ever should be.

## Core Operations
- `clients` — Person records. Central to all service delivery.
- `profiles` — All user accounts (staff, admins, Hive executives).
- `organizations` + `organization_members` — Multi-tenant isolation. Every query scoped by org.
- `staff_assignments` — Links staff to clients for a service code.
- `evv_timesheets` — The live shift/EVV system. Primary billing source.
- `scheduled_shifts` — Future shift scheduling (V2, partially built).
- `general_shifts` — Live server-side shift/clock state backing the staff mobile clock (`use-general-shift.tsx`, active shift bar). Not dead — kept.
- `daily_logs` + `shift_reports` — Shift documentation.
- `incident_reports` — Incident documentation for all service codes.

## Scheduling V2 (live, in use by /dashboard/schedule, /dashboard/scheduling, /dashboard/homes)
- `week_templates`, `recurring_shift_patterns` — Recurring schedule generation.
- `shift_callouts`, `callout_escalation_events` — Callout workflow.
- `shift_swap_requests` — Staff-initiated swap workflow.
- `staff_rotation_groups` + `staff_rotation_group_members` — Rotation-based scheduling.
- `location_coverage_requirements` — Coverage bar requirements per team/location.
- `home_designations` — Homes & Teams CARE-TEAM role labels (DSP/House Manager/Lead/Supervisor). **Never delete or treat as locations/homes** — see CLAUDE.md.
- `home_staff_designations` — Per-home staff designation assignments.

## Compliance & Obligations
- `company_obligations` — Every trackable compliance requirement. Source of truth.
- `company_obligation_instances` — One per obligation per period per assignee.
- `company_obligation_instance_assignees` — Snapshot of who is assigned.
- `company_obligation_completions` — Evidence submitted per completion.
- `staff_groups` + `staff_group_members` — Groups for obligation assignment.

## NECTAR / AI
- `nectar_documents` — Uploaded documents indexed for NECTAR Q&A.
- `nectar_requirements` — SOW requirements extracted for knowledge base (reference only).
- `nectar_extracted_fields` — Fields NECTAR extracted from uploaded documents.
- `nectar_attestations` — Staff attestation records with fraud warning.
- `nectar_draft_jobs` — Background AI job queue.
- `nectar_compliance_rules` + `nectar_compliance_rule_history` — Compliance rule definitions driving the deadline/flag engine. Live — `nectar-compliance.functions.ts`, `use-deadlines.tsx`.
- `nectar_compliance_flags` — Active flags surfaced to admins.
- `nectar_compliance_instances` — Per-org/per-period instances of a compliance rule; wired into `compliance-resolution.ts` and `authoritative-sources.functions.ts`.

## Training
- `training_topics` + `training_topic_progress` — SOW §1.8 core training topics.
- `training_person_modules` — Per-staff per-client training modules.
- `ce_modules` + `ce_ledger` + `ce_settings` — Continuing education tracking. `ce_ledger` now also holds manual training-hour entries (`source = 'manual_entry'`), replacing the old `staff_training_hours_entries` table.
- `client_specific_trainings` — Client-specific, support strategies, PCT content.
- `policy_signatures` — Policy document e-signatures.
- `training_products` + `training_purchases` + `training_enrollments` — Hive Training add-on.
- `training_tracks`, `track_programs`, `track_assignments` — Track-based training curriculum backing `/dashboard/tracks`. Live.
- `training_checklist_mappings` — Maps training topics to HR checklist requirement keys.
- `provider_training_modules`, `org_training_orders` — Provider-facing training catalog and orders.

## Permissions & Security
- `role_permissions` — Org-level role configuration (54 granular permissions).
- `user_permission_overrides` — Per-user grant/deny overrides with reason and expiry.
- `scope_assignments` — What subset of org data each user can see.
- `permission_audit_log` — Every permission change ever made.
- `role_change_audit_log` — Every role assignment change ever made.

## Medications
- `client_medications` + `emar_logs` + `emar_log_addenda` — Medication administration records.
- `controlled_med_counts` + `medication_change_proposals` + `medication_transfers` — Controlled substance tracking.

## Clinical / HRC
- `hrc_committee_members` + `hrc_meetings` + `hrc_restriction_records` + `hrc_reviews` — Human Rights Committee.
- `bc_behaviors` + `bc_data_entries` + `bc_documents` + `bc_flags` + `bc_review_notes` — Behavior support (BC2 service code).

## Financial / Billing
- `billing_submissions` + `billing_submission_audit_log` + `billing_submission_warnings` — EVV billing exports.
- `client_billing_codes` + `client_billing_code_rate_history` — Service authorization per client.
- `pba_accounts` + `pba_transactions` + `pba_audit_samples` — Personal budgets (PBA service code).
- `client_loans` + `employee_loans` (and related) — Loan management.
- `org_subscriptions` — Stripe subscription tracking.
- `payment_events` — Payment event log backing subscription/billing lockout logic (`billing-lockout.server.ts`, `billing-sms.server.ts`).
- `distribution_plans` + `distribution_plan_participants` — Financial distribution plans, backs `/dashboard/financial/distributions`.

## HHS Host Home
- `hhs_client_inventories`, `hhs_evacuation_drills`, `hhs_host_home_settings`, `hhs_medical_logs`,
  `hhs_monthly_attendance`, `hhs_monthly_certifications`, `hhs_monthly_summaries`,
  `hhs_transfer_logs`, `host_home_certifications`, `host_supervision_contacts` — HHS-specific operational tables.

## Referrals (Planned)
- `referrals`, `referral_activities`, `referral_documents`, `referral_match_scores` — Client intake referral system (built, not yet active).

## Import / Smart Import
- `import_jobs`, `import_documents`, `import_subjects`, `import_audit`, `import_access_log`,
  `import_cert_documents`, `import_field_provenance`, `import_merge_flags`, `import_nectar_questions` — Smart import tooling.

## State Onboarding (live — Hive-exec state expansion tooling)
- `platform_states` — Master list of states Hive operates/plans to operate in; queried directly by `dashboard.tsx` for the state picker.
- `state_templates`, `hive_base_template_versions` — Base compliance template per state, versioned.
- `state_derived_requirements`, `state_structural_gaps`, `state_requirement_sources` — Requirement extraction/gap-analysis pipeline for onboarding a new state.
- `state_onboarding_sessions` — In-progress state onboarding runs.
- `provisioning_plan`, `provisioning_rules` — Org provisioning rules derived from state requirements.

## Org Configuration
- `organizations`, `organization_branding`, `organization_features`, `organization_agreements`,
  `org_email_settings`, `org_subscriptions`, `org_support_tickets` — Organization settings and metadata.
- `agreement_requirements` — Drives the org agreements checklist (`agreements.functions.ts`).

## Gmail Ingestion (live — org email sync)
- `gmail_connections`, `gmail_ingested_messages`, `gmail_ingestion_audit`, `gmail_ingestion_rules` — OAuth connection state and ingested-message pipeline backing `/dashboard/settings/gmail`, the OAuth callback route, and the ingest webhook.

## Whiteboard / Celebrations / UI state (live, low-value — candidates for a future, code-first cleanup)
- `whiteboard_notes` — Ad hoc board notes (`whiteboard-notes.functions.ts`).
- `celebration_events`, `celebration_acknowledgements`, `org_celebration_settings`, `user_celebration_mute` — In-app celebrations feature; wired but low signal ("queried heavily for a feature few use" per the original cleanup brief) — dropping this needs a code-removal pass first, not just a table drop.
- `user_ui_dismissals` — Per-user dismissed-banner/tip state.

## MCP / Internal Tooling
- `mcp_column_catalog`, `mcp_table_catalog` — Schema catalog snapshots used by the MCP `list-tables` tool.
- `functionality_reports` — QA/functionality report storage used by `functionality-reports.functions.ts` and the hive-exec command center.

## Hive Internal
- `hive_executives` + `hive_executive_audit_log` — Platform staff access and audit.
- `hive_platform_tickets`, `hive_knowledge`, `exec_messages` (and related) — Internal tooling.
- `notifications` — In-app notification queue for all users.
