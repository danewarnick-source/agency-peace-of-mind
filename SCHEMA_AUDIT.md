# Hive schema audit (Sep 1 freeze)

_Read-only. No tables dropped, no migrations applied, no production writes, no app refactors. Generated from `src/integrations/supabase/types.ts`, `supabase/migrations/` (391 files), application `.from()` / `.rpc()` call sites, and a **select-only** snapshot of live project `dhrrukdcigiiqksibdfb` (Hive-Platform)._

## How to read this

- **~200 tables is real.** Live `public` currently has **281 base tables + 7 views**. Generated types list **283 tables + 7 views** (stale: includes three dropped catalog tables; missing `phi_access_audit_log`). The count is domain breadth (EVV + HHS/eMAR + obligations + Nectar + four training systems + import + billing), not a single runaway table.
- **`supabase/migrations/` is not the live schema.** `CLAUDE.md` already says this. Lovable SQL handoff (`docs/SQL_HANDOFF.md`) applies DDL without always recording a version. `schema_migrations` on live ends around `20260821175706`; later repo files (HIPAA hardening, training-hours drop, enrollment tables, obligation floors) may or may not be present. Confirm live before any DROP.
- **App usage** = `.from("table")` or documented RPC in `src/` and `supabase/functions/` (excluding generated `types.ts`). **yes** means the Sep 1 app still queries it — **never drop**. **no** means no current query site; it may still be hit by a trigger, edge function, or removed UI.
- **Live rows** are `pg_stat_user_tables.n_live_tup` (estimate). Empty ≠ unused if the app writes it during the test.
- **RLS** for live tables: every base table has RLS enabled and ≥1 policy. Views do not have RLS; six of seven use `security_invoker`; `org_member_directory` does not.

## Headline for a data engineer

1. **Do not consolidate before Sep 1.** The table count is mostly real product surface, not accidental duplication of the same entity.
2. **Permission/breach risk is not “200 tables without RLS.”** Live: **0 tables with RLS off.** The real issues are a **SECURITY DEFINER staff-directory view**, an **anon-executable seeder RPC with no auth check**, **default GRANT ALL (incl. TRUNCATE) to `authenticated`**, and **caseload PHI still depending on helper functions** (`can_access_client_phi`) that any authenticated user can execute (they re-check internally).
3. **True duplicates exist** (training ×4, audit packets ×3, incidents ×2, forms ×2, shift facts ×3) but each still has call sites. Archive only after Sep 1 with a grep + row-count gate.
4. **`types.ts` is behind/aside live** — e.g. `provider_tenants` / `system_features` / `tenant_features` are in types but **dropped live**; `phi_access_audit_log` is live but missing from types; `training_enrollments` is in app code + a repo migration but **not live**.

---

## 1. Inventory by domain

Columns: **app** = queried from application code; **RLS** = live; **rows** = live estimate; **likely** = interpretation, not a drop instruction.

### Identity, tenancy, RBAC

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `organizations` | table | yes | yes | 5 | live | `src/components/evv/utah-export-dialog.tsx`, `src/components/hr/staff-fields-panel.tsx`, `src/components/incidents/incident-report-dialog.tsx` +43 more |
| `organization_members` | table | yes | yes | 8 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/audit-zone.tsx`, `src/components/audit-zone/training-records-admin.tsx` +100 more |
| `organization_features` | table | yes | yes | 3 | live | `src/lib/org-features.functions.ts` |
| `organization_branding` | table | yes | yes | 0 | wired, empty tenant | `src/components/branding/org-logo.tsx`, `src/components/settings/org-branding-card.tsx`, `src/lib/client-face-sheet.functions.ts` +4 more |
| `organization_agreements` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agreements.functions.ts`, `src/lib/exec-command.functions.ts` |
| `profiles` | table | yes | yes | 6 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/behavior-support/audit-feed.tsx`, `src/components/behavior-support/behavior-supports-report.tsx` +97 more |
| `invitations` | table | yes | yes | 1 | live | `src/lib/invitations.functions.ts`, `src/lib/team-access.functions.ts`, `src/routes/dashboard.employees.index.tsx` +1 more |
| `role_permissions` | table | yes | yes | 6628 | live | `src/hooks/use-permissions.tsx`, `src/lib/permissions.functions.ts` |
| `user_permission_overrides` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-permissions.tsx`, `src/lib/permissions.functions.ts` |
| `permission_audit_log` | table | yes | yes | 0 | wired, empty tenant | `src/lib/permissions.functions.ts`, `src/routes/dashboard.permissions.tsx` |
| `role_change_audit_log` | table | yes | yes | 0 | wired, empty tenant | `src/lib/employees.functions.ts`, `src/lib/team-access.functions.ts` |
| `hive_executives` | table | yes | yes | 3 | live | `src/lib/agreements.functions.ts`, `src/lib/billing-approvals.functions.ts`, `src/lib/billing-lockout.functions.ts` +12 more |
| `hive_executive_audit_log` | table | yes | yes | 5919 | live | `src/components/records/records-tab.tsx`, `src/lib/hive-exec-admin.functions.ts`, `src/lib/hive-exec.functions.ts` |
| `feature_registry` | table | yes | yes | 8 | live | `src/lib/feature-registry-admin.functions.ts`, `src/lib/org-features.functions.ts` |
| `feature_upgrade_requests` | table | yes | yes | 5 | live | `src/lib/exec-command.functions.ts`, `src/lib/org-features.functions.ts` |
| `org_subscriptions` | table | yes | yes | 1 | live | `src/components/billing/billing-banner.tsx`, `src/lib/billing-lockout.server.ts`, `src/lib/billing-payment-method.functions.ts` +10 more |
| `scope_assignments` | table | yes | yes | 0 | wired, empty tenant | `src/components/settings/scope-assignments-panel.tsx`, `src/lib/permissions.functions.ts` |
| `staff_types` | table | yes | yes | 5 | live | `src/lib/employee-face-sheet.ts`, `src/lib/forms.functions.ts`, `src/lib/staff-types.functions.ts` +1 more |
| `custom_field_definitions` | table | yes | yes | 28 | live | `src/lib/client-care-data.functions.ts`, `src/lib/client-import-schema.ts`, `src/lib/client-profile-fields.ts` +6 more |
| `custom_field_values` | table | yes | yes | 33 | live | `src/lib/client-care-data.functions.ts`, `src/lib/client-import-schema.ts`, `src/lib/client-profile-fields.ts` +6 more |
| `org_email_settings` | table | yes | yes | 14 | live | `src/lib/email.functions.ts` |
| `org_member_directory` | view | yes | n/a (view) | — | live (SECURITY DEFINER) | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/training-records-admin.tsx`, `src/components/company-obligations/action-required-panel.tsx` +26 more |

### Clients, intake, caseload

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `clients` | table | yes | yes | 4 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/audit-zone.tsx`, `src/components/audit-zone/training-content-admin.tsx` +126 more |
| `client_documents` | table | yes | yes | 6 | live | `src/components/audit-zone/audit-zone.tsx`, `src/components/chores/chore-chart-panel.tsx`, `src/components/clients/billing-codes-detail.tsx` +19 more |
| `client_emergency_contacts` | table | yes | yes | 3 | live | `src/components/clients/profile-tab.tsx`, `src/lib/client-care-data.functions.ts`, `src/lib/mcp/tools/get-client.ts` +1 more |
| `client_external_services` | table | yes | yes | 6 | live | `src/lib/client-billing-fix.functions.ts`, `src/lib/client-import-schema.ts`, `src/routes/dashboard.clients.$clientId.tsx` |
| `client_intake_completion` | table | yes | yes | 0 | wired, empty tenant | `src/lib/client-hr.functions.ts`, `src/lib/forms.functions.ts` |
| `client_discharges` | table | yes | yes | 0 | wired, empty tenant | `src/lib/discharge.functions.ts` |
| `client_staff_visibility` | table | yes | yes | 1 | live | `src/lib/client-care-data.functions.ts`, `src/lib/client-staff-visibility.functions.ts` |
| `client_belongings` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-evidence.functions.ts`, `src/lib/client-belongings.functions.ts` |
| `staff_assignments` | table | yes | yes | 6 | live | `src/components/clients/caseload-editor.tsx`, `src/components/clients/client-specific-training-card.tsx`, `src/components/nectar/nectar-auto-assign-dialog.tsx` +25 more |
| `employee_client_assignments` | view | no | n/a (view) | 0 | unused-looking | no `.from()` in src/ |
| `assignment_map` | table | yes | yes | 7 | live | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-history.functions.ts`, `src/lib/smart-import-review.functions.ts` |
| `support_coordinators` | table | yes | yes | 0 | wired, empty tenant | `src/lib/referrals.functions.ts`, `src/routes/api/public/hooks/gmail-ingest.ts` |
| `referrals` | table | yes | yes | 0 | wired, empty tenant | `src/lib/gmail.functions.ts`, `src/lib/referral-matching.functions.ts`, `src/lib/referrals.functions.ts` +2 more |
| `referral_activities` | table | yes | yes | 0 | wired, empty tenant | `src/lib/referrals.functions.ts`, `src/lib/retention.functions.ts` |
| `referral_documents` | table | yes | yes | 0 | wired, empty tenant | `src/lib/referral-docs.functions.ts`, `src/routes/api/public/hooks/gmail-ingest.ts` |
| `referral_match_scores` | table | yes | yes | 0 | wired, empty tenant | `src/lib/referral-matching.functions.ts` |
| `org_referral_retention_settings` | table | yes | yes | 0 | wired, empty tenant | `src/lib/retention.functions.ts` |
| `provider_interest_outline` | table | yes | yes | 0 | wired, empty tenant | `src/lib/company-obligations.functions.ts`, `src/lib/provider-interest-outline.functions.ts`, `src/lib/referral-matching.functions.ts` +2 more |

### Homes, locations, coverage

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `teams` | table | yes | yes | 1 | live | `src/components/evv/approved-evv-archive.tsx`, `src/components/records/records-tab.tsx`, `src/components/scheduling/homes-teams-board.tsx` +17 more |
| `home_designations` | table | yes | yes | 0 | wired, empty tenant | `src/components/scheduling/homes-teams-board.tsx`, `src/routes/dashboard.employees.$staffId.tsx`, `src/routes/dashboard.homes.$teamId.tsx` |
| `home_staff_designations` | table | yes | yes | 0 | wired, empty tenant | `src/components/scheduling/homes-teams-board.tsx`, `src/lib/scheduling/eligibility.functions.ts`, `src/routes/dashboard.employees.$staffId.tsx` +1 more |
| `locations` | table | yes | yes | 1 | live | `src/lib/coverage.functions.ts`, `src/lib/scheduling/eligibility.functions.ts`, `src/lib/scheduling/locations.functions.ts` |
| `location_coverage_requirements` | table | yes | yes | 0 | wired, empty tenant | `src/lib/mcp/tools/coverage-status.ts`, `src/lib/scheduling/locations.functions.ts` |
| `staff_rotation_groups` | table | yes | yes | 0 | wired, empty tenant | `src/lib/scheduling/recurring.functions.ts` |
| `staff_rotation_group_members` | table | yes | yes | 0 | wired, empty tenant | `src/lib/scheduling/recurring.functions.ts` |
| `staff_groups` | table | yes | yes | 1 | live | `src/components/settings/scope-assignments-panel.tsx`, `src/lib/company-obligations.functions.ts`, `src/lib/staff-groups.functions.ts` |
| `staff_group_members` | table | yes | yes | 4 | live | `src/lib/staff-groups.functions.ts` |

### EVV, shifts, scheduling

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `evv_timesheets` | table | yes | yes | 29 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/audit-zone.tsx`, `src/components/billing/nectar-billing-readiness-bar.tsx` +53 more |
| `evv_export_batches` | table | yes | yes | 1 | live | `src/components/evv/utah-export-dialog.tsx`, `src/components/records/records-tab.tsx` |
| `evv_export_records` | table | yes | yes | 1 | live | `src/components/evv/approved-evv-archive.tsx`, `src/components/evv/utah-export-dialog.tsx`, `src/components/records/records-tab.tsx` +1 more |
| `scheduled_shifts` | table | yes | yes | 0 | wired, empty tenant | `src/components/evv/punch-pad.tsx`, `src/components/nectar/nectar-auto-assign-dialog.tsx`, `src/components/schedule-preview/requests-panel.tsx` +32 more |
| `general_shifts` | table | yes | yes | 0 | wired, empty tenant | `src/components/records/records-tab.tsx`, `src/hooks/use-general-shift.tsx`, `src/hooks/use-nectar-pay-period.tsx` +1 more |
| `recurring_shift_patterns` | table | yes | yes | 0 | wired, empty tenant | `src/lib/scheduling/recurring.functions.ts` |
| `week_templates` | table | yes | yes | 0 | wired, empty tenant | `src/lib/scheduling/week-templates.functions.ts` |
| `shift_templates` | table | yes | yes | 36 | live | `src/lib/coverage.functions.ts` |
| `shift_callouts` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.shift.$shiftId.tsx` |
| `callout_escalation_events` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.shift.$shiftId.tsx` |
| `shift_swap_requests` | table | yes | yes | 0 | wired, empty tenant | `src/lib/schedule-requests.ts`, `src/lib/scheduling/swaps.functions.ts`, `src/lib/scheduling/workflow.functions.ts` |
| `shift_reports` | table | yes | yes | 0 | wired, empty tenant | `src/lib/progress-summaries.functions.ts`, `src/lib/progress-summary-draft.functions.ts`, `src/routes/dashboard.shift.$shiftId.tsx` |
| `shift_completeness_flags` | table | yes | yes | 0 | wired, empty tenant | `src/components/evv/punch-pad.tsx`, `src/lib/mcp/tools/nectar-flags.ts` |
| `shift_behavior_observations` | table | yes | yes | 2 | live | `src/components/evv/punch-pad.tsx` |
| `time_off_requests` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-scheduler-data.tsx`, `src/lib/schedule-requests.ts`, `src/lib/scheduler/scheduler.functions.ts` +3 more |
| `staff_other_assignments` | table | yes | yes | 0 | wired, empty tenant | `src/components/audit-zone/training-records-admin.tsx`, `src/lib/other-assignments.functions.ts`, `src/routes/dashboard.reports.tsx` |
| `time_pay_settings` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-time-pay-settings.tsx`, `src/lib/financial-totals.functions.ts`, `src/routes/dashboard.client-billing-codes.tsx` |
| `time_pay_categories` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-time-pay-settings.tsx` |
| `contractor_monthly_pay` | table | yes | yes | 0 | wired, empty tenant | `src/lib/financial-contractors.functions.ts`, `src/lib/financial-distributions.functions.ts`, `src/lib/financial-employees.functions.ts` +5 more |
| `org_shift_behavior_settings` | table | yes | yes | 1 | live | `src/hooks/use-shift-behavior-setting.tsx`, `src/lib/scheduling/conflicts.functions.ts` |
| `client_approved_locations` | table | yes | yes | 0 | wired, empty tenant | `src/components/evv/approved-locations-editor.tsx`, `src/components/evv/punch-pad.tsx`, `src/components/evv/utah-export-dialog.tsx` +2 more |
| `client_ratios` | table | yes | yes | 0 | wired, empty tenant | `src/components/scheduling/homes-teams-board.tsx`, `src/lib/client-import-schema.ts`, `src/lib/coverage.functions.ts` +1 more |
| `client_weekly_targets` | table | yes | yes | 0 | wired, empty tenant | `src/lib/scheduling/targets.functions.ts`, `src/routes/dashboard.shift.$shiftId.tsx` |

### Daily notes / documentation

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `daily_logs` | table | yes | yes | 60 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/residential/residential-daily-tab.tsx`, `src/hooks/use-client-utilization.tsx` +15 more |
| `nectar_attestations` | table | yes | yes | 37 | live | `src/components/evv/punch-pad.tsx`, `src/hooks/use-onboarding-progress.tsx`, `src/lib/authoritative-sources.functions.ts` +2 more |
| `hhp_cue_cards` | table | yes | yes | 1 | live | `src/lib/hhp-cue-cards.functions.ts`, `src/lib/referral-matching.functions.ts` |
| `whiteboard_notes` | table | no | yes | 4 | orphaned data? | no `.from()` in src/ |

### HHS / RHS / residential / eMAR

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `hhs_daily_records_v` | view | yes | n/a (view) | — | live (security_invoker) | `src/components/billing/nectar-billing-readiness-bar.tsx`, `src/components/residential/residential-daily-tab.tsx`, `src/hooks/use-client-budget.tsx` +20 more |
| `hhs_monthly_attendance` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/billing/nectar-billing-readiness-bar.tsx`, `src/lib/agency-health.functions.ts` +3 more |
| `hhs_monthly_certifications` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hhs-certifications.functions.ts` |
| `hhs_monthly_summaries` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hhs.functions.ts` |
| `hhs_host_home_settings` | table | yes | yes | 2 | live | `src/lib/financial-contractors.functions.ts`, `src/lib/financial-employees.functions.ts`, `src/lib/financial-host-home.functions.ts` +2 more |
| `hhs_host_home_monthly` | table | yes | yes | 0 | wired, empty tenant | `src/lib/financial-host-home.functions.ts`, `src/routes/dashboard.financial.host-home.tsx` |
| `hhs_evacuation_drills` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agency-health.functions.ts`, `src/lib/hhs.functions.ts` |
| `hhs_client_inventories` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hhs.functions.ts` |
| `hhs_medical_logs` | table | yes | yes | 0 | wired, empty tenant | `src/components/billing/nectar-billing-readiness-bar.tsx`, `src/lib/hhs.functions.ts`, `src/routes/dashboard.hhs-hub.$clientId.tsx` |
| `hhs_transfer_logs` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hhs.functions.ts` |
| `hhs_incident_reports` | table | yes | yes | 0 | wired, empty tenant | `src/components/billing/nectar-billing-readiness-bar.tsx`, `src/lib/agency-health.functions.ts`, `src/lib/hhs.functions.ts` +1 more |
| `host_home_certifications` | table | yes | yes | 1 | live | `src/components/hosts/host-home-certification-dialog.tsx`, `src/lib/agency-health.functions.ts`, `src/lib/host-home-certifications.functions.ts` +1 more |
| `host_home_cert_concerns` | table | yes | yes | 0 | wired, empty tenant | `src/components/hosts/host-home-certification-dialog.tsx`, `src/lib/host-home-certifications.functions.ts` |
| `host_supervision_contacts` | table | yes | yes | 0 | wired, empty tenant | `src/components/residential/residential-daily-tab.tsx` |
| `emar_logs` | table | yes | yes | 1 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/mar-calendar.tsx`, `src/components/medications/staff-medications-panel.tsx` +11 more |
| `emar_log_addenda` | table | yes | yes | 0 | wired, empty tenant | `src/lib/emar-pass.functions.ts` |
| `client_medications` | table | yes | yes | 7 | live | `src/components/clients/setup-checklist.tsx`, `src/components/mar-calendar.tsx`, `src/components/medications-manager.tsx` +22 more |
| `controlled_med_counts` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agency-health.functions.ts`, `src/lib/emar-nectar.functions.ts`, `src/lib/emar-pass.functions.ts` |
| `medication_transfers` | table | yes | yes | 0 | wired, empty tenant | `src/components/workspace/emar-ops-panel.tsx`, `src/lib/emar-pass.functions.ts` |
| `medication_change_proposals` | table | yes | yes | 0 | wired, empty tenant | `src/components/medications-manager.tsx` |

### Day program

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `day_program_sessions` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-day-program-data.tsx`, `src/lib/day-program.functions.ts`, `src/lib/scheduler/scheduler.functions.ts` +1 more |
| `day_program_session_staff` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-day-program-data.tsx`, `src/lib/day-program.functions.ts`, `src/lib/scheduler/scheduler.functions.ts` +1 more |
| `day_program_attendance` | table | yes | yes | 0 | wired, empty tenant | `src/hooks/use-day-program-data.tsx`, `src/lib/day-program.functions.ts`, `src/lib/scheduler/scheduler.functions.ts` |
| `day_program_transport` | table | yes | yes | 0 | wired, empty tenant | `src/lib/company-obligations.functions.ts`, `src/lib/day-program.functions.ts` |
| `day_program_billable_v` | view | no | n/a (view) | 0 | unused-looking | no `.from()` in src/ |

### Chores, meals, household

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `chore_spaces` | table | yes | yes | 1 | live | `src/components/chores/chore-chart-mount.tsx`, `src/components/chores/chore-chart-panel.tsx`, `src/components/chores/chore-daily-checklist.tsx` +4 more |
| `chore_space_clients` | table | yes | yes | 1 | live | `src/components/chores/chore-chart-mount.tsx`, `src/components/chores/chore-chart-panel.tsx`, `src/components/chores/chore-daily-checklist.tsx` +3 more |
| `chore_definitions` | table | yes | yes | 5 | live | `src/components/chores/chore-chart-panel.tsx`, `src/components/chores/chore-daily-checklist.tsx`, `src/lib/chore-chart-report.ts` |
| `chore_daily_items` | table | yes | yes | 1 | live | `src/components/chores/chore-chart-panel.tsx`, `src/components/chores/chore-daily-checklist.tsx`, `src/lib/chore-chart-report.ts` |
| `chore_completions` | table | yes | yes | 0 | wired, empty tenant | `src/components/chores/chore-daily-checklist.tsx`, `src/lib/chore-chart-report.ts` |
| `chore_client_rotation` | table | yes | yes | 7 | live | `src/components/chores/chore-chart-panel.tsx`, `src/components/chores/chore-daily-checklist.tsx`, `src/lib/chore-chart-report.ts` |
| `client_chore_support` | table | yes | yes | 0 | wired, empty tenant | `src/components/chores/chore-support-activation.tsx`, `src/lib/chore-chart-report.ts` |
| `client_meals` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-planner-panel.tsx`, `src/lib/meal-plan-menu-report.ts`, `src/lib/meal-plan-vs-actual-report.ts` |
| `client_meal_plans` | table | yes | yes | 1 | live | `src/components/clients/client-meal-planner-panel.tsx`, `src/lib/meal-plan-menu-report.ts`, `src/lib/meal-plan-vs-actual-report.ts` |
| `client_meal_actuals` | table | yes | yes | 1 | live | `src/components/clients/client-meal-planner-panel.tsx`, `src/lib/meal-plan-vs-actual-report.ts` |
| `client_meal_support` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/meal-support-activation.tsx` |
| `client_recipes` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-recipes.tsx` |
| `client_recipe_ingredients` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-recipes.tsx` |
| `client_shopping_items` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-planner-panel.tsx`, `src/components/clients/client-meal-recipes.tsx`, `src/lib/meal-plan-menu-report.ts` |
| `client_nutrition_config` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-planner-panel.tsx`, `src/lib/meal-plan-menu-report.ts` |
| `org_shopping_library` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/client-meal-recipes.tsx` |

### Behavior / BCBA

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `bc_behaviors` | table | yes | yes | 0 | wired, empty tenant | `src/components/behavior-support/audit-feed.tsx`, `src/components/behavior-support/behavior-supports-report.tsx`, `src/components/behavior-support/behaviors-panel.tsx` +5 more |
| `bc_data_entries` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/behavior-support/audit-feed.tsx`, `src/components/behavior-support/behavior-supports-report.tsx` +4 more |
| `bc_documents` | table | yes | yes | 0 | wired, empty tenant | `src/components/behavior-support/behavior-supports-report.tsx`, `src/components/behavior-support/fba-bsp-strip.tsx`, `src/components/behavior-support/sow-deadlines.tsx` |
| `bc_flags` | table | yes | yes | 0 | wired, empty tenant | `src/components/behavior-support/behavior-supports-report.tsx`, `src/components/behavior-support/bs-config-card.tsx`, `src/components/behavior-support/sow-deadlines.tsx` +3 more |
| `bc_review_notes` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/behavior-support/behavior-supports-report.tsx`, `src/components/behavior-support/notes-panel.tsx` +2 more |
| `behavior_support_clients` | table | yes | yes | 0 | wired, empty tenant | `src/components/behavior-support/behavior-supports-report.tsx`, `src/components/behavior-support/bs-config-card.tsx`, `src/components/behavior-support/sow-deadlines.tsx` +8 more |
| `client_target_behaviors` | table | yes | yes | 1 | live | `src/lib/client-care-data.functions.ts`, `src/lib/client-target-behaviors.functions.ts`, `src/lib/company-obligations.functions.ts` |

### Incidents / HRC

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `incident_reports` | table | yes | yes | 1 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/audit-zone.tsx`, `src/components/residential/residential-daily-tab.tsx` +15 more |
| `hrc_meetings` | table | yes | yes | 1 | live | `src/lib/agency-health.functions.ts`, `src/lib/audit-evidence.functions.ts`, `src/routes/dashboard.hrc.tsx` |
| `hrc_reviews` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agency-health.functions.ts`, `src/lib/client-specific-training.functions.ts`, `src/lib/import-checklist.functions.ts` +1 more |
| `hrc_committee_members` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.hrc.tsx` |
| `hrc_restriction_records` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/clients/profile-tab.tsx`, `src/hooks/use-action-required-queue.tsx` +5 more |

### Compliance / obligations / summaries

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `company_obligations` | table | yes | yes | 63 | live | `src/lib/agency-health.functions.ts`, `src/lib/audit-evidence.functions.ts`, `src/lib/company-obligations.functions.ts` +2 more |
| `company_obligation_instances` | table | yes | yes | 77 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/company-obligations/obligation-card-actions.tsx`, `src/components/company-obligations/obligation-card.tsx` +6 more |
| `company_obligation_instance_assignees` | table | yes | yes | 53 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/company-obligations/obligation-card-actions.tsx`, `src/components/company-obligations/obligation-card.tsx` +4 more |
| `company_obligation_completions` | table | yes | yes | 2 | live | `src/components/company-obligations/obligation-card-actions.tsx`, `src/components/company-obligations/obligation-card.tsx`, `src/components/company-obligations/obligation-history-sheet.tsx` +3 more |
| `document_attestations` | table | yes | yes | 0 | wired, empty tenant | `src/lib/document-attestations.functions.ts` |
| `policy_signatures` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/lib/agency-health.functions.ts`, `src/lib/policy-signatures.functions.ts` +3 more |
| `upi_attestations` | table | yes | yes | 0 | wired, empty tenant | `src/components/admin-home/admin-home-dashboard.tsx`, `src/lib/agency-health.functions.ts`, `src/lib/upi-attestations.functions.ts` |
| `client_progress_summaries` | table | yes | yes | 1 | live | `src/lib/audit-evidence.functions.ts`, `src/lib/progress-summaries.functions.ts`, `src/lib/progress-summary-draft.functions.ts` +1 more |
| `sjd_assessment_selections` | table | yes | yes | 0 | wired, empty tenant | `src/components/clients/profile-tab.tsx` |
| `staff_checklist_completion` | table | yes | yes | 0 | wired, empty tenant | `src/lib/client-specific-training.functions.ts`, `src/lib/forms.functions.ts`, `src/lib/hr-staff.functions.ts` |
| `staff_baseline_training_completions` | table | yes | yes | 0 | wired, empty tenant | `src/lib/employee-face-sheet.ts`, `src/lib/hr-staff.functions.ts`, `src/lib/scheduling/required-qualifications.functions.ts` +4 more |
| `agreement_requirements` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agreements.functions.ts` |
| `nectar_compliance_rules` | table | yes | yes | 7 | live | `src/lib/nectar-compliance.functions.ts`, `src/lib/scheduling/required-qualifications.functions.ts`, `src/lib/scheduling/shift-commit.ts` |
| `nectar_compliance_rule_history` | table | yes | yes | 7 | live | `src/lib/nectar-compliance.functions.ts` |
| `nectar_compliance_flags` | table | yes | yes | 0 | wired, empty tenant | `src/lib/nectar-compliance.functions.ts`, `src/lib/nectar-held-timesheets.functions.ts`, `src/lib/scheduling/shift-commit.ts` |
| `nectar_compliance_instances` | table | yes | yes | 0 | wired, empty tenant | `src/lib/authoritative-sources.functions.ts`, `src/lib/compliance-resolution.ts` |

### Nectar (requirements, documents, drafts)

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `nectar_requirements` | table | yes | yes | 1768 | live | `src/lib/authoritative-sources.functions.ts`, `src/lib/client-specific-training.functions.ts`, `src/lib/company-overview.functions.ts` +16 more |
| `nectar_requirement_mappings` | table | yes | yes | 121 | live | `src/lib/company-overview.functions.ts`, `src/lib/internal-audit.functions.ts`, `src/lib/nectar-engine.functions.ts` |
| `nectar_requirement_usage` | table | yes | yes | 0 | wired, empty tenant | `src/components/nectar/requirement-card.tsx`, `src/lib/nectar-requirement-usage.functions.ts` |
| `nectar_requirement_usage_current_v` | view | yes | n/a (view) | 0 | wired, empty tenant | `src/lib/nectar-requirement-usage.functions.ts` |
| `nectar_requirement_category_history` | table | yes | yes | 0 | wired, empty tenant | `src/lib/nectar-requirement-usage.functions.ts` |
| `nectar_requirement_approval_events` | table | yes | yes | 0 | wired, empty tenant | `src/lib/nectar-approvals.functions.ts` |
| `nectar_documents` | table | yes | yes | 10 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/audit-zone/audit-zone.tsx`, `src/components/pages/authoritative-sources-page.tsx` +21 more |
| `nectar_extracted_fields` | table | yes | yes | 136 | live | `src/lib/authoritative-sources.functions.ts`, `src/lib/nectar-documents.functions.ts` |
| `nectar_code_activations` | table | yes | yes | 8 | live | `src/components/pages/authoritative-sources-page.tsx`, `src/lib/nectar-requirement-usage.functions.ts` |
| `nectar_draft_jobs` | table | yes | yes | 15 | live | `src/lib/authoritative-sources.functions.ts`, `src/lib/nectar-draft-tick.server.ts` |
| `nectar_guides` | table | yes | yes | 1 | live | `src/lib/nectar-guide.functions.ts` |
| `nectar_guide_tasks` | table | yes | yes | 7 | live | `src/lib/nectar-guide.functions.ts` |
| `nectar_rate_state` | table | yes | yes | 1 | live | via RPC `nectar_check_rate / nectar_record_tokens` (src/lib/nectar-rate-limit.server.ts) |
| `nectar_report_runs` | table | yes | yes | 0 | wired, empty tenant | `src/routes/api/public/hooks/nectar-schedules.ts` |
| `nectar_report_schedules` | table | yes | yes | 0 | wired, empty tenant | `src/lib/saved-reports.functions.ts`, `src/routes/api/public/hooks/nectar-schedules.ts` |
| `nectar_saved_reports` | table | yes | yes | 0 | wired, empty tenant | `src/lib/saved-reports.functions.ts` |
| `hive_knowledge` | table | yes | yes | 14 | live | `src/lib/hive-knowledge.functions.ts` |

### Smart import / Gmail ingest

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `import_jobs` | table | yes | yes | 34 | live | `src/lib/hive-migration.functions.ts`, `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-daily-notes.functions.ts` +5 more |
| `import_subjects` | table | yes | yes | 50 | live | `src/lib/import-checklist.functions.ts`, `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-history.functions.ts` +5 more |
| `import_documents` | table | yes | yes | 39 | live | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-history.functions.ts`, `src/lib/smart-import.functions.ts` |
| `import_cert_documents` | table | yes | yes | 0 | wired, empty tenant | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-reminders.functions.ts`, `src/lib/smart-import-review.functions.ts` +1 more |
| `extracted_fields` | table | yes | yes | 1015 | live | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-review.functions.ts`, `src/lib/smart-import.functions.ts` |
| `import_field_provenance` | table | yes | yes | 94 | live | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-history.functions.ts` |
| `import_audit` | table | yes | yes | 226 | live | `src/lib/hive-migration.functions.ts`, `src/lib/import-checklist.functions.ts`, `src/lib/smart-import-commit.functions.ts` +4 more |
| `import_access_log` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hive-migration.functions.ts` |
| `import_merge_flags` | table | yes | yes | 6 | live | `src/lib/client-import-schema.ts`, `src/lib/import-checklist.functions.ts`, `src/lib/smart-import-review.functions.ts` |
| `import_nectar_questions` | table | yes | yes | 0 | wired, empty tenant | `src/lib/smart-import-reminders.functions.ts`, `src/lib/smart-import-review.functions.ts`, `src/routes/api/public/hooks/smart-import-reminders.ts` |
| `gmail_connections` | table | yes | yes | 0 | wired, empty tenant | `src/lib/gmail.functions.ts`, `src/routes/api/public/hooks/gmail-ingest.ts`, `src/routes/api/public/oauth/gmail/callback.ts` |
| `gmail_ingestion_rules` | table | yes | yes | 0 | wired, empty tenant | `src/lib/gmail.functions.ts`, `src/routes/api/public/hooks/gmail-ingest.ts` |
| `gmail_ingested_messages` | table | yes | yes | 0 | wired, empty tenant | `src/routes/api/public/hooks/gmail-ingest.ts` |
| `gmail_ingestion_audit` | table | yes | yes | 0 | wired, empty tenant | `src/lib/gmail.functions.ts`, `src/routes/api/public/hooks/gmail-ingest.ts`, `src/routes/api/public/oauth/gmail/callback.ts` |

### Billing / PBA / financial

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `client_billing_codes` | table | yes | yes | 11 | live | `src/components/admin-home/admin-home-dashboard.tsx`, `src/components/chores/chore-chart-mount.tsx`, `src/components/clients/add-codes-control.tsx` +49 more |
| `client_billing_code_rate_history` | table | yes | yes | 1 | live | `src/lib/billing-rates.functions.ts`, `src/routes/dashboard.financial.monthly-grid.tsx` |
| `service_codes` | table | yes | yes | 486 | live | `src/components/clients/living-arrangement-flag.tsx`, `src/components/settings/service-catalog-view.tsx`, `src/components/settings/service-code-registry-view.tsx` +3 more |
| `provider_authorized_codes` | table | yes | yes | 63 | live | `src/components/pages/authoritative-sources-page.tsx`, `src/components/scheduling/timesheets-reconcile.tsx`, `src/lib/authoritative-sources.functions.ts` +2 more |
| `billing_submissions` | table | yes | yes | 1 | live | `src/components/audit-zone/audit-zone.tsx`, `src/lib/agency-health.functions.ts`, `src/lib/audit-packet.functions.ts` +2 more |
| `billing_submission_warnings` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agency-health.functions.ts`, `src/lib/company-overview.functions.ts`, `src/lib/mcp/tools/nectar-flags.ts` +1 more |
| `billing_submission_audit_log` | table | yes | yes | 1 | live | `src/routes/dashboard.billing.form520.tsx` |
| `billing_code_approval_requests` | table | yes | yes | 3 | live | `src/lib/billing-approvals.functions.ts`, `src/lib/exec-command.functions.ts` |
| `billing_code_approval_messages` | table | yes | yes | 4 | live | `src/lib/billing-approvals.functions.ts` |
| `pba_accounts` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-packet.functions.ts`, `src/lib/lifecycle.functions.ts`, `src/lib/nectar-help.functions.ts` +2 more |
| `pba_transactions` | table | yes | yes | 0 | wired, empty tenant | `src/lib/lifecycle.functions.ts`, `src/routes/dashboard.pba-ledger.tsx` |
| `pba_audit_samples` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.pba-ledger.tsx` |
| `provider_ledger_entries` | table | yes | yes | 5 | live | `src/lib/financial-distributions.functions.ts`, `src/lib/financial-gross.functions.ts`, `src/lib/financial-nectar.functions.ts` +4 more |
| `distribution_plans` | table | yes | yes | 1 | live | `src/lib/financial-distributions.functions.ts`, `src/lib/financial-nectar.functions.ts` |
| `distribution_plan_participants` | table | yes | yes | 0 | wired, empty tenant | `src/lib/financial-distributions.functions.ts`, `src/lib/financial-nectar.functions.ts` |
| `agency_bank_accounts` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.settings.bank-mapping.tsx` |
| `agency_bank_mappings` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.settings.bank-mapping.tsx` |
| `activity_reimbursement_requests` | table | yes | yes | 0 | wired, empty tenant | `src/components/evv/punch-pad.tsx`, `src/components/staff-mobile/reimbursement-shift-panel.tsx`, `src/lib/company-overview.functions.ts` +1 more |
| `client_budgets` | table | yes | yes | 1 | live | `src/components/clients/client-budget-panel.tsx`, `src/components/clients/client-meal-recipes.tsx`, `src/lib/client-budget-report.ts` |
| `client_budget_lines` | table | yes | yes | 3 | live | `src/components/clients/client-budget-panel.tsx`, `src/components/clients/client-meal-recipes.tsx`, `src/lib/client-budget-report.ts` |
| `client_loans` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-evidence.functions.ts`, `src/lib/client-loans.functions.ts` |
| `client_loan_entries` | table | yes | yes | 0 | wired, empty tenant | `src/lib/client-loans.functions.ts` |
| `client_spending_log` | table | yes | yes | 0 | wired, empty tenant | `src/components/audit-zone/audit-zone.tsx`, `src/components/evv/punch-pad.tsx`, `src/components/staff-mobile/client-spending-shift-panel.tsx` |
| `employee_loans` | table | yes | yes | 2 | live | `src/lib/employee-loans.functions.ts` |
| `employee_loan_entries` | table | yes | yes | 0 | wired, empty tenant | `src/lib/employee-loans.functions.ts` |
| `employee_loan_signatures` | table | yes | yes | 1 | live | `src/lib/employee-loans.functions.ts` |
| `employee_loan_signature_tokens` | table | yes | yes | 2 | live | `src/lib/employee-loans.functions.ts` |
| `org_loan_settings` | table | yes | yes | 1 | live | `src/lib/client-loans.functions.ts` |
| `org_loan_attestations` | table | yes | yes | 1 | live | `src/lib/client-loans.functions.ts` |
| `payment_events` | table | yes | yes | 0 | wired, empty tenant | `src/lib/billing-lockout.server.ts`, `src/lib/billing-payment-method.functions.ts`, `src/lib/billing-sms.server.ts` +2 more |

### Training / CE / certifications (parallel systems)

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `courses` | table | yes | yes | 21 | live | `src/lib/auditor-shares.functions.ts`, `src/routes/dashboard.courses.$courseId.edit.tsx`, `src/routes/dashboard.courses.$courseId.tsx` +3 more |
| `course_modules` | table | yes | yes | 76 | live | `src/routes/dashboard.courses.$courseId.edit.tsx`, `src/routes/dashboard.courses.$courseId.tsx` |
| `course_assignments` | table | yes | yes | 1 | live | `src/lib/lifecycle.functions.ts`, `src/routes/dashboard.courses.$courseId.tsx`, `src/routes/dashboard.programs.$programId.tsx` +2 more |
| `lessons` | table | yes | yes | 364 | live | `src/routes/dashboard.courses.$courseId.edit.tsx`, `src/routes/dashboard.courses.$courseId.tsx` |
| `lesson_progress` | table | yes | yes | 1 | live | `src/routes/dashboard.courses.$courseId.tsx` |
| `lesson_quiz_attempts` | table | yes | yes | 4 | live | `src/routes/dashboard.courses.$courseId.tsx` |
| `training_tracks` | table | yes | yes | 5 | live | `src/routes/dashboard.employees.index.tsx`, `src/routes/dashboard.tracks.$trackSlug.tsx`, `src/routes/dashboard.tracks.tsx` |
| `track_programs` | table | yes | yes | 3 | live | `src/routes/dashboard.tracks.$trackSlug.tsx` |
| `track_assignments` | table | yes | yes | 5 | live | `src/lib/employees.functions.ts`, `src/routes/dashboard.tracks.tsx` |
| `training_topics` | table | yes | yes | 22 | live | `src/components/audit-zone/training-records-admin.tsx`, `src/lib/hr-staff.functions.ts`, `src/lib/hr-training-hours.functions.ts` +3 more |
| `training_topic_progress` | table | yes | yes | 12 | live | `src/components/audit-zone/training-records-admin.tsx`, `src/routes/dashboard.courses.core.tsx`, `src/routes/dashboard.courses.index.tsx` +3 more |
| `training_programs` | table | yes | yes | 4 | live | `src/routes/dashboard.programs-admin.tsx`, `src/routes/dashboard.programs.$programId.tsx`, `src/routes/dashboard.programs.tsx` |
| `program_courses` | table | yes | yes | 15 | live | `src/routes/dashboard.programs-admin.tsx`, `src/routes/dashboard.programs.$programId.tsx` |
| `program_assignments` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.programs.$programId.tsx`, `src/routes/dashboard.programs.tsx` |
| `program_acknowledgements` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.programs.$programId.tsx` |
| `training_completions` | table | yes | yes | 11 | live | `src/components/audit-zone/training-records-admin.tsx`, `src/components/hr/staff-hr-checklist-card.tsx`, `src/lib/agency-health.functions.ts` +9 more |
| `training_modules` | table | yes | yes | 6 | live | `src/routes/dashboard.training.$id.tsx`, `src/routes/dashboard.training.index.tsx` |
| `training_person_modules` | table | yes | yes | 0 | wired, empty tenant | `src/components/audit-zone/training-records-admin.tsx`, `src/routes/dashboard.courses.index.tsx`, `src/routes/dashboard.courses.person-module.$assignmentId.tsx` +1 more |
| `training_checklist_mappings` | table | yes | yes | 16 | live | `src/lib/hr-staff.functions.ts`, `src/lib/hr-training-hours.functions.ts` |
| `user_training_progress` | table | yes | yes | 20 | live | `src/routes/dashboard.reports.tsx`, `src/routes/dashboard.training.$id.tsx`, `src/routes/dashboard.training.index.tsx` |
| `ce_ledger` | table | yes | yes | 0 | wired, empty tenant | `src/lib/ce.functions.ts`, `src/lib/hr-staff.functions.ts`, `src/lib/hr-training-hours.functions.ts` |
| `ce_modules` | table | yes | yes | 1 | live | `src/lib/ce.functions.ts` |
| `ce_settings` | table | yes | yes | 1 | live | `src/lib/ce.functions.ts` |
| `staff_training_hours_entries` | table | no | yes | 0 | unused-looking | no `.from()` in src/ |
| `certifications` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-packet.functions.ts`, `src/lib/auditor-shares.functions.ts`, `src/lib/employee-face-sheet.ts` +3 more |
| `certification_types` | table | yes | yes | 9 | live | `src/routes/dashboard.tracks.$trackSlug.tsx` |
| `external_certifications` | table | yes | yes | 0 | wired, empty tenant | `src/lib/company-overview.functions.ts`, `src/lib/employee-face-sheet.ts`, `src/lib/internal-audit.functions.ts` +7 more |
| `client_specific_trainings` | table | yes | yes | 4 | live | `src/lib/agency-health.functions.ts`, `src/lib/audit-evidence.functions.ts`, `src/lib/client-care-data.functions.ts` +8 more |
| `provider_training_modules` | table | yes | yes | 0 | wired, empty tenant | `src/components/audit-zone/training-content-admin.tsx` |
| `hive_training_catalog` | table | yes | yes | 4 | live | `src/routes/dashboard.hive-training.index.tsx`, `src/routes/training.tsx`, `supabase/functions/auto-renew-trainings/index.ts` +2 more |
| `hive_training_courses` | table | yes | yes | 3 | live | `src/lib/hive-training-roster.functions.ts`, `src/lib/scheduling/required-qualifications.functions.ts`, `src/lib/staff-qualifications.functions.ts` |
| `hive_training_course_modules` | table | yes | yes | 3 | live | `src/routes/dashboard.hive-training.course.$assignmentId.tsx` |
| `hive_training_assignments` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hive-training-roster.functions.ts`, `src/lib/scheduling/required-qualifications.functions.ts`, `src/lib/staff-qualifications.functions.ts` +4 more |
| `hive_training_module_progress` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.hive-training.course.$assignmentId.tsx` |
| `hive_training_certificates` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.hive-training.course.$assignmentId.tsx`, `src/routes/dashboard.hive-training.index.tsx` |
| `hive_training_seats` | table | yes | yes | 0 | wired, empty tenant | `src/routes/dashboard.hive-training.index.tsx`, `supabase/functions/auto-renew-trainings/index.ts`, `supabase/functions/training-stripe-webhook/index.ts` |
| `hive_training_auto_renew_settings` | table | yes | yes | 1 | live | `src/routes/dashboard.hive-training.index.tsx`, `supabase/functions/auto-renew-trainings/index.ts`, `supabase/functions/create-training-setup-intent/index.ts` +1 more |
| `org_training_orders` | table | yes | yes | 0 | wired, empty tenant | `src/routes/signup.tsx` |

### Audit packets / auditor portal / PHI logs

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `audit_files` | table | yes | yes | 1 | live | `src/components/audit-zone/audit-zone.tsx`, `src/lib/auditor-shares.functions.ts`, `src/routes/dashboard.audit.tsx` |
| `audit_file_documents` | table | yes | yes | 1 | live | `src/components/audit-zone/audit-zone.tsx` |
| `audit_packets` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-packet.functions.ts`, `src/lib/auditor-shares.functions.ts`, `src/routes/dashboard.audit.tsx` |
| `audit_packet_items` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-packet.functions.ts`, `src/lib/auditor-shares.functions.ts`, `src/routes/dashboard.audit.tsx` |
| `audit_packages` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-package-access.ts`, `src/lib/audit-portal.functions.ts` |
| `audit_package_subjects` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-portal.functions.ts` |
| `audit_package_folders` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-portal.functions.ts` |
| `audit_package_files` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-portal.functions.ts` |
| `audit_package_access` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-package-access.ts`, `src/lib/audit-portal.functions.ts` |
| `auditor_accounts` | table | yes | yes | 0 | wired, empty tenant | `src/lib/audit-package-access.ts`, `src/lib/audit-portal.functions.ts`, `src/routes/dashboard.tsx` |
| `auditor_shares` | table | yes | yes | 0 | wired, empty tenant | `src/lib/auditor-shares.functions.ts`, `src/lib/company-overview.functions.ts` |
| `auditor_share_items` | table | yes | yes | 0 | wired, empty tenant | `src/lib/auditor-shares.functions.ts` |
| `auditor_share_access_log` | table | yes | yes | 0 | wired, empty tenant | `src/lib/auditor-shares.functions.ts` |
| `phi_access_audit_log` | table | yes | yes | 10 | live | `src/lib/phi-access-audit.functions.ts`, `src/lib/phi-access-audit.server.ts` |
| `hr_document_access_log` | table | yes | yes | 0 | wired, empty tenant | `src/lib/hr-staff.functions.ts` |
| `hr_documents` | table | yes | yes | 0 | wired, empty tenant | `src/lib/agency-health.functions.ts`, `src/lib/hr-staff.functions.ts`, `src/lib/nectar-cert-ocr.ts` +1 more |
| `employee_documents` | table | yes | yes | 0 | wired, empty tenant | `src/lib/employee-documents.functions.ts`, `src/lib/employee-face-sheet.ts`, `supabase/functions/detect-doc-dates/index.ts` |

### Forms

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `forms` | table | yes | yes | 5 | live | `src/components/company-obligations/action-required-panel.tsx`, `src/components/company-obligations/obligation-drawer.tsx`, `src/lib/company-obligations.functions.ts` +2 more |
| `form_submissions` | table | yes | yes | 0 | wired, empty tenant | `src/lib/client-specific-training.functions.ts`, `src/lib/company-obligations.functions.ts`, `src/lib/forms.functions.ts` +1 more |
| `form_notifications` | table | yes | yes | 3 | live | `src/lib/forms.functions.ts` |
| `submitted_forms` | table | yes | yes | 0 | wired, empty tenant | `src/lib/emar-pass.functions.ts`, `src/lib/hhs.functions.ts` |

### Platform / Hive exec / state packs

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `hive_platform_tickets` | table | yes | yes | 18 | live | `src/lib/hive-tickets.functions.ts`, `src/lib/state-onboarding.functions.ts` |
| `hive_base_template_versions` | table | yes | yes | 1 | live | `src/lib/state-base-versions.functions.ts`, `src/lib/state-templates.functions.ts` |
| `platform_states` | table | yes | yes | 50 | live | `src/lib/state-templates.functions.ts`, `src/routes/dashboard.tsx` |
| `state_templates` | table | yes | yes | 1 | live | `src/lib/finish-onboarding.functions.ts`, `src/lib/state-base-versions.functions.ts`, `src/lib/state-onboarding.functions.ts` +1 more |
| `state_derived_requirements` | table | yes | yes | 0 | wired, empty tenant | `src/lib/state-requirements.functions.ts` |
| `state_requirement_sources` | table | yes | yes | 0 | wired, empty tenant | `src/lib/state-requirements.functions.ts` |
| `state_structural_gaps` | table | yes | yes | 0 | wired, empty tenant | `src/lib/state-structural-gaps.functions.ts` |
| `state_onboarding_sessions` | table | yes | yes | 0 | wired, empty tenant | `src/lib/state-onboarding.functions.ts` |
| `provisioning_plan` | table | yes | yes | 14 | live | `src/lib/smart-import-commit.functions.ts`, `src/lib/smart-import-history.functions.ts`, `src/lib/smart-import-review.functions.ts` |
| `provisioning_rules` | table | yes | yes | 60 | live | `src/lib/smart-import-review.functions.ts`, `src/routes/dashboard.settings.automation-rules.tsx` |
| `functionality_reports` | table | yes | yes | 0 | wired, empty tenant | `src/lib/exec-command.functions.ts`, `src/lib/functionality-reports.functions.ts` |
| `org_support_tickets` | table | yes | yes | 1 | live | `src/lib/hive-exec.functions.ts`, `src/lib/nectar-help.functions.ts` |
| `exec_messages` | table | yes | yes | 2 | live | `src/lib/exec-messages.functions.ts`, `src/lib/inbox-messages.functions.ts` |
| `exec_message_recipients` | table | yes | yes | 2 | live | `src/lib/exec-messages.functions.ts`, `src/lib/inbox-messages.functions.ts` |
| `exec_message_attachments` | table | yes | yes | 1 | live | `src/lib/exec-messages.functions.ts`, `src/lib/inbox-messages.functions.ts` |

### Notifications / celebrations / UI prefs

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `notifications` | table | yes | yes | 414 | live | `src/components/NotificationBell.tsx`, `src/components/company-obligations/action-required-panel.tsx`, `src/lib/company-obligations.functions.ts` +12 more |
| `celebration_events` | table | no | yes | 5 | orphaned data? | no `.from()` in src/ |
| `celebration_acknowledgements` | table | no | yes | 13 | orphaned data? | no `.from()` in src/ |
| `org_celebration_settings` | table | no | yes | 0 | unused-looking | no `.from()` in src/ |
| `user_celebration_mute` | table | no | yes | 0 | unused-looking | no `.from()` in src/ |
| `user_ui_dismissals` | table | yes | yes | 0 | wired, empty tenant | `src/lib/ui-dismissals.functions.ts` |

### MCP catalog views

| table | kind | app | RLS (live) | rows | likely | evidence |
|---|---|---|---|---:|---|---|
| `mcp_table_catalog` | view | yes | n/a (view) | 0 | wired, empty tenant | `src/lib/mcp/tools/list-tables.ts` |
| `mcp_column_catalog` | view | yes | n/a (view) | 0 | wired, empty tenant | `src/lib/mcp/tools/list-tables.ts` |

### Repo-only tables (in migrations and/or app, **absent from live**)

These will 500/empty if a Sep 1 tester hits the matching UI. They are **not** drop candidates — they were never applied (or were applied only in another environment).

| table | app | source |
|---|---|---|
| `client_healthcare_providers` | yes | `supabase/migrations/20260813100000_prompts_2_15_batch.sql`; client profile providers |
| `rhs_hospitalization_days` | yes | same batch; `src/lib/rhs-hospitalization.functions.ts` |
| `rhs_evacuation_drills` | yes | same batch; `src/lib/rhs-evacuation-drills.functions.ts` |
| `training_products` | yes | `supabase/migrations/20260819210000_hive_training_enrollment_system.sql`; `src/lib/training-enrollments.functions.ts` |
| `training_purchases` | yes | same |
| `training_enrollments` | yes | same |
| `hhs_emar_logs` | no | leftover CREATE in older migrations; live uses `emar_logs`. Not present live. |

### Stale entries in `src/integrations/supabase/types.ts` (not live)

Types still list tables that live already dropped (or never had on this project):

- `provider_tenants`
- `system_features`
- `tenant_features`

Known live-dropped catalog: `provider_tenants`, `tenant_features`, `system_features` (`supabase/migrations/20260825030000_drop_legacy_tenant_tables.sql`). `staff_training_hours_entries` is **still live** even though `20260819203500_consolidate_training_hours_into_ce_ledger.sql` would drop it — that migration is **not** in live `schema_migrations`. App already writes `ce_ledger` (`src/lib/hr-training-hours.functions.ts`, `src/lib/ce.functions.ts`).

---

## 2. Usage / RLS / unused — summary

Live `pg_class` (2026-08-27, select-only on `Hive-Platform` / `dhrrukdcigiiqksibdfb`):

| | count |
|---|---:|
| Base tables in `public` | 281 |
| Views in `public` | 7 |
| Base tables with RLS **off** | **0** |
| Base tables with zero policies | **0** |
| Tables in `types.ts` but not live | 3 (`provider_tenants`, `tenant_features`, `system_features`) |
| Live table missing from `types.ts` | `phi_access_audit_log` |
| `.from()` / RPC hits in `src/` + `supabase/functions/` | ~all of the live surface |

**App still queries almost every live table.** A grep of `.from("…")` (excluding generated `types.ts`) found only **eight** live relations with no application call site:

| relation | live rows | why it is still not a Sep 1 drop |
|---|---:|---|
| `celebration_events` | 5 | Orphaned rows from a removed UI (`src/lib/company-overview.functions.ts` now computes “celebrations” from other tables). Archive **after** Sep 1 with a backup. |
| `celebration_acknowledgements` | 13 | Same. |
| `org_celebration_settings` | 0 | Same family. |
| `user_celebration_mute` | 0 | Mentioned only as a comment in `src/lib/ui-dismissals.functions.ts`. |
| `whiteboard_notes` | 4 | No `src/` query. 4 leftover rows. |
| `staff_training_hours_entries` | 0 | App already uses `ce_ledger` (`src/lib/hr-training-hours.functions.ts`). Drop SQL exists (`supabase/migrations/20260819203500_consolidate_training_hours_into_ce_ledger.sql`) but is **not** in live `schema_migrations`. |
| `employee_client_assignments` | n/a (view) | Alias of `staff_assignments` with `organization_id AS tenant_id`. Still referenced by `delete_client_hard` in SQL. |
| `day_program_billable_v` | n/a (view) | Day-program tables **are** queried; this view is not. Billing daily-rate path uses `hhs_daily_records_v`. |

Everything else in section 1 with **app = yes** is **ineligible to drop** for Sep 1, including empty tables (`scheduled_shifts` is 0 rows **and** the scheduler writes it).

Repo migrations that **enable** RLS were found for nearly all CREATE TABLE files. Two tables had no `ENABLE ROW LEVEL SECURITY` string in migrations (`hhs_monthly_certifications`, `user_ui_dismissals`) but **live both have RLS on** (2 policies each). Treat migration-grep “missing ENABLE” as noise when live disagrees.

---

## 3. Consolidation candidates (do **not** do these before Sep 1)

These are the places a data engineer would *eventually* collapse surface area. Each bullet names why it is **not** a free drop today.

### True overlapping systems (real consolidations, later)

1. **Training / LMS — four parallel stacks, all queried**
   - Hive catalog commerce: `hive_training_*` + `org_training_orders` — `src/routes/dashboard.hive-training.index.tsx`, `src/lib/hive-training-roster.functions.ts`.
   - In-app LMS: `courses`, `course_modules`, `lessons`, `lesson_*`, `course_assignments` — `src/routes/dashboard.courses.*.tsx` (364 live lessons).
   - Tracks / topics / programs: `training_tracks`, `training_topics`, `training_programs`, `program_*`, `training_completions`, `training_modules`, `user_training_progress` — `src/routes/dashboard.training.*.tsx` still hits `training_modules` and `user_training_progress`.
   - CE hours: `ce_ledger` / `ce_modules` / `ce_settings` — `src/lib/ce.functions.ts`.
   - **Plus** a fifth, **unapplied** stack: `training_products` / `training_purchases` / `training_enrollments` in `src/lib/training-enrollments.functions.ts` and `supabase/migrations/20260819210000_hive_training_enrollment_system.sql`.
   - JSON-on-parent would destroy certificate / seat / lesson progress independently. This is a product decision, not a storage one.

2. **Shift facts — three tables, three jobs**
   - `scheduled_shifts` = calendar plan (`src/lib/scheduling/shifts.functions.ts`). Empty today; the Sep 1 test will fill it.
   - `evv_timesheets` = punches / EVV evidence (`src/lib/evv-codes.ts`, clock UI). 29 live rows.
   - `general_shifts` = non-EVV / payroll-ish time (`src/hooks/use-general-shift.tsx`, `src/routes/dashboard.financial.monthly-grid.tsx`). 0 rows, **still queried**.
   - Do not merge these. The domain model *wants* plan vs actual vs non-EVV time.

3. **Audit packaging — three products**
   - `audit_files` + `audit_file_documents` — `src/components/audit-zone/audit-zone.tsx` (1 live file).
   - `audit_packets` + `audit_packet_items` — `src/routes/dashboard.audit.tsx`, `src/lib/audit-packet.functions.ts`.
   - `audit_packages*` + `auditor_*` — `src/lib/audit-portal.functions.ts` (external auditor portal).
   - Same English word, different workflows. Folding them is an app rewrite.

4. **Incidents**
   - `incident_reports` (canonical, `src/lib/incidents.functions.ts`, 1 row).
   - `hhs_incident_reports` (HHS hub, `src/routes/dashboard.hhs-hub.$clientId.tsx` via `as never`).
   - Could become a `kind`/`source` column later. Not before Sep 1.

5. **Forms**
   - `forms` + `form_submissions` + `form_notifications` — live custom-forms feature (`src/lib/forms.functions.ts`, 5 forms).
   - `submitted_forms` — 0 rows, still selected with `as never` in `src/lib/hhs.functions.ts` and `src/lib/emar-pass.functions.ts`. Candidate to **stop querying** then archive; do not drop while those files still `.from("submitted_forms")`.

6. **Extracted fields**
   - `extracted_fields` (smart import, 1015 rows, `src/lib/smart-import.functions.ts`).
   - `nectar_extracted_fields` (authoritative-source OCR, 136 rows, `src/lib/authoritative-sources.functions.ts`).
   - Similar shape, different owners. JSON-on-parent would break review UIs.

7. **Locations vs homes**
   - `teams` = homes (CLAUDE.md). `locations` exists live (1 row) and is still written by `src/lib/scheduling/locations.functions.ts`. CLAUDE.md: rebuild only from `teams`; **never treat `home_designations` as locations**. Consolidation = data repair + code cutover, not DROP.

### Unused / leftover (Phase B archive list — still do not drop this week)

See the eight-row table in §2. Add only after a second full-repo grep (including `supabase/functions/` and SQL function bodies) and a backup.

### JSON/column-on-parent (later, not unused)

These are **normalized on purpose**. Collapsing them is a product/UX change:

- Obligation graph: `company_obligations` → `instances` → `assignees` / `completions` (63 / 77 / 53 / 2 rows). The Sep 1 compliance desk is this graph.
- Import graph: `import_jobs` → `subjects` → `documents` / `extracted_fields` / `provenance`.
- PBA: `pba_accounts` / `pba_transactions` / `pba_audit_samples` (empty, but `src/routes/dashboard.pba-ledger.tsx` + `generate_pba_audit_sample` RPC).
- eMAR: `client_medications` + `emar_logs` + `emar_log_addenda` + `controlled_med_counts` + `medication_transfers` + `medication_change_proposals`. HIPAA-relevant; do not JSON-blob MAR history.
- Chore / meal trees: multiple child tables already match the UI.

**Already-written consolidations that must not be re-run blindly:**

- `20260819203500_consolidate_training_hours_into_ce_ledger.sql` — copies `staff_training_hours_entries` → `ce_ledger` then DROP. **Not applied live.** App already on `ce_ledger`. Safe Phase B *after* confirming 0 rows and no remaining `.from("staff_training_hours_entries")`.
- `20260819203000_drop_verified_dead_tables.sql` / `20260825030000_drop_legacy_tenant_tables.sql` — some already live (`provider_tenants` gone); do not re-apply as a bundle.

---

## 4. Security — real risk vs linter noise

Source: live `get_advisors` (security), `pg_policy`, `pg_proc`, table grants. Advisors: **1 ERROR, 88 WARN**.

### Real risk (worth a human’s time after Sep 1; do not schema-churn this week)

1. **`public.org_member_directory` is `security_invoker=false` (SECURITY DEFINER view)** — the only advisor ERROR.
   - Definition (live): selects `id, full_name, first_name, last_name, email, username, account_status, is_active, team_id, position` from `profiles` for users who share an active `organization_members` org with `auth.uid()`.
   - Effect: bypasses `profiles` RLS (own-row + managers). **Any org member** can read coworker emails/names via this view.
   - That is **intentional directory behavior** used in ~30 files (`src/lib/company-obligations.functions.ts`, `src/routes/dashboard.team.tsx`, etc.). It is **not** a cross-tenant dump.
   - Residual: workforce PII (email) to every DSP in the org; if `profiles` later grows columns, this view must not start selecting them. Fix later: `CREATE OR REPLACE VIEW … WITH (security_invoker = true)` **only if** `profiles` RLS is widened to match, or keep DEFINER but freeze the column list.
   - **Do not drop or rewrite the view before Sep 1** — the app will break.

2. **`seed_org_role_permissions(_org uuid)` is SECURITY DEFINER, executable by `anon`, and has no `auth.uid()` check.**
   - Advisor: `anon_security_definer_function_executable`.
   - Body inserts default `role_permissions` for the given org UUID (`ON CONFLICT DO NOTHING`).
   - Anon cannot overwrite existing grants, but **can seed a blank org** and is a PostgREST RPC (`/rest/v1/rpc/seed_org_role_permissions`).
   - Fix later: `REVOKE EXECUTE … FROM anon, public`; require `is_hive_executive` or `is_org_admin_or_manager`. **Not a table drop.**

3. **`authenticated` has `GRANT ALL` (including `TRUNCATE` / `REFERENCES` / `TRIGGER`) on nearly every `public` table.**
   - Platform default, not Hive-specific. **RLS does not apply to `TRUNCATE`.**
   - Mitigations: tables are not owned by `authenticated`; FKs block many truncates; still revoke `TRUNCATE, TRIGGER, REFERENCES` from `authenticated` after Sep 1 as hygiene.
   - Linter did **not** flag this; it is grant-table noise that is *more* real than “SECURITY DEFINER helper executable by authenticated.”

4. **Caseload PHI is function-gated, not “org members see all clients.”**
   - Live `clients` SELECT: `can_access_client_phi(id)` (`supabase/migrations/20260825020000_hipaa_security_hardening.sql` — **present live** even though that filename is missing from `schema_migrations`).
   - Same helper on `client_medications`, `emar_logs`, `evv_timesheets` (plus staff-own / admin).
   - `can_access_client_phi` / `clients_for_staff` / `staff_assigned_to_client` are SECURITY DEFINER **and** internally check `auth.uid()`. Advisor WARNs on all of them — **that is linter noise** (you *want* SECURITY DEFINER to avoid RLS recursion on `organization_members`).
   - Residual: any authenticated user may *call* `clients_for_staff(_org, _staff)` but the body raises `forbidden` unless caller is that staff, admin/manager, or hive exec (`20260825020000_hipaa_security_hardening.sql`).

5. **`mcp_exec_read_sql(query text)`** — `src/lib/mcp/tools/sql-query.ts`, live function is **SECURITY INVOKER**, SELECT/WITH only, extra keyword block vs the original migration `supabase/migrations/20260705231159_699860a8-0d2b-4c4c-bb9a-898dc5d778bb.sql`.
   - RLS applies. Risk = “authenticated user can ad-hoc SELECT anything their policies allow,” which is the MCP product. Not anon. Do not expose to `anon`.

6. **`rebuild_wipe_requirements_tns_fake`** — SECURITY DEFINER, hard-coded TNS org UUID, deletes `nectar_requirements` for that org after an admin/hive-exec check. **Demo footgun**, not a tenant-hop. Keep off Sep 1 scripts.

7. **`delete_client_hard`** — SECURITY DEFINER, admin/manager + archived-only. Dangerous if a manager is phished; not a missing-RLS bug.

### Linter noise (do not treat as a breach)

- **81× `authenticated_security_definer_function_executable`.** Almost every helper (`is_org_member`, `is_org_admin_or_manager`, `has_permission`, trigger functions like `handle_new_user`). Required pattern to break RLS recursion. Triggers are not useful as anonymous RPCs even if EXECUTE is granted.
- **`accept_invitation` granted to `anon`:** function immediately `RAISE` if `auth.uid() IS NULL`. Dead grant. Invite flow is authenticated.
- **`verify_certificate(p_code)` granted to `anon`:** intentional public certificate lookup (name + course title by code). Not PHI.
- **`USING (true)` policies (live):** catalog/read-only reference data, all `TO authenticated` (or `service_role` only):
  - `feature_registry` SELECT
  - `hive_base_template_versions` SELECT
  - `platform_states` SELECT
  - `state_derived_requirements` SELECT
  - `training_checklist_mappings` SELECT
  - `training_modules` SELECT
  - `training_topics` SELECT
  - `nectar_rate_state` ALL — **`TO service_role` only**
  - `hive_training_auto_renew_settings` ALL — **`TO service_role` only**
  - Not org PHI. Repo grep also found historical `USING (true)` on hive training catalog grants to `anon` (`supabase/migrations/20260702192845_*.sql`); **live anon table grants are only** `hive_training_catalog`, `hive_training_courses`, `hive_training_course_modules` SELECT (public catalog). Certificates are not anon-granted live.
- **`extension_in_public` (`vector`, `pg_net`):** Supabase default. Not a table-count problem.
- **`function_search_path_mutable`** on two nectar history triggers: harden `SET search_path` later.

### Missing RLS?

**None on live base tables.** Views have no RLS; six use `security_invoker=true` so underlying table RLS applies (`hhs_daily_records_v`, `day_program_billable_v`, `employee_client_assignments`, both MCP catalogs, `nectar_requirement_usage_current_v`). The seventh is `org_member_directory` (§4.1).

`FORCE ROW LEVEL SECURITY` is **not** set (so table owners/bypass roles skip RLS). Normal for Supabase (`postgres` / `service_role`). App browser clients use `authenticated` + anon key; they do not bypass.

---

## 5. DO NOT TOUCH (Sep 1 test)

Do not DROP, TRUNCATE, rewrite RLS, rename, or “simplify” these. Empty row counts do **not** mean unused.

### Nuclear (test dies immediately)

| object | why |
|---|---|
| `clients` | Identity of every person served. Caseload RLS. |
| `client_billing_codes` | The “1056.” No auth row → no shift, no billing (`CLAUDE.md`). |
| `organization_members` | Tenancy. **No FK to `profiles`** — join in JS only (`CLAUDE.md`). |
| `profiles` | Staff identity. RLS is own-row + managers; directory is the view. |
| `organizations` | Tenant root. |
| `evv_timesheets` | Punches, EVV, payroll evidence. 29 rows already. |
| `scheduled_shifts` | Calendar. 0 rows **and** the scheduler’s write path. |
| `daily_logs` | Unified daily notes (replaced `hhs_daily_records`). 60 rows. HHS hub writes here (`src/lib/hhs.functions.ts`). |
| `hhs_daily_records_v` | Billable HHS/RHS day. Billing + financial tabs. **Never read a table named `hhs_daily_records`** (dropped live; CLAUDE.md). |
| `company_obligations` | 63 rows. |
| `company_obligation_instances` | 77 rows. |
| `company_obligation_instance_assignees` | 53 rows. |
| `company_obligation_completions` | Completions / desk. |
| `role_permissions` | 6628 rows. AuthZ. |
| `service_codes` | 486 rows. |
| `staff_assignments` | Caseload. Feeds `can_access_client_phi`. |
| `teams` | Homes. |
| `home_designations` | CARE-TEAM role labels — **never delete, never treat as locations** (`CLAUDE.md`). |
| `nectar_requirements` | 1768 rows. Authoritative sources. |
| `emar_logs` / `client_medications` | eMAR / PHI. |
| `incident_reports` | Incident workflow. |
| `client_progress_summaries` | Summary cadences / UPI. |
| `hive_executives` / `is_hive_executive` / `is_super_admin` | Platform auth (live `is_super_admin` delegates to hive exec). |
| `org_member_directory` | Staff name joins across the app. |
| `notifications` | 414 rows; obligation desk. |

### Also do not touch (wired for the test even if empty)

`recurring_shift_patterns`, `week_templates`, `shift_templates` (36 rows), `shift_swap_requests`, `shift_callouts`, `general_shifts`, `client_approved_locations`, `location_coverage_requirements`, `locations` (polluted history — **repair later, don’t drop**), `hhs_monthly_attendance`, `hhs_host_home_settings`, `host_home_certifications`, `nectar_attestations` (37), `nectar_draft_jobs`, `nectar_documents`, `import_*` (active import: 34 jobs / 1015 extracted fields), `billing_submissions`, `provider_authorized_codes`, `pba_*`, `forms` / `form_submissions`, `ce_ledger`, `certifications` / `external_certifications`, `staff_baseline_training_completions`, `document_attestations`, `upi_attestations`, `policy_signatures`, `hrc_*`, `phi_access_audit_log`, `invitations`, `feature_registry`, `org_subscriptions`.

### Do not “fix” these landmines during the test

- Recreate `/fix-admin`.
- Delete `hhs_daily_records` (already gone live) or the **view**.
- Drop `home_designations`.
- PostgREST-embed `organization_members` ↔ `profiles`.
- Apply `20260819203500_*.sql` or any DROP migration.
- Enable `restore_my_admin_role` (live body is `RAISE EXCEPTION '… permanently disabled'`).
- Run `rebuild_wipe_requirements_tns_fake` against TNS.

---

## 6. Phased plan

### (A) This week — zero drops

- Freeze DDL. No DROP TABLE, no policy rewrites, no view security_invoker flip on `org_member_directory`.
- If anything is applied via `docs/SQL_HANDOFF.md`, keep it **additive** (indexes, the unapplied enrollment / RHS hospitalization tables if the Sep 1 script needs those screens).
- Optional **non-breaking** grant hygiene only if a human is already in the SQL editor and wants a one-liner: `REVOKE EXECUTE ON FUNCTION public.seed_org_role_permissions(uuid) FROM anon, public;` — does not change tables. Skip if there is any doubt the signup path calls it as anon (it should not).
- Regenerate `types.ts` **after** Sep 1, not during freeze (would churn every compile).
- Success metric: Sep 1 testers can clock, note, schedule, bill-preview, and complete obligations without “relation does not exist.”

### (B) After Sep 1 — unused-table **archive** (not drop-from-prod-on-Friday)

Gate for each candidate: (1) zero `.from("name")` / `.rpc` in `src/` and `supabase/functions/`, (2) zero references in `pg_proc.prosrc` and views, (3) row count recorded, (4) rename to `z_archive_*` or move to schema `archive` **or** dump-then-drop on a branch database first.

Start with:

1. `celebration_events`, `celebration_acknowledgements`, `org_celebration_settings`, `user_celebration_mute` (UI gone; leftover rows).
2. `whiteboard_notes` (4 rows, no app).
3. `staff_training_hours_entries` — apply the already-written ce_ledger consolidation on a clone, then live, after grep is still clean.
4. Confirm `day_program_billable_v` unused; keep `day_program_*` tables (they **are** queried).
5. Remove stale `types.ts` entries for `provider_tenants` / `tenant_features` / `system_features`.
6. Decide whether unapplied repo tables (`training_enrollments*`, `rhs_hospitalization_days`, `client_healthcare_providers`) get applied or have their **app call sites** stubbed. Right now the app expects them; live does not have them.

### (C) Later — real consolidations

Only with a product owner:

1. Pick **one** training system of record; migrate rows; then archive the others.
2. Incident: fold `hhs_incident_reports` into `incident_reports` with a source flag; then delete the HHS-specific table **after** `dashboard.hhs-hub.$clientId.tsx` is switched.
3. Forms: stop querying `submitted_forms`; archive.
4. Locations: rebuild from `teams`; stop writing `locations`; keep the table until geofence EVV is proven on `teams`.
5. Audit: keep portal (`audit_packages`) vs internal packets (`audit_packets`) vs file cabinet (`audit_files`) until those three UIs are one.
6. Security follow-ups: revoke `TRUNCATE` from `authenticated`; `security_invoker` on `org_member_directory` paired with a directory SELECT policy on `profiles`; revoke anon EXECUTE leftover RPCs; `SET search_path` on the two mutable nectar triggers; consider `FORCE ROW LEVEL SECURITY` only after proving service_role jobs still work.

---

## Method / files

| source | role |
|---|---|
| `src/integrations/supabase/types.ts` | Generated table/view/function list (283 tables / 7 views / 59 functions). Stale vs live. |
| `supabase/migrations/*.sql` (391 files) | Intended DDL, RLS, GRANTs. **Not** a replica of live. |
| `src/**/*.ts(x)`, `supabase/functions/**` | `.from("table")` and `.rpc("fn")` — drop gate. |
| `docs/SQL_HANDOFF.md`, `CLAUDE.md` | Handoff vs live, landmines. |
| Live project `dhrrukdcigiiqksibdfb` | `list_tables`, `pg_policy`, `pg_proc`, grants, `get_advisors` (security). Select-only. No `apply_migration`. |

Row counts are `n_live_tup` estimates. Policy counts in §1 were not re-copied per table (live minimum is 1 policy per base table; many have 2–6). View row counts are not meaningful.

**This audit never recommends dropping a table the application still queries.**
