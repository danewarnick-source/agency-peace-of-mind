## 1. Sidebar — remove Homes & Teams, rename Schedule → Scheduler

`src/routes/dashboard.tsx` (ADMIN_NAV)
- Delete the `"/dashboard/homes" — Homes & Teams` entry.
- Rename the Schedule entry's label to **"Scheduler"** (route stays `/dashboard/schedule-preview`).

The `/dashboard/homes` route itself stays — it just isn't in the sidebar anymore.

## 2. Inside the scheduler — entry point to Homes & Teams

`src/routes/dashboard.schedule-preview.tsx`
- Header `<h1>` text: `Schedule` → **`Scheduler`**.
- `head().meta.title`: `Schedule — HIVE` → `Scheduler — HIVE`.
- Keep the existing **"Homes & Teams"** button next to the gear (it already links to `/dashboard/homes`). That is now the only path into Homes & Teams.

## 3. Settings drawer — match the two screenshots

`src/components/schedule-preview/settings-drawer.tsx` already has View & Display (Default view, Opens on, Row density, Color shifts by, Show shift times, Show resident count). Add the two missing sections:

**Your shift types** (screenshot 2, top)
- List rows: color swatch · name · start–end time · `Edit`. Seeded from the existing palette in `sched-ui.ts` (Morning 6a–2p, Swing 2p–10p, Overnight 10p–6a, Day 9a–3p, 1:1 Support 9a–3p, DSI 9a–3p, Respite 4p–8p).
- Edit row → small inline form (name / start / end / color picker / Save / Delete).
- Bottom "Add shift type" row: name input, start, end, color, dashed "+ Add shift type" button.
- Persistence: extend the existing `localStorage` Settings blob (`hive.schedulePreview.settings`) with a `shiftTypes` array. No DB, no schema change.
- Wire it back to `shiftAccentHex` / `shiftTypeLabel` in `sched-ui.ts` so card colors and titles on the board reflect edits.

**Staffing** (screenshot 2, bottom)
- Three toggles, persisted in the same Settings blob:
  - Allow multiple staff per shift & overlap
  - Require matching certification (subtext: "Warn (never block) when a staffer lacks a needed cert.")
  - Overtime warning

These toggles are **UI + persisted preference only** in this pass — they do not change `scheduled_shifts`, EVV, billing, or pay logic. Wiring them into actual conflict/cert/OT checks is a follow-up. Calling that out so it isn't a surprise.

## Guardrails

- No changes to `scheduled_shifts` schema, EVV/time-clock, billing/Form 520, revenue, or pay.
- No new DB tables — all new settings live in the same per-device `localStorage` key already in use.
- `/dashboard/homes` route, `homes-teams-board` component, and the deep-link redirects from `/dashboard/teams` are untouched.

## Rollback

Revert this change in git: sidebar gets Homes & Teams back, header reverts to "Schedule", settings drawer drops the two new sections, and stored shift-type / staffing prefs in localStorage are simply ignored.
