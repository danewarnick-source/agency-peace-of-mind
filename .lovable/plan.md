## Goal
When a provider marks a PCSP billing row as **Not my organization**, that row becomes purely informational — no editing, no status nag, no HIVE approval nudge, no counting toward alerts/warnings, and it does not flow into any downstream system.

## Current behavior (why it's noisy)
`src/routes/dashboard.smart-import.$jobId.review.tsx`
- The Ownership cell already shows the "Not our organization" badge + Undo, but the rest of the row (`Unit`, `Rate`, `Annual`, `Mo`, `Term`, `Status`, delete) stays fully editable and the row still gets a `ready`/`pending` badge.
- The amber summary block ("3 outside-provider codes on this PCSP · 1 approved · 1 awaiting HIVE · 1 not ours") counts not-ours rows in its headline and lists them again in the mono line — user reads that as a lingering warning.
- The card's help text still tells the user to "Request HIVE approval" for external rows even after they've resolved them.

`src/lib/client-import-schema.ts` → `applyExtractedFieldsToClient` / `partitionCodeRows`
- `not_ours` rows still get written into `client_external_services` as "coordination info". They are also still forwarded to service-classification with no signal about the admin's ack.

## Changes

### 1. `src/routes/dashboard.smart-import.$jobId.review.tsx` — `BillingRowEditor`
When `row.ownership_ack === "not_ours"`:
- Replace the editable cells (Unit, Rate, Annual, Mo, Term) with plain read-only text in muted tone (fall back to `—` when empty).
- Hide the Status badge cell entirely (render an empty `td`); no `ready`/`pending` chip.
- Hide the "Request HIVE approval" / "View thread" buttons and the approval unread pill.
- Keep the delete (trash) button and the Ownership cell's `Not our organization` badge + `Undo` link + "Kept for record." caption.
- No save button appears (row is not editable).

Optional visual polish: add `bg-muted/30 text-muted-foreground` to the `<tr>` so the row visibly recedes.

### 2. Billing card summary + help (same file, `PcspBillingCodesCard`)
- Compute `activeExternal = externalRows.filter(p => p.row.ownership_ack !== "not_ours")`.
- Only render the amber summary block when `activeExternal.length > 0` (not `externalRows.length`). Counts (`approvedCount`, `pendingCount`) already use `unresolvedExternal`; drop the `notOursCount` badge and the "· N not ours" suffix from the summary line and the mono list. Not-ours rows are no longer an alert — they live silently in the table.
- Reword the header "Details" disclosure so it only mentions the HIVE approval flow (removing the "Not my organization" prompt now that it's the resolved state).

### 3. `src/lib/client-import-schema.ts` — `applyExtractedFieldsToClient`
- Before calling `partitionCodeRows`, filter out any `billing_code_row` whose source field carries `ownership_ack === "not_ours"`. Add `suggested.push` note e.g. `"N external code(s) marked 'Not my organization' — kept on record, not billed or tracked."`
- This means not-ours rows do NOT create `client_external_services`, do NOT touch `authorized_dspd_codes`, and never reach the billing-codes pipeline. They remain solely on the extracted-field record for display on the PCSP card.

To carry the ack through, extend the `NormField` mapping in `smart-import-commit.functions.ts` (line ~500) so that when `field_key === "billing_code_row"` the parsed `value_json` retains its `ownership_ack` key (already preserved because `JSON.parse` returns the full object). Then in `applyExtractedFieldsToClient`, check `(row as { ownership_ack?: string }).ownership_ack === "not_ours"` when partitioning.

### 4. Nectar billing readiness bar (`src/components/billing/nectar-billing-readiness-bar.tsx`)
- If this component counts external/pending rows for alerts, exclude any `billing_code_row` fields with `ownership_ack === "not_ours"` from its counts too. (Verify during implementation; if the bar reads from `client_billing_codes` only, no change is needed since not-ours rows never land there.)

## Not changing
- The DB shape / ack value (`"not_ours"`) and the Undo path stay identical.
- The user can still click **Undo** to reopen the row for editing or HIVE approval; that behavior is unchanged.
- Existing already-persisted `client_external_services` rows are not migrated — this only affects new finalizations.

## Verification
- Typecheck.
- In the review page: mark an external row Not my organization → row cells collapse to plain text, Status column empty, HIVE buttons gone, amber summary either disappears or drops its count by one, and finalize afterward creates no `client_billing_codes` or `client_external_services` row for that code.
- Undo returns the row to fully editable with the HIVE approval option restored.
