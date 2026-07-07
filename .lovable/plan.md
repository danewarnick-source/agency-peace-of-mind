## Fixes to the Smart Import review flow

Three separate issues, all in `src/routes/dashboard.smart-import.$jobId.review.tsx`.

### 1. "Review the remaining 1 below" — nothing to see

Today, when `submitForSetup` returns a partial result, we show a toast and drop the user back on the review page with no visible indication of which subject failed or why. The server already returns `results[i].display_name`, `results[i].gaps` (array of reasons), and `results[i].error` — we just don't render them.

Fix:
- Keep the partial results in local state on `RosterSummary` after `mutation.onSuccess`.
- Render an inline banner directly above/below the "Complete client setup" button listing each uncommitted subject with its display name and the first gap/error reason (e.g. "Jane Doe — last name is required").
- Each row is a button that scrolls to / selects that subject in the roster so the admin can act on it.
- Clear the banner on the next mutate / when the roster query refetches successfully.
- Toast copy stays but adds the display name(s) when there's a single failure (e.g. `Jane Doe wasn't saved — see the reason below`).

### 2. Page 8 of 8: "Next" is disabled instead of "Complete client setup"

On the final Review step, the wizard footer shows a disabled `Next →` button while the actual commit button lives at the top in `RosterSummary`. Users don't scroll back up.

Fix (in `SubjectWizard` footer, ~line 665-673):
- When `idx === steps.length - 1`, replace the disabled `Next` with a primary **Complete client setup** button (staff copy for employee mode) that triggers the same commit as `RosterSummary`.
- Keep `Back` on the left, keep "Step N of N" in the middle.
- To share the commit path without duplication, lift the submit mutation into the parent (`SubjectReviewShell`) and pass a `commit` handler + `commitPending`/`commitDisabled` flags down to both `RosterSummary` and `SubjectWizard`. No new server functions.
- The button obeys the same disabled rules already used by `RosterSummary` (`ready === 0`, white-glove awaiting sign-off, pending).

### 3. Page 5 (Services): manually added field disappears

Root cause: `AddMissingFieldPopover` on the Services step passes the full `targetFields` list, so its dropdown offers every client field. `saveManualReviewRow` writes it as a regular extracted field with `is_custom_attribute: false`. The wizard then buckets rows by `target_field` — anything not in `SERVICES_FIELDS_SET` is filtered out of the Services view and shows up on the Person step instead. From the user's perspective the field they just typed vanished.

Fix (scoped to the Services step only — no data-layer changes):
- Pass a per-step allowed-target list to `PlacementLineup` (new optional prop `allowedTargetFields`) and use it inside `AddMissingFieldPopover` to filter the dropdown to only fields that will render in this section. For Services, that's `SERVICES_FIELDS_SET` (minus `billing_code_row`, which has its own editor).
- Health and Person continue to receive their own subsets so the same class of bug doesn't recur there.
- Additionally, on the Services step widen the visible list to include any manually added row whose `target_field` is in `SERVICES_FIELDS_SET` OR was created during this session with a services-relevant `field_key` — the existing `servicesFields` filter already covers `SERVICES_FIELDS_SET`, so restricting the popover is enough to make the "add → see it" flow correct.
- Small UX polish: after a successful add, the popover already closes; also show a brief inline highlight (existing shadow util) on the new row so it's obvious where it landed.

### Technical notes

- Files touched: only `src/routes/dashboard.smart-import.$jobId.review.tsx`.
- No schema changes, no server-function changes, no new endpoints.
- Result-shape reuse: `submitForSetup` already returns `{ results: [{ subjectId, display_name, committed, record_id, gaps, error? }] }`.
- Commit path is shared by lifting the `useMutation` into `SubjectReviewShell` and passing `{ commit, pending, disabled, reason }` down; both the top RosterSummary button and the Step 8 footer button call the same handler.
