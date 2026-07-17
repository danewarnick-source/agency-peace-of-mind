## Problem

On the final "review" step of the incident report wizard, the panel always shows:

> Review before submitting
> Fix any red items below. Submit becomes available once everything is resolved.

…even when there is nothing red to fix. Two things are wrong:

1. The header is written as if problems always exist. When `contradictions` is empty and no `must_fix` Nectar question is unanswered, the user sees a warning with nothing under it and no way to act on it.
2. The review step never renders a summary of the report. The user has no confirmation of what they're about to submit — just a header and (sometimes) red boxes.
3. When Submit is disabled, nothing on-screen tells the user *why*. `submitBlocked` can be true from `aiReviewing`, an unanswered `must_fix` question earlier in the flow, or a contradiction — but only contradictions render on this step, so an invisible block leaves Submit greyed out with no explanation.

## Change

Edit `src/components/incidents/incident-report-dialog.tsx`, review-step block only (around lines 1566–1593). No changes to `submitBlocked` logic, `findContradictions`, Nectar review, or submit mutation.

**1. Conditional header**

Compute `hasBlockers = contradictions.length > 0 || unresolvedMustFix.length > 0 || aiReviewing`.

- When `hasBlockers` is true: keep the current "Fix any red items below…" copy (amber/rose tone).
- When `hasBlockers` is false: show a green "Ready to submit — review the summary below and click Submit incident report."

**2. Report summary card**

Always render a read-only summary card on the review step showing the key fields the reviewer is about to save:

- Individual (client name)
- Category + severity
- Occurred at / Discovered at (formatted)
- Location
- Witnessed directly? / Reported by (if applicable)
- People involved, Witnesses (if provided)
- Narrative (full text, in a scrollable block, capped ~400px)
- Injuries / Medical attention / Immediate actions (only rows with content)
- Prevention strategies (if abuse category)
- Category-specific `details` block: iterate `block.fields` and show label → value for any non-empty field (covers behavior/restraint, medication, elopement, etc. without hard-coding each)
- Photo count if any uploaded
- Small "Edit" link on each section that jumps back to the matching wizard step via `setStep(stepKeys.indexOf(...))`

Styling: plain `rounded-md border bg-card p-3` sections with `text-xs` labels and `text-sm` values, matching the existing dialog look. No new dependencies.

**3. Surface unresolved must_fix questions on review**

When `unresolvedMustFix.length > 0` on the review step, render each as a rose-bordered row (same visual language as contradictions) with an "Answer question" button that jumps to that Nectar question step (`stepKeys.indexOf("nectar-q-<idx>")` or equivalent — reuse the existing question step key pattern already used in `stepKeys`). This gives the user something clickable when Submit is disabled by a Nectar block that isn't a contradiction.

**4. Nothing else changes**

- `submitBlocked` still gates the Submit button.
- No changes to autosave, Nectar, contradiction logic, or the submit path.
- No new files, no new deps.

## Result

- Clean summary of the incident report on the final step.
- Green "ready to submit" header when there is nothing wrong; red header only when there is.
- Every reason Submit is disabled shows up on the review step with a jump-to-fix link, so the button is never mysteriously greyed out.
