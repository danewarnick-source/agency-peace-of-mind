## Problem

In staff dashboard "Needs Your Attention," the Fix Now button for an open (never clocked-out) shift currently routes to `/dashboard/timeclock` (the non-client General Time Clock). It should land the staff on the exact client's punch pad AND auto-open the "📋 Shift Verification & Medicaid Compliance Form" dialog for the active shift so they can complete goals + narrative and clock out.

That dialog already exists inside `PunchPad` (`src/components/evv/punch-pad.tsx`, opened by `openCompliance()` at line 950). It only opens when there's an `active` shift. `useActiveShift()` will detect the open timesheet automatically once PunchPad mounts on the client's workspace.

## Fix

1. **`src/components/evv/punch-pad.tsx`**
   - Add an optional prop `autoOpenCompliance?: boolean` to `PunchPadProps`.
   - Add a `useEffect` that, when `autoOpenCompliance` is true and `active` becomes available and no dialog is already open, calls `openCompliance()` exactly once (guarded by a `useRef` so it doesn't re-fire on renders or after the user closes the dialog).

2. **`src/routes/dashboard.workspace.$clientId.tsx`**
   - Extend `workspaceSearch` to include `verify: z.string().optional()` (URL-safe string; treat any truthy value as "open the form").
   - Read `verify` from `Route.useSearch()` and pass `autoOpenCompliance={verify === "1"}` to `<PunchPad …>` in the clock-in tab.

3. **`src/routes/dashboard.index.tsx`** (`ComplianceInbox`, open-shifts row, line 96–100)
   - Replace `navigate({ to: "/dashboard/timeclock" })` with:
     ```
     navigate({
       to: "/dashboard/workspace/$clientId",
       params: { clientId: s.client_id },
       search: { tab: "clock-in", code: s.service_type_code, verify: "1" },
     })
     ```
   - Rejected daily-log row is untouched.

## Behavior

- Tapping Fix Now on an open shift → workspace opens on Clock In tab for the correct client → PunchPad detects the active timesheet → Shift Verification & Medicaid Compliance Form opens automatically, prefilled with that shift's live duration, so staff can complete PCSP goals, narrative, and submit clock-out (including a time-correction request if the recorded clock-in is wrong).
- If for any reason there's no active shift when the page loads (edge case: someone else already closed it), the dialog simply doesn't open — no error, PunchPad renders normally.
- The auto-open fires once per navigation (ref guard); closing the dialog won't reopen it on rerender.

## Files touched

- `src/components/evv/punch-pad.tsx` — add prop + one-shot auto-open effect
- `src/routes/dashboard.workspace.$clientId.tsx` — extend `validateSearch`, pass prop
- `src/routes/dashboard.index.tsx` — update Fix Now handler for open shifts
