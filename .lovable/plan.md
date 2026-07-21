
## What's wrong

In the "My caseload" list (`src/components/staff-client-grid.tsx`), expanding a client lets the user pick a service code and shows "Open Time Clock" (or "Open Client Hub" for daily codes). The button `<Link>` currently passes only `params={{ clientId: c.id }}` — no `search`. So the destination (`/dashboard/workspace/$clientId`) opens on the default "About" tab with no preselected code, and the staff member has to re-pick the code inside the punch pad.

The workspace route already accepts `?tab=clock-in&code=XYZ` (`workspaceSearch` in `dashboard.workspace.$clientId.tsx`) and forwards `code` to `PunchPad` as `presetServiceCode` + `lockServiceCode`, which correctly handles EVV vs non-EVV under the hood. The caseload row just isn't sending it.

## Fix

Edit `src/components/staff-client-grid.tsx`, `ClientDetail` "Open Time Clock" button only:

- For the hourly / clockable path (`!daily`), change the `<Link>` to include:
  - `search={{ tab: "clock-in", code: selected }}`
- For the daily path (HHS hub), keep params only — that hub has no code selector and no clock (matches current behavior).
- No other changes: the pill selector, EVV/daily/payroll-only badge, and disabled-while-on-clock behavior stay as-is. PunchPad already routes EVV vs non-EVV logic from the code.

## Verification

- Expand a caseload client, pick an EVV code (e.g., COM), click Open Time Clock → workspace opens directly on Clock-In tab with that code preselected and locked in the punch pad.
- Repeat with a non-EVV clockable code (e.g., SEI) → same behavior; PunchPad shows the non-EVV clock-in path.
- Pick a daily code (HHS) → button still says "Open Client Hub" and lands on `/dashboard/hhs-hub/$clientId` unchanged.
- Already-on-clock client → button still says "Continue Time Clock" and lands on the workspace (no code override; PunchPad picks up the active shift's code).
