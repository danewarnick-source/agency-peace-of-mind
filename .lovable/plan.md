## Symptom
Selecting **Yes** or **No** on the "Any behaviors of concern observed this shift?" question inside the Shift Verification dialog whites out the entire app (URL unchanged). That signature means something is throwing during React render — the root error boundary is catching it and unmounting the whole tree instead of just the block.

## Where the code lives
- Block: `src/components/evv/behavior-observations-block.tsx`
- Only consumer: `src/components/evv/punch-pad.tsx` (dialog around line 2601, block rendered around line 2917)

Nothing else on the page reads `behaviorAnswers` at render time, so the crash almost certainly originates inside `BehaviorObservationsBlock` when it re-renders with the new answer, not in the surrounding form.

## Root-cause hypotheses (in order of likelihood)
1. Something inside the block throws once `behaviorsObserved` flips (e.g. a bad prop from the "Yes" branch — `options`, `counts`, or a `Textarea`/`Label` import that trips a runtime check).
2. Radix Dialog focus-trap tries to focus a control that unmounts on the same tick.
3. Environmental — the `org_shift_behavior_settings` query flips `behaviorEnabled` off during the transition, unmounting the block mid-event and confusing a controlled input.

I don't yet have the exact stack — it isn't in the console snapshot because I haven't been able to reproduce it end-to-end from a fresh preview (need a live shift open at clock-out).

## Plan

### Step 1 — Stop the white screen (defense in depth, ship immediately)
Add a small, local error boundary component wrapping only `<BehaviorObservationsBlock>` inside `punch-pad.tsx`. On error it will:
- Show an inline red panel: "Behavior Observations couldn't load — please screenshot this and continue submitting your timeclock."
- Log the full error + `behaviorAnswers` snapshot to `console.error` so we capture the real stack on the next preview reload.
- Keep the rest of the Shift Verification form (goals, note, Nectar check, submit button) fully usable so no shift is blocked while we finish the fix.

### Step 2 — Capture the real error and patch it
Once the boundary logs the stack, do a single targeted fix in `behavior-observations-block.tsx` (most likely: guard the derived `options` array, replace the `<label>`-wrapped `sr-only` radios with proper `htmlFor`/`id` pairs so Radix's focus manager doesn't lose the active element, or make the "Yes"/"No" buttons `type="button"` `<button>`s instead of labels-wrapping-radios — the last one has been a recurring source of "click nukes the dialog" bugs elsewhere in the app).

### Step 3 — Verify
Reproduce the exact clock-out flow, click **No** then **Yes**, and confirm:
- No white screen
- No console error from the block
- Toggling Yes ↔ No leaves the rest of the form intact and the Submit Timeclock button behaves as before

### Files touched
- `src/components/evv/punch-pad.tsx` — wrap the block in the new boundary; no logic changes to submission.
- `src/components/evv/behavior-observations-block.tsx` — targeted fix from Step 2.
- (Possibly new) `src/components/evv/behavior-observations-boundary.tsx` — tiny class-component boundary, ~40 lines.

No schema changes, no changes to submission payload, no changes to validation semantics.