## Goal

Collapse the staff-facing "Historical Timesheets" and "Historical Daily Notes" pages into one sidebar entry — "Historical Records" — with a top-of-page toggle that swaps between the two existing views. No behavior changes to confirming a timesheet or signing a daily note.

## Changes

**1. Extract the page bodies as reusable components (no logic changes)**

- `src/routes/dashboard.my-historical-timesheets.tsx`: keep the file and its `Route`, but also `export function MyHistoricalTimesheetsPage()` (already the component — just add `export`). All queries, mutations, and UI stay identical.
- `src/routes/dashboard.my-historical-daily-notes.tsx`: same treatment — `export` the existing `MyHistoricalDailyNotesPage`.

Both existing routes keep working at their current URLs so nothing breaks mid-flight; they just become secondary entry points.

**2. New combined route: `src/routes/dashboard.my-historical-records.tsx`**

- `createFileRoute("/dashboard/my-historical-records")`, title "Historical records — HIVE".
- Renders a header ("Historical records") and a shadcn `Tabs` control with two triggers: **Timesheets** and **Daily notes**.
- Selected tab renders `<MyHistoricalTimesheetsPage />` or `<MyHistoricalDailyNotesPage />` below the toggle — the imported components already own their own headers, loading, empty, and action UI, so they drop in unchanged.
- **Default-tab logic (client-side, cheap):** on mount, fire the two existing list server fns in parallel via `useQueries`:
  - `listMyPendingHistoricalTimesheets` → `queryKey: ["my-historical-timesheets-pending"]`
  - `listMyPendingHistoricalDailyNotes` → `queryKey: ["my-historical-daily-notes-pending"]`
  Reusing the same query keys means the child pages hit the cache instantly — no double-fetch.
  Rule: `timesheetsCount > 0 && dailyNotesCount === 0` → Daily notes tab? No — timesheets. `timesheetsCount === 0 && dailyNotesCount > 0` → Daily notes. Otherwise (both have items, both empty, or still loading) → **Timesheets**. Only set the default once, after both queries settle; user tab clicks after that are respected via local state.
  Show small numeric badges on each tab trigger when count > 0 so staff can see at a glance what's waiting.

**3. Sidebar update — `src/routes/dashboard.tsx`**

- Replace the existing line 136 entry (`/dashboard/my-historical-timesheets` — "Historical Timesheets", `Archive` icon, `evv_timesheets` feature) with a single entry: `to: "/dashboard/my-historical-records"`, label `"Historical Records"`, `Archive` icon, same `evv_timesheets` feature gate.
- No separate "Historical Daily Notes" sidebar item is added.

**4. Leave the old routes reachable**

Both `/dashboard/my-historical-timesheets` and `/dashboard/my-historical-daily-notes` continue to render exactly as they do today (no redirect, no deprecation banner). The combined route is purely additive — this keeps any existing in-app links, notifications, or bookmarks working while the new sidebar tab becomes the primary entry.

## Out of scope

- No changes to server functions, RLS, DB, import wizard, or attestation/confirmation flows.
- No changes to the daily-notes CSV import fix or the `import_jobs_mode_check` migration from earlier this session.
- No design system / color changes beyond using the existing shadcn `Tabs` and `Badge` primitives.

## Files touched

- edit `src/routes/dashboard.my-historical-timesheets.tsx` (add `export` on the page component)
- edit `src/routes/dashboard.my-historical-daily-notes.tsx` (add `export` on the page component)
- edit `src/routes/dashboard.tsx` (swap sidebar entry)
- create `src/routes/dashboard.my-historical-records.tsx` (new combined route + tab shell)
