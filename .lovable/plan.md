## Problem

The screenshot shows NECTAR producing a draft whose body literally reads "Staff did not record the antecedent circumstances or Marcus's condition prior to the medication being administered." That phrasing is hard-coded into the drafter's system prompt (`src/lib/ai-coach.functions.ts` line 464: *"If the shorthand is silent on a required element, write 'Staff did not record [X]' so the reviewer can ask"*).

Result: NECTAR is documenting the absence of information instead of prompting the staff to supply it. The downstream `review-incident-report` pass and the wizard's "nectar-interview" step already exist and already block submission on `must_fix` issues for **both** the NECTAR-draft path and the manual-write path — that part doesn't need rebuilding. The fix is upstream, in how the drafter behaves.

## What changes

### 1. Drafter returns gaps separately, never bakes them into the body

`draftIncidentNarrative` in `src/lib/ai-coach.functions.ts`:
- Rewrite the system prompt so NECTAR ONLY writes sentences for facts that are present in the shorthand or known facts. It must NOT write "Staff did not record X", placeholder sentences, or invented details.
- Return shape becomes `{ draft, gaps }` where `gaps` is an array of `{ field, question, severity: "must_fix" | "should_add" }` for each of the 5 required coverage elements (who, antecedent, event sequence, staff response during, outcome) that the shorthand failed to cover. Questions must be concrete and answerable in 1–2 sentences ("Where were you when the medication was administered?", "What was Marcus's mood/behavior right before the dose?").
- The five required-coverage rules in the prompt stay; the consequence flips from "fill with 'not recorded'" to "list as a gap question".

### 2. Wizard surfaces gaps as required follow-ups before "Use this draft"

`src/components/incidents/incident-report-dialog.tsx`:
- After `runDraftWithNectar()` resolves, store `nectarDraftGaps` alongside `nectarDraft`.
- Render the gaps below the draft preview as a checklist. Each `must_fix` gap gets an answer textarea + an "N/A — explain why" option (mirroring the existing `aiAnswers` / `aiNA` pattern used at the `nectar-interview` step).
- Disable "Use this draft" until every `must_fix` gap has an answer or N/A reason.
- When the user clicks "Use this draft", call a new lightweight server fn `mergeIncidentDraftAnswers` (same file as the drafter) that re-runs the drafter with the answers folded in as additional known facts, OR — simpler and one fewer AI hop — append the Q&A pairs to the draft locally as a short final paragraph ("Per staff follow-up: …"). Recommend the local-append approach to keep the 10s budget intact and avoid a second model call.
- Existing `acceptNectarDraft()` → `runAiReview()` chain stays; the second-pass reviewer is the safety net.

### 3. Manual-write path unchanged in behavior, clarified in copy

The "skip the draft and write your own" path already routes through `nectar-interview` → `review-incident-report` and already blocks submission on `must_fix`. Tighten the empty-state copy on that step so it's obvious NECTAR will ask follow-ups on manual narratives too ("NECTAR reviews every narrative — yours or its own — and will ask follow-ups before you can submit.").

### 4. No DB / migration / RLS changes

Pure code change in two files. The `details.nectar_followups` JSON already persists on submit, so the new gap answers will land there automatically through the existing `buildDraft()` payload.

## Files touched

- `src/lib/ai-coach.functions.ts` — rewrite `draftIncidentNarrative` system prompt + return shape (`{ draft, gaps[] }`), bump `IncidentDraftResult`.
- `src/components/incidents/incident-report-dialog.tsx` — add `nectarDraftGaps` state, render gap-answer UI under the draft preview, gate "Use this draft" on must_fix answers, append answered Q&A to `description` on accept, tweak nectar-interview step copy.

## Out of scope

- Changing the post-draft `review-incident-report` edge function (already does the right thing; fail-open behavior on AI outage stays as-is per the 24-hr UPI clock rule).
- Persisting gaps as a separate column — they ride along inside `details.nectar_followups` as today.
- Touching the shift-note drafter (`draftShiftNote`) — different surface, different rules.