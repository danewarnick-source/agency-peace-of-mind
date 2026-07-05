# Batch-confirm SOW requirements from the Authoritative Sources list

## What changes for the user

Inside each document's requirement group on the Requirements tab, admins can:

1. Tick a checkbox next to any requirement that currently needs attention.
2. Or click **Select all shown** to select every needs-attention row currently rendered under the active row filter (e.g. after choosing the **Needs attention** filter).
3. Click **Confirm N selected** — every selected requirement is confirmed in one go, using the same server logic already used per-row.

Every selected row's title AND description are already rendered inline in the list today (line 2058: `req.description` printed under the title). No summary substitution. If a row is hidden (behind a collapsed section or filtered out) it cannot be selected — the checkbox lives on the row itself, so nothing off-screen is ever selectable.

Scope: only the Requirements tab under Authoritative Sources (`DocumentRequirementGroup` in `src/components/pages/authoritative-sources-page.tsx`). No other confirmation/approval flow anywhere else in the platform is touched. No backend changes — reuses existing `confirmRequirementWithScopes` and `setRequirementReviewStatus` server functions.

## Implementation

### `src/components/pages/authoritative-sources-page.tsx` only

**1. Per-group selection state in `DocumentRequirementGroup`**

Add `const [selected, setSelected] = useState<Set<string>>(new Set())`. Reset when `rowFilter` changes or when items list changes materially (drop any ids no longer in `activeItems`).

Compute `selectableIds` = `activeItems.filter(r => effectiveStatusOf(r) === "needs_attention").map(r => r.id)` — rows currently visible under the active filter and eligible for confirmation. Also filter to `req.origin === "document"` so we only offer batch confirm on requirements drafted from an authoritative source (matches the user's scope statement).

**2. Batch action bar** (new, inside the group's expanded body, above the `<ul>` — visible only when `rowFilter === "needs_attention"` or `rowFilter === "all"` AND `selectableIds.length > 0`)

- `Checkbox` "Select all shown (N)" — toggles the whole `selectableIds` set.
- `Confirm N selected` primary button — disabled when `selected.size === 0` or mutation pending.
- `Clear selection` ghost button when any selected.
- Small helper text: "You're confirming N requirements you can see below. Each will be logged to the attestation trail individually."

**3. Per-row checkbox on `RequirementRow`**

Extend `RequirementRow` props with optional `selectable?: boolean`, `selected?: boolean`, `onToggleSelect?: (id, next) => void`. Render a `Checkbox` at the far left of the row's header line, only when `selectable === true`. If not `selectable` (row is fully confirmed / removed / not_applicable / manual origin / no callback provided) render nothing so existing rows are unchanged.

**4. Batch confirm handler**

Reuses existing server functions — no new endpoint. For each id in `selected`:

- If the row has `pendingProposals > 0 && unknown === 0` (matches existing `hasPrefilledProposals` logic) → call `confirmRequirementWithScopes({ requirementId })`.
- Otherwise → call `setRequirementReviewStatus({ id, status: "confirmed" })`.

Run with concurrency 4 (`Promise.all` on chunks) so a batch of 50 finishes quickly without stampeding. Track `ok/failed` counters; on completion `toast.success("Confirmed N of M requirements.")` (or `toast.error` with count if any failed), invalidate the same query keys the single-row confirm invalidates (`["requirements", orgId]`, `["req-mappings-all", orgId]`, `["attestations", orgId]`), clear selection.

Each server call still writes its own individual attestation row (existing behavior of both fns) — the batch action does not create a synthetic "batch attestation"; every requirement gets its own audit record with the same statement it would have if confirmed one-at-a-time.

## What is NOT changing

- `confirmRequirementWithScopes` / `setRequirementReviewStatus` in `src/lib/nectar-engine.functions.ts` and `src/lib/authoritative-sources.functions.ts` — untouched.
- The review-queue dialog (`ReviewQueueDialog`) — untouched.
- Removed / not-applicable / already-confirmed rows — not selectable, unchanged.
- Applicability-scope confirmations at the mapping level — untouched.
- No other confirmation/approval surface in the app.

## Verification

- On SOW 2026 group, click **Needs attention**, click **Select all shown**, then **Confirm N selected** — every row moves to confirmed with a single click; toast shows counts; attestation trail lists one entry per requirement.
- Individually ticked mixed selection (some with proposals, some without) confirms each with the right server function.
- Fully-confirmed / removed / not-applicable rows never render a checkbox.
- Collapsing the group or switching to a filter that hides selected rows keeps prior selection cleaned up (selection filtered against currently-selectable ids on render).
