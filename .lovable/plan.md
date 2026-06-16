## Goal
When an admin clicks **Scheduler** in the admin nav, show the new scheduler we just built (`/dashboard/scheduler`) — not the old `/dashboard/schedule-preview` page.

## Changes

1. **Repoint the admin nav** (`src/routes/dashboard.tsx`, line 52)
   - Change `to: "/dashboard/schedule-preview"` → `to: "/dashboard/scheduler"` for the Scheduler entry.

2. **Make legacy routes redirect to the new scheduler** (so any deep links / bookmarks / in‑app links keep working)
   - `src/routes/dashboard.schedule-preview.tsx` → replace its body with a `redirect({ to: "/dashboard/scheduler", replace: true })` loader + `<Navigate>` component (same pattern already used in `dashboard.scheduling.tsx`).
   - `src/routes/dashboard.scheduling.tsx` → currently redirects to `schedule-preview`; repoint it to `/dashboard/scheduler`.

3. **Repoint the two remaining in‑app links** that still send users to the old scheduler
   - `src/components/company-overview.tsx` lines 141 and 441: change `to: "/dashboard/scheduling"` → `to: "/dashboard/scheduler"` (drop the now‑meaningless `search: { tab: "builder" }`).

4. **Delete the old scheduler implementation files** (per the original plan's step 5 — "full rip‑out"). These are no longer reachable after step 2:
   - `src/components/schedule-preview/` (entire directory)
   - `src/components/scheduling/` (entire directory)
   - `src/hooks/use-schedule-preview.ts`
   - `src/lib/schedule-preview-mutations.ts`
   - Orphaned server‑function files under `src/lib/scheduling/` that are no longer imported anywhere after the deletions above (will grep and remove only the orphans; keep anything the new scheduler / staff page still imports, e.g. `schedule-requests.ts` and pieces reused by `publishWeek`).

5. **Fix any cross‑imports broken by step 4**
   - Before deleting, grep each target for external importers (the original plan flagged `today-shift-banner` and `dashboard.schedule.tsx` referencing `hhs-info-tooltip` etc.). For any leaf component still needed elsewhere, move it to `src/components/shared/` and update the import path. No behavior change on those surfaces.

## Out of scope
- No changes to the new scheduler's UI/behavior.
- No DB / RLS / billing changes.
- The staff‑facing `/dashboard/schedule` page is untouched.

## Verification
- Click **Scheduler** in admin nav → lands on the new scheduler.
- Visiting `/dashboard/schedule-preview` or `/dashboard/scheduling` directly → redirects to `/dashboard/scheduler`.
- `bun run build` (harness) passes — i.e. no dangling imports from the deleted directories.
