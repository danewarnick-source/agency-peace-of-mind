# DSPD Scheduler Overhaul

This is a large, multi-phase rebuild. I'll execute it in three approvable phases. **This plan covers Phase 1 in full and outlines Phases 2 & 3.** I'll come back with a focused plan before starting each later phase so we don't blow past 50K-char limits or merge unreviewed changes.

## Existing tables I'll reuse (verified)

- `scheduled_shifts` — has `client_id`, `status` (CHECK pending/accepted/declined — will widen), `published`, `job_code`, `code_id → provider_authorized_codes`. **Add**: `service_code text`, `location_id uuid`, `is_awake_overnight bool`, `callout_reason text`, `created_from text`, `parent_shift_id uuid` self-FK, `override_reason text`. Widen status CHECK to draft|published|accepted|declined|open|cancelled. Backfill: `status='accepted'` where `published=true`, else `draft`.
- `shift_templates` — already name + start/end + sort. **Add** `color text`. Migrate: drop/rename any rows that look like service codes (DSI etc.); seed Morning/Swing/Overnight/Custom per org if empty.
- `shift_callouts`, `callout_escalation_events`, `shift_swap_requests`, `staff_assignments`, `client_billing_codes`, `client_ratios`, `home_designations`, `home_staff_designations`, `client_specific_trainings`, `certifications`, `org_shift_behavior_settings`, `teams` — reuse as-is in Phase 1.

## Phase 1 — Data model + the Board

### 1A. Migration (single migration)

1. Alter `scheduled_shifts` (add columns above, widen status check, self-FK on `parent_shift_id`).
2. **New `locations`** (id, org_id, name, type CHECK residential|host_home|day_site|community, address, active, sort, timestamps) + grants + RLS + updated_at trigger. `home_designations` stays for backwards compat but `locations` is the first-class record. Seed one `locations` row per existing `home_designations.label` per org and write the mapping into a temp comment; clients without a home stay null (render in "1-on-1 / Community" bucket).
3. **New `location_coverage_requirements`** (id, org_id, location_id, day_of_week int NULL 0–6, start_time, end_time, required_staff_count int, awake_required bool, notes) + grants + RLS + trigger.
4. **New `client_weekly_targets`** (id, org_id, client_id, service_code text, target_hours_per_week numeric, source text default 'worksheet', unique(client_id, service_code)) + grants + RLS + trigger.
5. RLS pattern: org-scoped via `is_org_member(organization_id, auth.uid())` (read) and `is_org_admin_or_manager` (write) — matches existing style. Service role full access.

(`client_status_events` and `shift_claims` deferred to Phase 3 where they're used.)

### 1B. Server functions (new files, client-safe imports)

- `src/lib/scheduling/locations.functions.ts` — list/create/update locations; coverage requirements CRUD.
- `src/lib/scheduling/shifts.functions.ts` — list shifts (range + location filter, includes segments), create/update/delete, publish, "add segment", recurrence expansion writing real rows.
- `src/lib/scheduling/eligibility.functions.ts` — `rankStaffForShift({clientId, serviceCode, startsAt, endsAt})` returning ordered staff with reasons (active employment, no overlap, assignment/team, cert currency, client-specific training, age≥21 for HHS, projected weekly hours). Pure logic factored into `eligibility.ts` so it can be reused by NECTAR in Phase 3.
- `src/lib/scheduling/targets.functions.ts` — read/write `client_weekly_targets`, compute weekly worked hours per (client, code).
- All use `requireSupabaseAuth` + org membership; admin writes gated by `has_org_role admin/super_admin`.

### 1C. UI rebuild — `/dashboard/scheduling`

New component tree under `src/components/scheduling/v2/` (kept beside legacy code so we don't break the old route mid-flight). Route file swaps to the new shell at the end.

- `BoardShell` — week nav (existing), location tabs from `locations`, lens toggle (Staff/Client/Both), Settings drawer, NECTAR advisory bar, Action-needed card. Keep "Import a schedule" + "Homes & Teams" buttons.
- `LocationTabs` — All Locations | each location | 1-on-1 / Community.
- `AllLocationsGrid`:
  - Residential row → `CoverageBar24h` per day (color = service-code family for whichever staff is on, red = gap vs `location_coverage_requirements`, striped = over-coverage; segments subtract from base for their window). Compact label below.
  - Host home row → 3 status dots (daily note done / overnight confirmed / agency visit hrs >0) + weekly DS-hours meter from `client_weekly_targets`. **No coverage bar, never red.**
  - 1:1 / community client row → weekly target meter per code.
- `SingleLocationGrid` — Staff or Client lens × days, multi-staff renders as separate cards (not pills), each shows first name + client first name + code chip + time + duration badge + status icons.
- `DayTimelineDrawer` (75% width sheet) — 24h axis, swimlane per staff, draggable/resizable blocks, required-coverage band shaded red where uncovered, `+` to create at clicked time pre-filled.
- `ShiftCreateDialog` — strict order Client → Service code (filtered to `client_billing_codes` for that client; empty state with Billing link + "unbilled/other" toggle) → Time (AM/PM segmented control, duration badge, template quick-apply chips, unusual-duration amber note like ">6h on DSI") → Staff (ranked list with green check / amber chips and inline OT projection). Recurrence section writes real rows. Host staff for the location are excluded.
- `AddSegmentDialog` — invoked from a saved base shift card; constrained as spec'd, sets `parent_shift_id`.
- `ShiftCard` — variant by status (dashed if draft, conflict border red, cert warn amber shield, NECTAR sparkle if `created_from='nectar'`). Segment cards render inset on parent.
- `useShiftBoardData` hook — TanStack Query for shifts in range, locations, coverage reqs, targets, client billing codes; invalidation on mutations.
- Service-code color map module: `src/lib/scheduling/code-colors.ts` (Residential teal / Supported Living blue / Day Supports green / Employment purple / Respite pink / Other slate). Tokens live in `src/styles.css` as semantic CSS vars (`--sched-residential`, etc.) so dark mode + theming behave.

### 1D. Staff view (`/dashboard/schedule`)

Phase 1 keeps existing accept/decline UI mostly intact but starts reading the widened `status` field. Mobile-first agenda redesign and accept/decline workflow lands in Phase 2.

### Phase 1 acceptance checks I'll run before declaring done

1. Create-shift dialog enforces client→code→time→staff and code list is filtered to that client's billing codes.
2. 3a–5p on DSI shows "14h" badge + amber note.
3. Residential location shows red gap on uncovered required interval; host home shows dots + DS-hours meter and never a red gap.
4. Same-staff overlap renders red conflict; "Add 1:1 segment" inside same parent saves cleanly and renders inset; home coverage bar dims for that window.
5. Host staff at a host_home location are excluded from that location's staff picker.
6. Clicking a day cell opens the timeline drawer with swimlanes.

## Phase 2 — Conflict engine, publish/accept, settings (separate plan)

Will introduce: `src/lib/scheduling/conflicts.ts` pure evaluator, `org_shift_behavior_settings.rule_settings` JSON shape, Conflicts panel, Publish-summary modal, mobile staff agenda with Accept/Decline + reason, "Action needed" card consolidation, Settings drawer rework (rules list with Off/Warn/Block, rename templates, coverage editor, per-client weekly targets editor). Override path writes `override_reason` on shift.

## Phase 3 — Callouts, open shifts, NECTAR ranking (separate plan)

New `client_status_events` table + extension of `shift_callouts` (reason taxonomy → cancel vs. open). Open-shifts rail + staff agenda "qualified open shifts" using Phase 1 eligibility. Claim flow via extended `shift_swap_requests` or new `shift_claims`. NECTAR drafts (`created_from='nectar'`, sparkle, review banner) + "NECTAR suggest" for open shifts; never proposes hard-blocked staff.

## Global constraints honored throughout

- TypeScript strict, TanStack Router file routes unchanged, RLS on every new table, server functions only.
- Mobile usable at 375px (create dialog + staff agenda).
- Won't touch: EVV punch pad, daily logs, eMAR, billing pages, HHS hub.
- Existing route paths unchanged.

## What I'll deliver in the **next** assistant turn (Phase 1 only)

1. One Supabase migration (alter scheduled_shifts, create locations, location_coverage_requirements, client_weekly_targets; widen status check; backfill).
2. Server function files listed in 1B.
3. New component tree under `src/components/scheduling/v2/`, code-colors module, semantic CSS tokens.
4. Swap `src/routes/dashboard.scheduling.tsx` to the new shell (legacy components left in place until Phase 2 confirms parity).
5. Light touch on `src/routes/dashboard.schedule.tsx` only to read new status values.

Approve and I'll run the migration tool first (so types regenerate), then ship the code in the follow-up turn.