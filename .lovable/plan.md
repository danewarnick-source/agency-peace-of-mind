## Problem

The "Delete and re-extract" button spins forever because the current server function does everything in one request:

1. Deletes all TNS FAKE requirements
2. Loops over every eligible authoritative source document
3. For each doc, calls the AI gateway (Bedrock) to extract requirements

Each extraction is a slow AI call. Multiplied across many source docs it easily exceeds the browser's request timeout, so the client never sees a response and the spinner never resolves — even though the server keeps working and (eventually) finishes. There is also no visible progress, so the user can't tell what's happening.

## Fix

Split the operation into two phases so each network request is short and the UI can show progress.

### Phase 1 — Wipe (fast, one request)
- New/renamed server fn `wipeRequirementsForOrgRebuild({ organizationId, confirm: "REBUILD" })`.
- Still TNS-FAKE-scoped and admin/super_admin-gated.
- Calls the existing `rebuild_wipe_requirements_tns_fake` RPC (already handles the append-only trigger).
- Then queries eligible authoritative sources (`is_authoritative_source = true`, not ignored, not in `NON_OBLIGATION_KINDS`).
- Returns `{ deleted, documents: [{ id, title }] }` immediately.

### Phase 2 — Extract (client-driven loop, one doc per request)
- The button's mutation is replaced with a small state machine in `RebuildDemoRequirementsButton`:
  1. Call `wipeRequirementsForOrgRebuild` → get doc list.
  2. For each doc, sequentially call the existing `generateRequirementsFromSource({ documentId })` (already Prompt 38-upgraded).
  3. Track `processed`, `inserted`, `failed` counters and update the dialog UI live (e.g. "Extracting 3 / 17 — 42 requirements so far").
  4. On completion, toast the summary, invalidate the requirements query, close the dialog.
- If a single doc call fails, record the failure and continue with the rest.

### UI details
- Keep the typed "REBUILD" confirmation gate.
- Replace the single "Rebuilding…" spinner with a progress line inside the dialog: current doc title, "N of M", running inserted count, and a small progress bar.
- Disable Cancel while running; when finished, swap the primary button to "Done".
- Nothing else in the Requirements tab changes.

### Files touched
- `src/lib/authoritative-sources.functions.ts` — replace the single-shot `rebuildRequirementsForOrg` with `wipeRequirementsForOrgRebuild` (returns eligible doc list). Leave `generateRequirementsFromSource` unchanged.
- `src/routes/dashboard.authoritative-sources.tsx` — rewrite `RebuildDemoRequirementsButton` to drive the two-phase flow with live progress. Imports adjusted accordingly.

### Not changed
- The append-only-trigger bypass RPC (already working).
- Extraction logic, `service_code` capture, mapping tables, authorized codes.
- Any other org's data or non-TNS-FAKE code paths.

### Done means
- Clicking "Delete and re-extract" wipes requirements in one fast request, then the dialog shows live per-document progress until every eligible source has been re-extracted.
- The spinner always resolves — either to a success summary or a summary with per-doc failures listed.
- No single request runs long enough to hit the browser/edge timeout.
