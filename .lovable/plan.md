# Smart Import Review — clearer issues + working delete

## What's actually wrong

Two independent bugs in `src/routes/dashboard.smart-import.$jobId.review.tsx`:

**1. "Removed" toast fires but the SCE row stays.**
`removeExtractedField` soft-deletes by setting `dismissed_at` (server-side). The validator correctly ignores dismissed rows — but `BillingCodesEditor` renders every `billing_code_row` field regardless of `dismissed_at`, so the row snaps back on refetch and the warning stays.

```
Line 783:  const billing = fields.filter((f) => f.target_field === "billing_code_row");
           //                                    ^ no dismissed_at filter
```

**2. The Review-step issues panel gives you nothing to do.**
The `org.codes_held_missing` warning (visible in your screenshot) is a warning-severity, non-blocking issue. `ValidationPanel` only renders action buttons for `codeMatch` (code-routing) issues and blocking issues. Every other warning shows only the raw technical message with no "here's how to fix it" and no button.

## Fix

### 1) Delete actually removes the row (one line)

`src/routes/dashboard.smart-import.$jobId.review.tsx` — line 783:

```ts
const billing = fields.filter(
  (f) => f.target_field === "billing_code_row" && !f.dismissed_at,
);
```

That's it — the server-side soft-dismiss already works; we just need to hide the row after refetch. After you delete SCE, the `codes_held_missing` warning also disappears because the validator already filters dismissed rows (line 87) and only complains when `draft.billing_codes.length > 0`.

### 2) Plain-English guidance + one-click actions per issue

Add a small `ISSUE_HELP` map keyed by `issue.key` (with prefix matching for the `code.*` families). Each entry supplies:

- `whatToDo`: one plain sentence rendered under the technical message
- optional `action`: `{ label, href | onClick }` rendered as a button next to (or instead of) the existing Confirm/Un-confirm button

Initial entries:

| Issue key | whatToDo | Action |
|---|---|---|
| `org.codes_held_missing` | "Set this org's awarded service codes so NECTAR can tell 'ours' from 'other provider' automatically. You can also just delete any codes below that aren't yours." | Button "Set awarded codes" → `/dashboard/nectar-company-profile#codes-held` |
| `client.missing_pcp` / `client.missing_specialist` / other `client.missing_*` | "Open the Person & contacts step and fill in this field, or delete the extracted row if it doesn't apply." | Button "Go to Person step" → sets wizard `step` to `"person"` (uses existing `setStep` from `SubjectReview`) |
| `client.address_incomplete` | "Complete the mailing address on the Person step, or dismiss the extracted address if it's not needed." | Button "Go to Person step" |
| `code.*` (billing-line issues) | "Fix the row in the Billing codes table below (edit values or delete the row)." | Button "Jump to billing table" → sets `step` to `"services"` and scrolls to `#billing-codes` |
| default (unknown key) | "Review this item and either fix it above/below or click Confirm to acknowledge." | Existing Confirm button only |

Plumbing:
- Pass `onNavigateStep: (id: WizardStepId) => void` from `SubjectReview` into `ValidationPanel` so the "Go to X step" buttons work with the existing step rail.
- Add `id="billing-codes"` to the `BillingCodesEditor` root so the "Jump to billing table" button can scroll to it.
- Non-blocking warnings get an additional ghost "Dismiss" button that calls the existing `overrideValidationIssue` with `overridden: true` so the admin can clear advisory noise once they've read it.

### 3) Keep the panel honest

- Sort issues: blocking errors first, then warnings. Screenshot shows one warning treated with the same red-alert weight as a blocking error — tone that down: use `border-amber-300` / `bg-amber-50` for warning-only panels and reserve the destructive styling for `validation.ok === false`.
- Update the header text to reflect count + severity, e.g. "1 thing to review before saving (0 blocking, 1 advisory)".

## Files touched

- `src/routes/dashboard.smart-import.$jobId.review.tsx` — the four changes above. No server-function, schema, or business-logic changes. Purely UI + one filter fix.

## Verification

1. Reload the review page for Blake Adams; the SCE row's trash button now removes the row *and* the warning banner clears (only remaining rows are TNS).
2. On a client with `codes_held` empty and an "ours"-only PCSP, the warning shows amber with a "Set awarded codes" button that opens the company profile.
3. On a client missing PCP, the panel says "Open the Person & contacts step…" with a working "Go to Person step" button that switches the wizard.
4. Non-blocking warnings can be dismissed via the ghost "Dismiss" button; blocking errors still require the existing Confirm flow.
