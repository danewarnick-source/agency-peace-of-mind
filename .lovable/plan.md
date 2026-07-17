## Goal

On the punch pad and clock-out Medicaid compliance attestation, PCSP goals whose `job_codes` include the shift's service code must always render — regardless of whether an admin has toggled the "Care Plan" section off in the client's Staff Visibility settings. Today Justin has two DSI-tagged goals, but `sections.care_plan = false` on his visibility row causes the punch pad to say "No PCSP goals tagged for DSI on this individual."

## Change

Single edit in `src/lib/client-care-data.functions.ts`, inside `getClientCareData`'s visibility layer.

Currently:

```text
goalsStaffAll = sections.care_plan ? goals.filter(per-field visible) : []
goalsForStaff = goalsStaffAll.filter(is_complete && matches shiftServiceCode)
```

New rule for `visibility.goalsForStaff` only:

```text
goalsForStaff =
  goals
    .filter(is_complete)
    .filter(per-field goal visibility switch still respected)
    .filter(when shiftServiceCode present: job_codes includes it uppercased;
            when absent: include all complete goals)
```

Notes:
- The `care_plan` section toggle is bypassed **only** for `goalsForStaff` (the shift-time list). Per-goal field switches (`fieldKey("care_plan", "goal", g.id)`) are still honored so admins retain a per-goal opt-out.
- `visibility.staffCare.goals` (the broader staff projection used by non-shift admin surfaces) continues to honor `sections.care_plan`. This keeps the section toggle meaningful everywhere except the shift-time compliance list.
- `visibility.medicationsVisible` and other section-gated fields are unchanged.

## Files

- `src/lib/client-care-data.functions.ts` — modify the `goalsForStaff` computation.

## Verification

1. Justin (`a9c15b24-...`), shift code `DSI`: punch pad and clock-out attestation now list both DSI-tagged goals; the "No PCSP goals tagged for DSI" empty state disappears.
2. A client with `sections.care_plan = true` and DSI goals: behavior unchanged.
3. A client whose admin turned OFF a specific goal via the per-goal field switch: that goal still stays hidden.
4. Non-shift admin views that read `visibility.staffCare.goals` remain gated by the section toggle.

## Cleanup

Remove the temporary `console.log("[DIAGNOSTIC care data]", careData.data)` from `src/components/evv/punch-pad.tsx` after confirming the fix in the preview.
