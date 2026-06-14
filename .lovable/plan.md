## Problem (verified)

The EVV Reconciliation queue already has a "Review" dialog with Accept/Flag + attestation — but **the queue is empty in practice because nothing ever sets `reconciliation_status='pending'`**. The `reconcileQ` filter is `.not("reconciliation_status", "is", null)`, while punch-pad inserts `outside_geofence_reason` and leaves `reconciliation_status` null. So out-of-bounds shifts never appear in the queue and there's effectively "no action" for the admin — matches the user's report.

Two more real gaps:
- No third "Correct (data error)" outcome.
- Billing gate (`utah-export-dialog.tsx` line 90) excludes anything with `outside_geofence_reason`, regardless of reconciliation outcome — so even an admin-accepted shift would still be held out of billing.
- Review dialog doesn't show captured GPS distance from the service address; user wants it shown alongside the staff explanation.

GPS distance math (`haversineFeet` in `punch-pad.tsx`) is correct (`EARTH_RADIUS_FEET = 20_925_525`). The ~6.3M-ft reading is consistent with a stray (0,0) "null island" coord or an old cached device fix — the formula isn't wrong, but the display should guard against obviously-invalid inputs.

## Plan — targeted fixes to the existing EVV reconciliation flow (no new tables, no new tool)

1. **Auto-enroll out-of-bounds punches into the queue.**
   In `src/components/evv/punch-pad.tsx` clock-in payload (~line 588), when `isOutOfBounds` is true add `reconciliation_status: 'pending'`. This is the single missing link that makes the queue populate. (Backfill query for any existing rows isn't needed — TNS hasn't launched. If needed we can later one-shot existing rows via SQL handoff.)

2. **Add a third decision: "Correct (data error)".**
   - Migration via SQL handoff: extend the allowed values of `evv_timesheets.reconciliation_status` to include `'corrected'`. Add column comment documenting `pending|accepted|corrected|flagged`.
   - In `ReviewReconciliationDialog` (compliance-desk.tsx ~2066-2207): add a third Decision button "Correct — data/GPS error". `corrected` requires a non-empty notes field (the correction explanation) but no attestation textarea (it's not an affirmation of service delivery).

3. **Strengthen Accept attestation wording (EVV-specific) and use signed-name pattern.**
   Replace the freeform attestation textarea with the existing `AttestationDialog`-style pattern used for incidents (signed name + title + checkbox + locked attestation text):
   > "I have reviewed this EVV location exception and the staff explanation, and I attest that the service was validly delivered and is approved for billing."
   Persist into the existing `reconciliation_attestation` column as a JSON string `{ signed_name, signed_title, attestation_text, signed_at }`. `reconciliation_reviewed_by` continues to capture the admin's display name; `reconciliation_reviewed_at` continues to capture the timestamp. (Keeps schema unchanged besides the enum widening above.)

4. **Show captured GPS + distance + client service address in the dialog.**
   - Surface client `physical_address` (already on row) and the matched approved-location address if any.
   - Compute distance with the same `haversineFeet` (lifted into a shared `src/lib/geo.ts`) between captured `gps_in_coordinates` and either the matched location or `clients.physical_address` (we already geocode approved locations; for raw `physical_address` we can fall back to "distance unknown — no coordinates on file"). Display in feet, with miles in parens when > 5,280 ft.
   - **Sanity guard**: if either coord is missing, exactly (0,0), or distance > 1,000 miles → render as `Captured GPS appears invalid (lat/lng, accuracy Xm) — staff explanation required.` and still allow Correct/Flag. This matches the user's "handle obviously-bad GPS sensibly" ask without altering the captured value.

5. **Make billing gate respect reconciliation outcome.**
   In `src/components/evv/utah-export-dialog.tsx` `categorize()` (line 90), change the `out_of_bounds` exclusion from "any `outside_geofence_reason`" to "has `outside_geofence_reason` AND `reconciliation_status` IS NOT IN (`accepted`,`corrected`)". Pending or flagged → still excluded; accepted/corrected → cleared into the billable set. Add `reconciliation_status` to the existing select strings (3 spots in that file). No billing math changes.

6. **Queue badge & filters.**
   - `reconcilePendingCount` is already pending-only (line 467) — no change.
   - Add `'corrected'` to the filter `<Select>` and to `GeofenceBadge` (compliance-desk.tsx line 40+). Keep the existing styling palette: accepted = success green (existing), corrected = info teal `bg-[#137182]/10 text-[#137182]`, flagged = destructive (existing), pending = warning (existing).
   - Add `reconciliation_status` widening to the `Row` union type (line 160) and to `buildReconciliationCsv` column order (no header change needed beyond uppercase value).

7. **Admin/manager-only gate.**
   The Documentation hub's EVV tab is already inside `_authenticated` and exposed through admin/manager surfaces; the existing reconciliation Review button has no extra role check. Wrap the Review/Resolve button and dialog mount in `useHasRole('admin') || useHasRole('manager')` (use the existing `usePermissions`/role helpers — confirm exact hook name during build). Hide for everyone else; server-side RLS on `evv_timesheets` UPDATE already restricts to org admins/managers (we'll verify with a read query in build mode, no migration needed if so).

8. **Verification before declaring done.**
   - Out-of-bounds clock-in inserts a row with `reconciliation_status='pending'`; it appears in the queue with the Resolve button.
   - Resolve dialog shows: staff explanation, captured GPS + distance (or invalid-GPS banner), client + shift details.
   - Three decisions: Accept (requires signed-name attestation), Correct (requires notes), Flag (notes optional).
   - Saving updates status, attestation JSON, notes, reviewer, timestamp; row leaves the Pending filter; badge count drops.
   - Utah export categorize: a row with `reconciliation_status='accepted'` and `outside_geofence_reason` set is **no longer** excluded; with `pending`/`flagged` it remains excluded.
   - `tsc --noEmit` clean.

## Out of scope (per user)
- The separate timeclock punch-reconciliation tool (`TimesheetsReconcile` / Pay-period reconciliation): not touched.
- Editing/correcting actual punch timestamps or service address (Correct only records the data-error decision + notes).
- HHS daily logic, billing units, CSV column shape.
