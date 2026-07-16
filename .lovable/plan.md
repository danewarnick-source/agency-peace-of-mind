## Goal
Replace the free-text service-code input in `GoalsEditor` with a clickable chip multi-select scoped to the client's own authorized codes.

## Changes

**`src/components/clients/client-specific-training-card.tsx`**
- Add `import { useClientBillingCodes } from "@/hooks/use-client-billing-codes"` and `Badge` (if not already imported).
- Change `GoalsEditor` signature to `{ goals, onChange, clientId }: { goals: CSTGoal[]; onChange: (next: CSTGoal[]) => void; clientId: string }`.
- Inside the component, call `const { data: codes, isLoading } = useClientBillingCodes(clientId)` once and derive a deduped list of `service_code` strings.
- In each goal's card, delete the existing block (lines ~721–733: the "Service codes" label, `<Input>`, its comma-split `onChange`, and the helper `<p>` under it) entirely — no commented-out remnants.
- Replace with a "Service codes" section that renders one of three states:
  - `isLoading` → small muted "Loading authorized codes…" text.
  - Loaded but zero codes for this client → muted message: "No authorized service codes on file. Add them under Billing before assigning goals to codes."
  - Codes available → row of `Badge`-styled buttons, one per code. Selected = filled/primary variant; unselected = outline. Clicking toggles the code in `g.job_codes` via `patchGoal`. If codes exist but `g.job_codes.length === 0`, show an amber warning line below the chips: "No codes selected — this goal won't appear for any staff on any shift until you pick at least one."

**Call sites — pass `clientId`:**
- `src/components/clients/client-specific-training-card.tsx` line 369 render: pass the `clientId` already available in that parent component's scope.
- `src/routes/dashboard.clients.$clientId.tsx` line 623 render: pass the route's `clientId` param.

## Out of scope
No schema changes, no changes to how `job_codes` is persisted (still `string[]` of uppercase codes), no changes to staff-side visibility logic, no changes elsewhere in the file.
