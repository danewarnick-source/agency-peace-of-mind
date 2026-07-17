## Goal

Trim the punch-pad chrome on the active-shift view per the user's request.

## Changes (all in `src/components/evv/punch-pad.tsx`)

1. **Hide the "💼 Select Service Code" field while a shift is running.** Wrap the block at ~lines 2155–2183 in `{!isRunning && (...)}`. Pre-clock-in behavior unchanged.
2. **Remove the "🕐 Timezone" field entirely.** Delete the block at ~lines 2185–2193. Continue passing the current `timezone` state value to `evv_timesheets` writes (default `America/Denver`) — no schema/data change, just no UI control.
3. **Remove the "Entry origin: In-Chart / Sidebar Unscheduled" line** at ~lines 2240–2246.
4. **Remove the "EVV · Utah DHHS" badge** in the header at ~lines 2035–2037.
5. **Scope the GPS header badges (`GPS Live`, `Acquiring GPS`, `GPS Blocked`) to EVV-locked service codes only.** Gate them with `isEvvLockedCode(serviceCode)` (the helper already used elsewhere in this file). Non-EVV shifts show none of these badges. Underlying GPS capture logic is untouched — this is purely a display gate.

## Non-goals / preserved

- The service code is still validated and stored on the active timesheet; hiding the picker doesn't change what's saved.
- Timezone continues to be recorded on `evv_timesheets.timezone_setting`.
- GPS is still captured passively for non-EVV codes; only the badge UI is hidden.
- Locked-client banner, NECTAR pre-flight, GPS status strip (clock-in only), clock buttons, and clock-out compliance flow are untouched.

## Verification

- With an active shift running: no Service Code select, no Timezone select, no "Entry origin" caption, no "EVV · Utah DHHS" badge, and no GPS badges when the shift code is non-EVV (e.g. DSI, RHS, SEI).
- With an active EVV-locked shift (e.g. SLH, SLN, COM): GPS Live / Acquiring / Blocked badges still appear.
- Pre-clock-in: Service Code picker still shown; Timezone no longer shown; EVV badge gone; GPS badges only when the currently-selected code is EVV-locked.
