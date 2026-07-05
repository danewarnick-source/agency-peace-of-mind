# Auto set-aside out-of-scope SOW requirements

## Goal
On the Authoritative Sources → Requirements tab, requirements NECTAR drafted from a source document (SOW etc.) that are tied to a service code the organization is NOT authorized for (active OR future) should automatically appear as **"Not applicable — out of scope"**, be excluded from the "needs attention" count, and never be deleted. If the org later gets authorized for that code, the requirement automatically becomes reviewable again. Manual removal (`review_status = 'removed'`) is left completely alone — this new state is separate and visibly distinct.

## Scope guardrails
- Applies ONLY to rows in `nectar_requirements` where `origin = 'document'` (drafted from an authoritative source).
- Does NOT touch: manual requirements, suggestions, `agreement_requirements`, checklists, tenant features, forms, or any other to-do surface.
- Does NOT modify manual removal flow, its audit-trail warning, or the "removed" banner/section.
- Nothing is deleted, ever. This is a computed/derived state.

## Approach: derive, don't mutate
Because the state is a pure function of `(requirement's service codes) × (org's authorized codes today)`, compute it on read. This makes it automatically reversible the moment `provider_authorized_codes` changes — no background job, no drift.

Rules used to decide "out of scope":
- Collect authorized code set = all rows in `provider_authorized_codes` for the org where `archived_at IS NULL` (both active and future/held count — carve_out flag does not disqualify; only archived does).
- A requirement is **out_of_scope** when it has at least one associated code (`service_code` or any entry in `service_codes_all`) AND *none* of its associated codes are in the authorized set.
- Requirements with no code association (`service_code` null AND `service_codes_all` empty/null) are NOT auto-set-aside — they remain in their current review flow (they're org-wide obligations).
- `review_status = 'removed'` always wins — a manually removed row stays "removed" regardless of scope.

## Data / server changes
1. **Extend `listRequirements` in `src/lib/authoritative-sources.functions.ts`** — **the current `.select()` at line 396 does NOT include `service_code` or `service_codes_all`; both must be explicitly added to that select string**, otherwise the derived scope calculation has nothing to read. Then fetch the org's non-archived `provider_authorized_codes.code` set once and return each row with a derived `scope_state: 'in_scope' | 'out_of_scope'` field plus the list of offending codes.
2. **Extend the per-source-document requirements fetcher** (the other `.select(` at ~line 1171/1195 that feeds the source drill-down) with the same two columns added to its `.select()` and the same derived field — only for `origin = 'document'` rows; other origins get `scope_state: 'in_scope'` unconditionally.
3. **Extend the org-wide requirements fetcher** used by `authoritative-sources-page.tsx` (the one populating `Row[]` at line ~330) with the same derived field. Verify its `.select()` also lists `service_code, service_codes_all` before use.

No migration is required. No new column. No RLS change.

## UI changes (Authoritative Sources page only)

`src/components/pages/authoritative-sources-page.tsx`:

1. **`statusOf` / bucket logic** — introduce a derived bucket `not_applicable` that takes precedence over `needs_attention` / `confirmed` but NOT over `removed`. Order of precedence: `removed` → `not_applicable` (auto) → existing (`confirmed` / `needs_attention`).
2. **Top-of-page stats block** (~line 340): add a `notApplicable` counter. Subtract these from `needs` so the "needs attention" number reflects only in-scope items awaiting review. Show the new count as an inline chip: `· N not applicable (out of scope)`.
3. **Per-source group stats** (~line 1413) and per-doc row filter tabs: add a `not_applicable` count next to `removed`. Add a new filter tab **"Not applicable"** alongside All / Needs attention / Fully confirmed / Removed.
4. **Per-item rendering**: when `scope_state = 'out_of_scope'` and status is not `removed`, render the row in a muted style with a small badge **"Not applicable — service code not authorized"** and a tooltip listing which code(s) are out of scope. Suppress the Confirm/Remove primary actions for these rows (they're set aside, not actionable). Keep the row visible so the human can see what was auto-filtered.
5. **Sorting**: `not_applicable` sorts after `fully_confirmed` and before `removed` in the per-doc list.
6. **Copy on the missing-attention banner** stays exclusive to true `needs_attention`; the "removed" banner stays untouched.

## Reversibility
Because scope is derived every read, the moment a user adds a code to `provider_authorized_codes` (or unarchives one), the affected requirements automatically flip back to `needs_attention` / `confirmed` on next fetch — no migration, no backfill, no cleanup.

## Files touched
- `src/lib/authoritative-sources.functions.ts` — add `service_code, service_codes_all` to every requirement `.select()` used here; join authorized codes into the fetchers; return `scope_state` + list of offending codes.
- `src/components/pages/authoritative-sources-page.tsx` — stats, filter tabs, row styling, bucket precedence.

## Verification (against TNS FAKE, SOW 2026)
- The top-line "needs attention" chip decreases; a new "not applicable" chip appears with the delta.
- The SOW 2026 group shows a **Not applicable** tab; items in it list codes TNS FAKE doesn't hold.
- Manually-removed items still appear only under **Removed** with their existing audit warning.
- Adding an out-of-scope code to `provider_authorized_codes` and reloading moves the affected requirements back into **Needs attention** automatically.
- No requirement rows deleted; no schema migration required.