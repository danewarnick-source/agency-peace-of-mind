# Scheduling options + clock-in prefill

Two small, surgical front-end changes. No schema, RLS, or billing logic touched.

## 1. Scheduling dialog — show all options

File: `src/components/schedule-preview/shift-editor.tsx`

Current behavior:
- **Staff dropdown** — already lists every staff member. ✅
- **Client dropdown** — filtered by the active site (team) selector. If the editor is opened from a site lane other than "All sites", clients on other teams are hidden.
- **Billing code dropdown** — filtered to the selected client's `job_code` (authorized codes). If the client has no authorized codes, the list is empty.

Changes:
- Always populate the Client dropdown with **all org clients** (drop the `eligibleClients` site filter inside the dialog). Keep the site lanes on the page itself unchanged — this is dialog-only.
- For the Billing code dropdown: when the selected client has authorized codes, show those (current behavior — "applicable" codes). When the client has **no** authorized codes, fall back to the full `EVV_SERVICE_CODES` list instead of showing an empty/disabled state, so a code can still be picked.
- No change to staff list.

## 2. Time clock auto-prefill from scheduled shift

The deep link from the Today hero (`/dashboard/workspace/$clientId?tab=clock-in&code=XXX`) already presets and locks the job code via `PunchPad`'s `presetServiceCode` / `lockServiceCode` props. Gap: if a staff opens the client workspace directly (not via the Today hero card), the code is not preset.

File: `src/routes/dashboard.workspace.$clientId.tsx`

- When `presetCode` is absent from the URL search params, look up today's scheduled shift for this staff + this client from `useTodayShifts()` (already loaded elsewhere in the staff mobile shell; add the hook here).
- If exactly one matching shift exists with a `job_code`, pass it to `PunchPad` as `presetServiceCode` and set `lockServiceCode` to true — same behavior as the deep-linked path.
- If multiple shifts exist for the same client today, pick the one whose `[starts_at, ends_at]` window contains "now"; otherwise the next upcoming; otherwise leave unset (let the staffer choose).
- No change to the General Time Clock page (`/dashboard/timeclock`) — that's for non-client time (Training/Admin/Travel/Meeting) and has no client/job context.

## Guardrails

- No changes to `scheduled_shifts`, `evv_timesheets`, EVV punch logic, billing, or pay code.
- No new tables, RLS, or migrations.
- Dialog change is presentation-only; saves still go through the existing `saveShift` validator (client + code + staff required).
