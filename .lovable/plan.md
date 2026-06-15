## Goal

Replace the existing admin scheduler at `/dashboard/schedule-preview` with a new code-section scheduler that matches the screenshots, plus three connected changes: a real publish/time-off pipeline into the existing staff page, a day-program attendance UI (DSG/DSP), and an HHS administrative-hours field on the client profile.

Everything reads real records only — no mocks, no seed data, no hardcoded lists.

## Data already in place (reused, not changed)

- `scheduled_shifts` — already has `staff_id`, `client_id`, `job_code`, `starts_at`, `ends_at`, `published`, `status`, `parent_shift_id`. Edits, resizes, duplicates, deletes all go here.
- `client_billing_codes` — authoritative for "which codes is this client authorized for" and "annual_unit_authorization / weekly_cap_units". `useClientBillingCodes` / `useAllClientBillingCodes` already filter out end-dated rows.
- `clients.team_id` + `teams` (where `setting` indicates residential) — the RHS home pills read from here.
- `staff_assignments(staff_id, client_id, organization_id, service_codes[])` — already exists with the right unique constraint and RLS. This is the caseload gate.
- `time_off_requests` — already used by the staff page; admin-marked time off becomes an auto-approved row here.
- `day_program_sessions`, `day_program_session_staff`, `day_program_attendance` — already exist; the new Day Program UI writes to these.
- `evv_codes.ts` + `service-billing.ts` — labels and daily/hourly/day-program flags.

## New schema (one migration)

```sql
ALTER TABLE public.clients
  ADD COLUMN admin_hours_per_week numeric(6,2);
COMMENT ON COLUMN public.clients.admin_hours_per_week IS
  'HHS host-home administrative hours per week. NULL means unset.';
```

No RLS change — `clients` already has org-scoped policies.

## Files to delete (old scheduler — full rip-out per your answer)

- `src/routes/dashboard.schedule-preview.tsx`
- `src/components/schedule-preview/` (whole directory: NECTAR command bar, requests panel, settings drawer, shift editor, sched-ui, swap/time-off dialogs)
- `src/components/scheduling/` (whole directory: coverage bars, conflicts panel, auto-assign drawer, recurring patterns, copy-week menu, weekly targets, locations dialog, day-program-panel, etc.)
- `src/routes/dashboard.scheduling.tsx` is a redirect — repoint it to the new route.

The `src/lib/scheduling/` server functions (`workflow.functions`, `locations.functions`, `targets.functions`, `conflicts.functions`) are left in place only where reused (publish, conflicts on assign). Anything orphaned after the rip is deleted in the same commit.

## New files

### Route

- `src/routes/dashboard.scheduler.tsx` — single page with three top tabs: **Schedule** (default), **Day Program**, **Staff view**. `/dashboard/schedule-preview` and `/dashboard/scheduling` redirect here.

### Shared scheduler components (`src/components/scheduler/`)

- `scheduler-header.tsx` — Day / Week / Month + arrows + Today + date label + Add shift + Publish.
- `code-section.tsx` — collapsible section per service code (SLH, COM, PAC, RP2, HHS, RHS, PM1, DSI). Header shows code chip + label + client count. Builds its client list by joining `clients` ↔ `client_billing_codes` for that code.
- `client-row.tsx` — round teal avatar + "Client" pill + name + units-left (or admin hours for HHS, or "Set units" / "Set administrative hours" CTA if missing — links to the client profile).
- `day-timeline.tsx` — 6a–8p horizontal track, shifts as draggable/resizable blocks (left/right edge handles), hover-to-add ghost, click-to-open detail.
- `week-grid.tsx` — 7 columns, one dot per shift, click empty → add, click dot → detail.
- `month-grid.tsx` — month calendar with shift chips per day.
- `rhs-home-toggle.tsx` — pills above the RHS section reading distinct `teams.team_name` for RHS-authorized clients.
- `shift-block.tsx` — block with edge-handle drag, shows "Open" or staff first name + time.
- `add-shift-dialog.tsx` — Client → Service code (filtered to that client's authorizations) → Staff (filtered to that client's caseload from `staff_assignments`, with disabled+reason rows for off / not onboarded / unlicensed) → Date / Start / End. "Leave open" option.
- `shift-detail-panel.tsx` — right-side panel on desktop, slide-up sheet on mobile (`useIsMobile`). Edit / Duplicate / Delete buttons. Caseload assign dropdown + "Assign someone not on the team" search. Inline "Add to caseload" one-click action.

### Day Program (`src/components/scheduler/day-program/`)

- `day-program-board.tsx` — list of sessions for the chosen week, two columns matching the screenshot (DSG, DSP). DSI is excluded here (it's a regular shift in the main scheduler).
- `session-card.tsx` — code chip, room, time, present/total badge, staff chips with `+ staff` add, roster list with `Present | Absent | Unmarked` per client.
- `session-editor.tsx` — admin-side create/edit a session (date, room, start/end, capacity, codes, roster picker).

### Staff view tab

- `staff-view-preview.tsx` — admin-side preview of an existing staff member's `/dashboard/schedule` week, with an "Off" toggle per day that writes/removes a `time_off_requests` row (status auto-approved by admin). The real staff route at `/dashboard/schedule` is untouched.

### Hooks / data

- `src/hooks/use-staff-caseload.tsx` — `staff_assignments` for the org (admin view) and for one staff (assignment dropdown).
- `src/hooks/use-day-program-sessions.tsx` — sessions + staff + attendance for the visible week.
- Extend `use-schedule-preview.ts` to also return `staff_assignments` (single fetch, used by both add-shift and assignment dropdown).

### Server functions (`src/lib/scheduler/*.functions.ts`)

- `save-shift.functions.ts` — create/update/delete/duplicate `scheduled_shifts`. On create/update it validates: client has the code in `client_billing_codes`; staff is in `staff_assignments` for that client (hard block with the prescribed error); staff is not on time off that day (hard block); staff is onboarded (hard block); >40h/week is a warning, not a block.
- `add-to-caseload.functions.ts` — insert `(staff_id, client_id, org_id)` into `staff_assignments` (idempotent via the unique constraint).
- `publish-week.functions.ts` — flips `published=true` on all draft shifts in the visible week, returns `{shifts, staffCount}` for the toast.
- `admin-set-time-off.functions.ts` — wraps `time_off_requests` create/delete with auto-approval when called by an admin/manager.
- `save-day-program-session.functions.ts`, `mark-attendance.functions.ts`, `add-session-staff.functions.ts` — wrap the three existing day-program tables. Attendance write is gated to the session's assigned staff (and admins for read-only).
- `save-admin-hours.functions.ts` — updates `clients.admin_hours_per_week`.

All authored server functions use `requireSupabaseAuth`. None query Supabase from loaders.

### Client profile (Prompt 4)

- Add an "Administrative hours" card (visible only when the client has HHS in `client_billing_codes`) to the existing client profile page. Same minus/plus/type/save popup pattern as the screenshot description. Writes via `save-admin-hours`.

## Wiring rules enforced

- A code section's client list is `clients ⋈ client_billing_codes WHERE service_code = X AND end_date is null or > today`. Adding/removing a code on a profile makes the client appear/disappear instantly via React Query cache invalidation already wired in `useClientBillingCodes`.
- Units left = `annual_unit_authorization − Σ used_units` (used reads from `evv_timesheets` like the rest of the app does; the helper already exists in `billing-units.ts`). If `annual_unit_authorization` is null/zero, render the "Set units" CTA.
- HHS section reads `admin_hours_per_week`; "Set administrative hours" CTA if null.
- Staff dropdown rows are pulled from `staff_assignments` for that client, joined to `profiles`. Off/onboarding/license shown disabled with a reason.
- Publish flips `published=true`; `/dashboard/schedule` already filters on that, so no change to the staff page is needed.
- Admin-set time off writes to `time_off_requests` (status approved). The save-shift validator already blocks scheduling on approved time-off days.

## Visual target

Match the screenshots: amber/navy/teal palette already in `styles.css` (`--amber-600`, `--navy-900`, teal client chip), Plus Jakarta Sans (already loaded by the old scheduler — pulled into the new route head), small caps section labels, square amber avatars for staff, round teal avatars for clients, gold dots for assigned / hollow gold ring for unassigned in week view.

## Out of scope (explicitly)

- Billing math, EVV punching, ratio-coverage logic, NECTAR command bar, conflict engine UI, recurring patterns, auto-assign drawer, copy-week, locations dialog, weekly targets dialog, swap requests UI — all removed per the "full replace" answer. The hard-block validators in `save-shift` cover the only conflict checks the new flow needs.
- The staff-facing `/dashboard/schedule` page itself — only the publish/time-off pipeline into it is touched.
- No sample/mock/placeholder data anywhere.

## Risk callouts

- Ripping `src/components/scheduling/` will leave a few cross-imports (e.g. `hhs-info-tooltip` is used in `dashboard.schedule.tsx`). I'll preserve only the tiny leaf components still referenced elsewhere and move them into `src/components/shared/` instead of keeping the scheduling folder alive.
- `useSchedulePreview` is currently imported by other surfaces (today-shift-banner, schedule preview only?). I'll grep and either repoint them to a new hook or keep the function and just stop using it on the page being replaced.

## Build order

1. Migration: add `admin_hours_per_week`.
2. New server functions + hooks.
3. New scheduler route + components (Schedule tab first, then RHS toggle, then Day Program tab, then Staff view tab).
4. Client profile admin-hours card.
5. Delete old scheduler files and orphaned cross-imports.
6. Repoint `/dashboard/schedule-preview` and `/dashboard/scheduling` redirects.

This is large but each step compiles independently and the old scheduler keeps working until step 5.