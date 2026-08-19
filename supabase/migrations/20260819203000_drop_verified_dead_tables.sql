-- Database cleanup batch 1 (revised): drop tables verified via full-codebase
-- grep to have ZERO references in src/**/*.{ts,tsx} (checked against every
-- .from("...") / .rpc("...") call site, not just a keyword search). Row
-- counts were NOT independently re-verified here (no live DB access from
-- this session) — confirm zero rows before running.
--
-- NOTE: this is a deliberately smaller list than the original Batch 1 spec.
-- Audit found most of the originally-proposed tables (celebration_*,
-- whiteboard_notes, user_ui_dismissals, state_derived_requirements,
-- state_structural_gaps, state_requirement_sources, state_templates,
-- state_onboarding_sessions, hive_base_template_versions,
-- provisioning_plan, provisioning_rules, platform_states,
-- agreement_requirements, nectar_compliance_flags/instances/rules/
-- rule_history, general_shifts, external_certifications,
-- functionality_reports, mcp_column_catalog, mcp_table_catalog) are
-- actively read/written by live src/lib/*.functions.ts modules and/or
-- reachable dashboard routes. Those are NOT dropped here.

-- Hive training commerce tables (replaced by new training system)
DROP TABLE IF EXISTS public.hive_training_order_items CASCADE;
DROP TABLE IF EXISTS public.hive_training_orders CASCADE;
DROP TABLE IF EXISTS public.hive_training_renewal_intents CASCADE;
DROP TABLE IF EXISTS public.hive_training_auto_renew_runs CASCADE;
DROP TABLE IF EXISTS public.hive_training_seat_available CASCADE;

-- Superseded by current systems
DROP TABLE IF EXISTS public.master_attestations CASCADE;
DROP TABLE IF EXISTS public.referral_purge_tombstones CASCADE;
DROP TABLE IF EXISTS public.staff_nudges CASCADE;

-- Replaced by user_permission_overrides
DROP TABLE IF EXISTS public.user_capability_overrides CASCADE;

-- Permissions consolidation — superseded by role_permissions; only
-- reference in src/ is a stale FK comment in generated types.ts, no query
DROP TABLE IF EXISTS public.rbac_roles CASCADE;

-- Dead misc — zero query references anywhere in src/
DROP TABLE IF EXISTS public.unfiled_items CASCADE;

-- Deprecated (named as such; superseded by hhs_daily_records_v per CLAUDE.md)
DROP TABLE IF EXISTS public.hhs_emar_logs_deprecated CASCADE;
