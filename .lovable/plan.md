
# Simplify Pending-Client Finalization

Preserves §2 (verified working pieces). Fixes guardianship at the data layer, unifies review issues, and makes Finalize Client the single normal-path action.

## 1. Shared guardian normalizer (data layer, not UI)

Add `normalizeGuardianFields(draft)` in `src/lib/import-validation.ts`:

- `isGuardianValueEmpty(v)` = empty/whitespace, OR `isNonAnswer(v)` (from `nectar-quality.ts`), OR matches `/own guardian|self[- ]?guardian|^n\/?a$/i`.
- If `is_own_guardian === true`, OR `guardian_name` empty-after-normalization with no other real guardian field → set `is_own_guardian = true`; null `guardian_name/phone/relationship/email`.
- If `is_own_guardian === false` and a real guardian name exists → keep as-is.
- Only case left producing the `guardian_self_vs_named` issue: `is_own_guardian === true` AND a real, non-self guardian name present — demoted from blocking error to **confirmation** (see §2).

Wire the helper into all three layers so they agree:

- `buildDraftFromExtractedFields` (`smart-import-review.functions.ts:126`) — normalize the assembled draft before returning, so `validateClientDraft` runs against post-normalization values.
- `applyClientFields` (`smart-import-review.functions.ts:755`) — normalize the merged payload before writing/re-validating.
- `commitClient` (`smart-import-commit.functions.ts:281-312, 326-340`) — replace inline `normalizeGuardianship` with the shared helper; keep `defaultSelf` semantics by calling it before the existing trigger-safety pass.

In `findClientContradictions` (`import-validation.ts:76`), reclassify `guardian_self_vs_named` from a blocking contradiction to a `category: "confirmation"` item (still emitted; consumer decides severity).

## 2. Unified "Items needing review" model

Extend `getPendingClientSubject` to return a single `reviewItems` array (no schema changes):

```ts
type ReviewItem = {
  id: string;
  category: "required" | "confirmation" | "optional";
  field?: string;
  message: string;
  source: "validation" | "contradiction" | "nectar_question" | "field_confirmation";
};
```

Assemble by merging, after normalization:

1. `validateClientDraft` blocking issues → `required`.
2. `findClientContradictions` (post-normalization) → `confirmation`, except a real hard contradiction stays `required`.
3. Open `import_nectar_questions` for the subject (the source behind review.tsx "No clarifying questions" + "needs you to confirm" sections — verify both during implementation; both feed this list).
4. Validation warnings → `optional`.

`FinalizeClientEditor` renders one panel grouped Required / Needs confirmation / Optional. Drop the prior separate "blocking summary" + "unmapped issues" blocks. Resolving an item (editing a field, answering a question, picking self-guardian) calls `applyClientFields` / `answerNectarQuestion`, re-fetches the subject, and the list updates live.

Add a "Client is their own guardian" confirmation control inside the panel for the `guardian_self_vs_named` item that toggles `is_own_guardian` via `applyClientFields` (nulls guardian fields via the shared normalizer) — single binary choice.

## 3. Single "Finalize Client" action

`FinalizeClientEditor`:

- Primary button text → **Finalize Client**. Same engine as today: `applyClientFields → setSubjectReady → commitSingleSubject`, stopping if still blocking after re-validation.
- On success, invalidate `pending-client-subjects` + `clients`, close, and `navigate({ to: "/dashboard/clients/$clientId", params: { clientId: newId } })`; fall back to `/dashboard/clients` if id not resolvable.
- Keep **Save progress** and **Discard** as secondaries. Remove no other paths (Mark ready / Submit for setup / Retry commit are not exposed in the Pending flow already; this change just ensures we never add them back).
- Idempotency preserved via existing `committed_at` guard in `runJobCommit`.

## 4. Pending Clients page

- Default action is **Finalize** → opens the editor.
- Demote `Open in review` to a small secondary link **Open full import (advanced)** with a tooltip noting it's for billing-code / complex blocks.
- Replace raw `it.review_status` rendering with `clientPendingStatusLabel(subject)` (new helper in `src/lib/smart-import-status.ts`):
  - `discarded_at` → "Discarded"
  - `approved`/committed → "Finalized"
  - `in_progress`/`ready` with zero blocking → "Ready to finalize"
  - else → "Needs review"
- Remove "Possible duplicate" raw badge wording only if it currently leaks ids; keep the badge.

## 5. Done page cleanup (`dashboard.smart-import.$jobId.done.tsx`)

- Header logic: when `committedCount === 0`, render "{n} imported client{s} still need review before joining your directory." Primary CTA: **Review pending clients** → `/dashboard/clients/pending`. Only show "Records committed" when `committedCount > 0`.
- Retry commit visible only when no subject has blocking validation items (transient/system error case). Otherwise hide; show the Pending link instead.
- Keep audit trail + undo.

## 6. Status translation helper (UI only)

`src/lib/smart-import-status.ts` exports `clientPendingStatusLabel`. Used in Pending page, done page, history wording. DB CHECK constraint untouched.

## 7. Out of scope (call out as FUTURE)

- Inline billing-code editing in finalize editor.
- New merge UI.
- NECTAR free-text "why can't this finalize."

## 8. Files touched

- `src/lib/import-validation.ts` — add `normalizeGuardianFields`, reclassify guardian contradiction.
- `src/lib/smart-import-review.functions.ts` — call normalizer in `buildDraftFromExtractedFields` + `applyClientFields`; extend `getPendingClientSubject` with `reviewItems`.
- `src/lib/smart-import-commit.functions.ts` — replace inline `normalizeGuardianship` with shared helper at both call sites.
- `src/lib/smart-import-status.ts` — new label helper.
- `src/components/clients/finalize-client-editor.tsx` — unified panel, Finalize Client button, success navigation, guardian self-toggle, question answering.
- `src/routes/dashboard.clients.pending.tsx` — friendly labels, demoted "Open in review".
- `src/routes/dashboard.smart-import.$jobId.done.tsx` — header + primary CTA + Retry visibility.

## 9. Acceptance (per §14)

Verified by: self-guardian-with-junk-string finalizes in one click; unified panel with no contradictory "none" message; double-click safety; done page never lies about commits; no `mark ready` / `submit for setup` / `retry commit` in normal path; roster + RBAC + §2 invariants untouched; `tsgo --noEmit` clean; `npm run build` regenerates routes.
