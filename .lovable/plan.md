## Status check (already done in earlier turns)

- **Fix 1** — `use-deadlines.tsx` no longer queries or emits `hhs_cert` rows; only the annual `host_home_cert` source remains. No other file references the old monthly cert. ✅
- **Fix 2** — Every item in the hook sets `href` (summary → `/dashboard/summaries?open=<id>`, host home cert, staff cert, incident, billing-code), and rows render the title as a link. ✅
- **Fix 3** — `DeadlinesHomeCard` is exported from `dashboard.deadlines.tsx` and already mounted in `dashboard.index.tsx`. ✅

Verification will be a re-read of those three files to make sure nothing regressed.

## Fix 4 — wire summary deadlines to the Summaries portal as the single source of truth

Almost everything needed for Fix 4 is already in place:

- `listOpenSummaries` filters `completed_at IS NULL`, so deadlines automatically disappear once a summary is finalized.
- `finalizeSummary` in `progress-summaries.functions.ts` sets `completed_at`, `finalized_at/by/by_name`, and `status='finalized'`.
- `dashboard.summaries.tsx` accepts `?open=<uuid>` and opens that summary's review dialog.
- Summary items in `use-deadlines.tsx` already set `href: /dashboard/summaries?open=<id>`.

The only thing left is the redundant "Mark complete" button on the Deadlines page action column.

### Change in `src/routes/dashboard.deadlines.tsx` (`RowAction` component)

Today:
```text
if (item.source === 'summary' && item.summary) {
  if (requires_upi_attestation) → "Entered into UPI" button (attest)
  else                          → "Mark complete" button (markSummaryCompleted)
}
else if (item.href)             → "Open" link
```

Target:
```text
if (item.source === 'summary' && item.summary) {
  render: "Open summary" link → item.href (/dashboard/summaries?open=<id>)
  if requires_upi_attestation AND finalized but not yet UPI-entered → also render "Entered into UPI" button
}
else if (item.href)             → "Open" link
```

Concretely:
- Remove the `markSummaryCompleted` branch entirely from the Deadlines page UI (kept on the server in case other callers use it — quick grep first; remove the import + the `complete` mutation block here regardless).
- Always render an "Open summary" link button (using `item.href`) for summary rows.
- For SEI / UPI-required summaries, keep the existing `attestSummaryUpiEntered` button, but only show it when the summary is already finalized and `upi_entered_at` is null. (Today the button shows on any UPI-required open row; an unfinalized SEI summary still needs to be finalized first in the portal. If the summary is finalized but UPI-pending, the listOpenSummaries filter excludes it since `completed_at` is set — so the SEI attestation needs its own source in the hook OR we relax the filter for `requires_upi_attestation`.)

### Quick check needed before coding: does the SEI "Entered into UPI" deadline still appear after finalize?

Reading `listOpenSummaries` — it excludes any row with `completed_at IS NOT NULL`, and `finalizeSummary` sets `completed_at`. That means today's SEI flow can only attest UPI *before* finalize. If the user expects the SEI attestation to be a separate step that survives finalize, we need to switch the open-summary filter to include rows where `requires_upi_attestation = true AND upi_entered_at IS NULL`, regardless of `completed_at`.

I'll confirm current SEI behavior with a one-line code read before editing — then make the minimal adjustment so:
- Non-UPI summary → shown until finalized → "Open summary" link only.
- UPI summary → shown until BOTH finalized AND `upi_entered_at` set → "Open summary" link always; "Entered into UPI" button appears once finalized.

### Files touched

- `src/routes/dashboard.deadlines.tsx` — drop "Mark complete" branch, render "Open summary" for all summary items, keep SEI attest button under the updated condition. Remove unused `markSummaryCompleted` import + mutation.
- `src/lib/progress-summaries.functions.ts` (only if check above shows SEI rows disappear post-finalize) — broaden `listOpenSummaries` to keep UPI-attestation-pending rows visible after finalize.

### Verification I'll run before replying done

1. Read the three "already done" files end-to-end and confirm no `hhs_cert`, no dead buttons, `DeadlinesHomeCard` still mounted.
2. After the edit, confirm:
   - Summary row action is "Open summary" (link), not "Mark complete".
   - Clicking it routes to `/dashboard/summaries?open=<id>` and the review dialog opens (already supported by `searchSchema`).
   - SEI row keeps the "Entered into UPI" button, still functional.
3. `tsc --noEmit` clean.
