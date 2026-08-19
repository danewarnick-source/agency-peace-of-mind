# Getting the table count down: a realistic consolidation strategy

## Blocker to clear first: four tables the code expects don't exist

The build is currently failing because `scope-assignments-panel.tsx`, `use-permissions.tsx`, `employees.functions.ts` and `permissions.functions.ts` query `scope_assignments`, `user_permission_overrides`, `permission_audit_log`, and `role_change_audit_log`, plus a `flag_member_deactivated` function. A live check confirms **none of the four tables and neither the function exist in the database** — this is left over from the permissions work, not from schema cleanup. Step 0 of any consolidation work is deciding whether to create those four tables (they belong to the permissions/RBAC domain and would count against the target) or strip the code paths that reference them. I'd create them: the permission-override UI is real and currently dead.


## What the database actually looks like right now

- **285 tables** in `public`.
- **7** have zero references anywhere in `src/` (excluding generated types): `system_features`, `rbac_roles`, `nectar_rate_state`, `hive_training_orders`, `hive_training_order_items`, `hive_training_auto_renew_runs`, `hive_training_renewal_intents`. Two of those (`rbac_roles` 75 rows, `system_features` 14 rows) still hold data, so they are read by SQL/functions rather than the app.
- **~50** more are touched from only one or two places — thin, single-surface features.
- Everything else is wired into working code.

The important consequence: **there is no path from 285 to 50–90 by deleting unused tables.** The last cleanup found 15 truly dead tables and that was the whole supply. Reaching 50–90 would mean deleting roughly two thirds of the schema, which means deleting shipped features (meals/chores, day program, PBA, referrals/CRM, loans, HRC, the training marketplace, Gmail ingestion, host-home monthlies). A DSPD compliance platform with this many surfaces lands honestly somewhere around **150–180 tables**.

So the recommendation is: pick a target of ~160, get there through five structural consolidations plus one feature-scope decision, and stop treating raw table count as the goal.

## The five consolidations that actually remove tables

Each one collapses a family of near-identical tables into one table plus a discriminator column, rather than deleting capability.

### 1. Training & certifications — 27 tables to ~8 (removes ~19)
Today there are four parallel training models: the LMS (`courses`/`course_modules`/`lessons`/`lesson_progress`/`lesson_quiz_attempts`), the topic model (`training_topics`/`training_topic_progress`/`training_modules`), the program/track model (`training_programs`/`program_courses`/`program_assignments`/`program_acknowledgements`/`training_tracks`/`track_programs`/`track_assignments`), and the completion ledgers (`training_completions`/`user_training_progress`/`staff_baseline_training_completions`/`training_person_modules`/`staff_training_hours_entries`/`ce_ledger`).
Collapse to: `training_content` (course/module/lesson/topic as a self-referencing tree with a `kind` column), `training_assignments`, `training_progress`, `training_completions`, `training_collections` (program/track) + membership, `ce_settings`, `certifications`, `certification_types`. Keep `external_certifications` separate — it is genuinely a different domain.

### 2. Audit sharing — 11 tables to ~4 (removes ~7)
Three complete implementations of the same idea, all empty: `audit_packets*`, `audit_packages*`, `auditor_shares*`. Keep `audit_packets` + `audit_packet_items` (the one wired to `/dashboard/audit`) and `auditor_shares` + `auditor_share_items` as the delivery layer. Drop the five `audit_package*` tables and `auditor_share_access_log` (fold into the existing audit log).

### 3. Daily-living: chores, meals, nutrition, shopping — 15 tables to ~5 (removes ~10)
`chore_definitions`/`chore_spaces`/`chore_space_clients`/`chore_daily_items`/`chore_client_rotation`/`chore_completions`/`client_chore_support` and `client_meals`/`client_meal_plans`/`client_meal_actuals`/`client_meal_support`/`client_recipes`/`client_recipe_ingredients`/`client_nutrition_config`/`client_shopping_items`/`org_shopping_library` are two copies of the same shape: definition → assignment → daily instance → completion.
Collapse to `adl_definitions`, `adl_assignments`, `adl_daily_items`, `adl_completions`, `adl_recipes`, with a `domain` column of `chore | meal`.

### 4. Scheduling & shift exceptions — ~20 to ~10 (removes ~10)
`scheduled_shifts`, `general_shifts`, `recurring_shift_patterns`, `shift_templates`, `week_templates`, `shift_swap_requests`, `shift_callouts`, `callout_escalation_events`, `time_off_requests`, `staff_rotation_groups`/`_members`, `shift_reports`, `shift_completeness_flags`.
`evv_timesheets` is the only shift table with real rows (135). Make it the single shift record — general/non-client time becomes a row with a null client and a category. Collapse the three template tables into one `shift_templates` with a `scope` column, and the four exception tables into one `shift_exceptions` with a `kind` of `swap | callout | time_off` plus an events child.

### 5. HHS monthlies & host-home — 12 to ~6 (removes ~6)
`hhs_monthly_attendance`/`hhs_monthly_summaries`/`hhs_monthly_certifications`/`hhs_host_home_monthly` are four monthly rollups keyed the same way; one `hhs_monthly` table with typed sections covers them. Same for `hhs_medical_logs`/`hhs_transfer_logs`/`hhs_evacuation_drills` → one `hhs_event_log` with a `kind`.

Plus the small stuff: drop the 7 unreferenced tables (after confirming `rbac_roles` and `system_features` aren't read by a database function), and fold `nectar_report_runs`/`nectar_saved_reports`/`nectar_report_schedules` into two tables.

**Running total: ~285 → ~230 from consolidation alone.**

## The scope decision that closes the rest of the gap

The remaining ~70 tables are not redundant — they are features that exist but have never been used in production. Each is a candidate for "not part of the 2026-07-01 launch, remove now and rebuild if asked":

| Feature area | Tables | Rows |
| --- | --- | --- |
| HIVE training marketplace (orders, seats, renewals) | 14 | ~10 |
| PBA / client funds / loans / distributions | 17 | ~5 |
| Referrals & CRM | 6 | 0 |
| Day program | 4 | 0 |
| Gmail ingestion | 4 | 0 |
| Behavior support (`bc_*`) | 6 | 0 |
| HRC committee | 5 | 3 |
| State onboarding / provisioning | 12 | ~160 |

Cutting the four that are entirely empty and unlaunched (referrals, day program, Gmail ingestion, behavior support = 20 tables) is low risk. Cutting all eight gets to roughly **160 tables**, which is the practical floor without gutting compliance functionality.

## Suggested order of work

1. **Decide the scope question first** — which of the eight unlaunched feature areas survive to launch. Everything downstream depends on that answer, and dropping an unlaunched area is far cheaper than consolidating it.
2. **Drop the 7 unreferenced tables** + the `audit_package*` family + `general_shifts`. No data, no consolidation logic, immediate ~13 tables.
3. **Consolidation 1 (training)** — biggest win, and the four parallel models are actively confusing to maintain.
4. **Consolidations 3, 4, 5** — one per migration, each with its code sweep in the same change.
5. **Re-measure.** Set the next target from what's left rather than from a number chosen up front.

## Technical notes

- Every consolidation is: new table + `INSERT ... SELECT` backfill + code sweep + drop old tables, in that order across at least two migrations, never one. Do not drop in the same migration that backfills.
- Each new table needs its own `GRANT` block and org-scoped RLS re-derived from the policies on the tables it replaces — a merged table inherits the *strictest* policy of its inputs, not the loosest.
- `src/integrations/supabase/types.ts` regenerates after each migration; expect a round of type fixes per consolidation.
- `supabase/migrations/` does not reliably match the live database, so each step starts with a confirming query against live before the migration is written.
- Run the build after any step that deletes route files so `src/routeTree.gen.ts` regenerates.
