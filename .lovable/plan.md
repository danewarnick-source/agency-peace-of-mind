## What to change

On Step 4 (narrative) of the Incident Report wizard, gate the **Next** button behind a new **Review with NECTAR** action. NECTAR reads whatever the staff typed in "What happened" (whether they used the AI draft or wrote it themselves), and returns the same kind of concrete follow-up questions the Draft-with-NECTAR flow already produces. Staff must answer each `must_fix` question (or mark it N/A with a reason) before **Next** unlocks.

This is the same pattern as the existing draft gap-answer UI — we're just attaching it to the manually-written narrative too, right on the narrative step instead of one step later.

## Behavior

1. While `currentKey === "narrative"`, the **Next** button is disabled with a tooltip "Review with NECTAR before continuing" until a successful review has happened against the current narrative text.
2. New **Review with NECTAR** button sits next to Next (or under the "What happened" textarea). Disabled until `description` passes the existing 120-char `validateNarrative` check (so we don't burn an AI call on an empty field).
3. Clicking it calls the existing `review-incident-report` edge function with the current draft and shows:
   - **No gaps** → green check "NECTAR has no follow-ups — you can continue." Next unlocks.
   - **Gaps returned** → render the same gap list UI already used for the AI draft (question + answer textarea + "N/A — explain why"), styled identically. Each `must_fix` must be answered or N/A'd; `should_add` are suggestions only.
   - **Skipped/timeout/error** → fail-open (don't block the 24h UPI clock): show the existing "AI review skipped" badge, unlock Next, and stamp `details.ai_review_skipped = true` — same fallback used elsewhere.
4. Answered Q&A get appended to `description` as a "Staff follow-up answers" block (same pattern as `acceptNectarDraft`) when staff clicks Next, so the enriched narrative carries forward into the rest of the wizard and final submission.
5. If staff edits `description` after a successful review, invalidate the review (clear gaps, re-disable Next, require another Review click). This prevents bypassing by reviewing → editing → next.
6. Since the narrative is already reviewed in-step, the downstream `nectar-interview` step becomes redundant when this in-step review succeeds. Skip the `nectar-interview` step in `stepKeys` if the narrative review already passed (or already collected & answered gaps). Keep it as a fallback only when the in-step review was skipped due to timeout, so admins still see the same flow.

## Files

- `src/components/incidents/incident-report-dialog.tsx` — only file touched.
  - New state: `narrativeReviewStatus: "idle" | "reviewing" | "passed" | "needs_answers" | "skipped"`, `narrativeReviewIssues: AiIssue[]`, `narrativeGapAnswers`, `narrativeGapNA`, plus a `reviewedDescription` snapshot used to invalidate the review when `description` changes.
  - New handler `runNarrativeReview()` — mirrors `runAiReview` but writes to the narrative-review state (does NOT touch `aiAttempted`, so the later `nectar-interview` effect still works as a safety net).
  - In the narrative section JSX (around lines 1024–1158), add the Review button + result panel + gap-answer list (reusing the Tailwind classes from the existing draft-gap block at lines 1072–1118).
  - In `validateStep("narrative")`, add: if review not passed and not skipped and `must_fix` count > 0 with unanswered items → return error string. Combine with the existing 120-char check.
  - In `handleNext()` for the narrative step: if there are answered gaps, append them to `description` (same shape as `acceptNectarDraft`) before advancing.
  - In `stepKeys` (around line 288): conditionally drop `"nectar-interview"` when the in-step review already produced `"passed"` or all `must_fix` answered.
  - No changes to the edge function — `review-incident-report` already accepts a partial draft and returns the same `{ complete, issues, skipped }` shape.

## No DB / no edge-function / no schema changes

Everything rides on the existing `details.ai_review_skipped`, `ai_review_status`, `ai_review_issues` fields that are already persisted on submit (see lines 779–807). Nothing for the user to approve on the database side.
