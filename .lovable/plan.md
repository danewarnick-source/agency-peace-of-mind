## Scope rule
Keep the existing scheduler UI exactly as-is — only fix data/save plumbing and add the new tools/panels below. No DB structure changes beyond what's listed. Real records only.

---

## 1. Backend audit (read-only first)

Using the Supabase connection, run a checklist query against the live DB for each table the scheduler touches:

`staff_assignments, scheduled_shifts, client_billing_codes, day_program_sessions, day_program_session_staff, day_program_attendance, time_off_requests, notifications, clients, profiles, organization_members, teams`

For each, confirm:
- columns the scheduler reads/writes exist
- RLS enabled
- a SELECT policy that admins satisfy (via `has_org_role(org,user,'admin')` / `is_org_admin_or_manager`)
- an INSERT/UPDATE/DELETE policy admins satisfy, with a `WITH CHECK` that pins `organization_id` to the caller's org
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` (Lovable Cloud requires explicit grants)

Report findings before changing anything.

## 2. RLS / grants migration (only the gaps found)

Single migration that, for any table missing it, adds:
- admin/manager read + write policy scoped to `organization_id = (caller's org)`
- staff read policy where applicable (`scheduled_shifts` where `staff_id = auth.uid()`, `notifications` where `recipient_user_id = auth.uid()`, `time_off_requests` where `staff_id = auth.uid()`, etc. — only if missing)
- the missing GRANTs

No new tables, no column changes.

## 3. Fix save + refresh for each action

For every mutation in `src/lib/scheduler/scheduler.functions.ts` and `src/lib/scheduling/*.functions.ts` confirm:
- the server fn actually writes (not stubbed), stamps `organization_id`, returns the row
- the client mutation calls `qc.invalidateQueries({ queryKey: ['scheduler-data'] })` (and `['day-program-data']`, `['my-assignments']` where relevant) in `onSuccess`

Actions to verify/repair:
1. Add shift → writes `scheduled_shifts`, unit math redraws from `client_billing_codes` minus sum of shifts (already computed in code — just confirm invalidation).
2. Drag-resize edges → calls `updateShift` with new `starts_at`/`ends_at` and persists (current edge handler likely only updates local state — wire to `saveShift`/`updateShift`).
3. Edit / duplicate / delete — confirm each hits server fn + invalidates.
4. Staff assign on a shift — block in `AddShiftDialog` + `ShiftDetailPanel` if `staff_assignments` for (staff,client) missing; show "<Staff> isn't on <Client>'s caseload" with an "Add to caseload" inline button.
5. One-click add-to-caseload → `addToCaseload` writes `staff_assignments` row with org, invalidates caseload + scheduler queries.
6. Publish → `publishShiftsWithNotify` sets `status=published`, inserts `notifications` rows for each staff; staff `/dashboard/schedule` already reads these.
7. Mark staff off (admin) → `setAdminTimeOff` inserts approved `time_off_requests`; eligibility filter in `AddShiftDialog` excludes those staff for that date.
8. Staff time-off request appears in RequestsPanel → approve writes `status=approved`, blocks scheduling on those days (same eligibility filter).
9. Day program: create session, add staff, mark present/absent → writes through `saveDayProgramSession` / `addSessionStaff` / `markAttendance`; present marks already create `evv_timesheets` (prompt 7). Confirm units redraw.

## 4. Two missing setup tools

A. **Caseload editor on the client row/detail** — new component `CaseloadEditor` opened from `src/routes/dashboard.clients.$clientId.tsx` (and a button on each row in the clients hub). Multi-select staff picker, diff against existing `staff_assignments`, bulk insert/delete in one server fn `setClientCaseload({ clientId, staffIds[] })`.

B. **Day Program session creator** — "New session" button on the Day Program tab. Dialog: date, start/end, code (DSG/DSP), client roster, staff multi-select. Writes `day_program_sessions` + `day_program_session_staff`.

## 5. Nectar additions (new, additive)

Add a top strip on the Scheduler tab with three controls. Each opens a drawer with an editable draft grid; nothing writes until admin clicks **Publish drafts**.

- **Ask Nectar bar** — free-text "schedule John with Julie DSI Wed+Thu 2–5pm"; server fn `nectarDraftShifts({ prompt, weekStart })` calls Lovable AI (`google/gemini-2.5-flash`) with a system prompt that lists the org's real clients/staff/service codes and returns JSON shift drafts. Resolve names → IDs server-side; unknowns → flagged rows the admin fixes before publish.
- **Import schedule** — file upload (PDF/CSV/DOCX). Parse via existing doc-parse path (PDF/DOCX → text, CSV directly), feed to same Nectar fn with `mode:'import'`. Same draft grid; rows with unknown staff/client left blank for the admin to fill, never invented.
- **Auto-fill** — button "Auto-fill open shifts this week": server fn finds `scheduled_shifts` with `status='open'` (no staff), proposes eligible staff (on caseload, no conflict, not on time off, under weekly cap). Draft grid again.

All three reuse one `DraftReviewDrawer` that calls `createShift`/`updateShift` for accepted rows.

## 6. Open shifts for staff

- Allow admin to create a shift with `staff_id = null` and `status='open'` (already supported by `scheduled_shifts`; just expose "Leave staff blank → Open shift" in AddShiftDialog).
- Insert a `notifications` row per staff whose caseload includes that client when an open shift is created/published, type `open_shift_available`, link `/dashboard/schedule`.
- On `/dashboard/schedule`, new "Open shifts" section: staff sees open shifts for their caseload clients with a **Take shift** button.
- `takeOpenShift` server fn: re-checks no conflict with that staff's other shifts in the window; on conflict throws → UI shows pop-up "Can't take this shift — conflicts with <other shift>". On success sets `staff_id = auth.uid()`, `status='accepted'`, invalidates queries.

## Deliverable summary
At the end I'll report: which tables/policies/grants changed, which mutations were stubbed vs. fixed, which queries were missing invalidation, and a confirmation that the caseload editor and day-program session creator save real rows.

## Technical notes
- All new server fns: `createServerFn` + `requireSupabaseAuth`, stamp `organization_id` from caller membership, validate with Zod.
- No edits to `src/integrations/supabase/*` auto-gen files.
- No changes to billing math or unit calculations beyond reading existing helpers (`computeEntryUnits`, day-program math).
- Nectar drafting uses Lovable AI Gateway (no user key).
