## Problem

On Justin's caseload > About > Person-Centered Support Plan, the panel says "No PCSP goals recorded yet," but admin has 3 PCSP goals on file (verified in DB: `clients.pcsp_goals` has 3 entries and `client_specific_trainings.goals` has the matching 3 structured rows).

Root cause: Justin's `client_staff_visibility.sections.care_plan` is `false`, so the server (`src/lib/client-care-data.functions.ts`) collapses `visibility.staffCare.goals` to `[]` before returning. The About tab then renders the empty-state message.

This is the same class of issue we already fixed for the Shift Verification form: PCSP goals should always mirror what admin has on file, regardless of the section toggle. Per-goal visibility switches (admin explicitly hiding one goal) should still be honored, but the blanket section toggle should not zero the list out.

## Fix

Two small, targeted changes:

1. **`src/lib/client-care-data.functions.ts` (line ~312)** — change `goalsStaffAll` so it always includes goals, filtered only by per-goal `isFieldVisible(...)`:
   ```ts
   const goalsStaffAll = goals.filter((g) =>
     isFieldVisible(visibilityRow, fieldKey("care_plan", "goal", g.id))
   );
   ```
   No change to `medicationsStaff`, `authorizedCodesStaff`, or custom fields — the section toggle still hides those.

2. **`src/components/workspace/about-tab.tsx` (line ~40)** — drop the `carePlanSectionOn` gate for the PCSP list so it shows whatever the server returned:
   ```ts
   const goals = (staffCare?.goals ?? []).map((g) => g.goal).filter(Boolean);
   ```
   The `carePlanCustom` block below still respects `carePlanSectionOn` implicitly (server already filtered custom fields).

## Behavior

- Every client's About > PCSP panel shows the goals currently on file on the admin side.
- Any admin edit (add / edit / re-extract from PCSP) flows through immediately on the next fetch — the About tab is already backed by the same `useClientCareData` hook that the compliance form uses.
- Admins can still hide a specific goal via the per-goal visibility switch; that switch continues to work.
- Other care-plan surfaces protected by the section toggle (medications, care-plan custom fields) are unaffected.

## Files touched

- `src/lib/client-care-data.functions.ts` — one-line change to `goalsStaffAll` derivation
- `src/components/workspace/about-tab.tsx` — remove the `carePlanSectionOn` guard on `goals`
