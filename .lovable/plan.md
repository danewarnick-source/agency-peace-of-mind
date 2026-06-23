## Goal
Remove duplication on `/dashboard/smart-import/$jobId/done` where the finish-onboarding card repeats items already surfaced elsewhere on the page. Do not touch the upload screen.

## Changes (single file: `src/components/clients/finish-onboarding-card.tsx`)

### 1. `buildItems(s)` — drop the four duplicated rows
"Needs attention" above the checklist already handles staff, home/geofence, billing rates, and guardian. Keep only the `sow` row so the checklist stops re-listing them.

```text
return [
-  { key: "staff",    … },
-  { key: "home",     … },
-  { key: "rates",    … },
-  { key: "guardian", … },
   { key: "sow",      … },
].filter(…)   // existing sow-missing filter stays
```

The `StepRow` branches for `staff` / `home` / `rates` / `guardian` (and their forms: `CaseloadEditor`, `HomeForm`, `RatesForm`, `GuardianForm`) stay in the file — still imported by other call sites — they're just no longer rendered from this checklist.

### 2. `unknowns` — exclude EOL keys
The "Advanced care / end-of-life" group on the profile already manages these. Filter them out of the NECTAR questions list so they don't appear twice.

```ts
const EOL_KEYS = new Set([
  "dnr_status",
  "polst_status",
  "palliative_care_status",
  "hospice_status",
]);

const unknowns = fieldStatesQ.data
  ? TRACKED_FIELDS.filter(
      (f) =>
        fieldStatesQ.data!.states[f.key] === "unknown" &&
        !EOL_KEYS.has(f.key),
    )
  : [];
```

## Out of scope
- No changes to the upload screen (`dashboard.smart-import.index.tsx`).
- No changes to `TRACKED_FIELDS`, `field-confirmations.ts`, the EOL group, or "Needs attention".
- No changes to the underlying form components or server functions.

## Verification
- Open `/dashboard/smart-import/$jobId/done`: staff / home / billing / guardian appear once (in "Needs attention"); DNR / POLST / palliative / hospice appear once (in the EOL group); the SOW row still shows when SOW fields are missing.
- `npm run build` green; `routeTree.gen.ts` unchanged (no route edits).