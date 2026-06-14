## Goal
Collapse Documentation from 8 top tabs + 6 sub-tabs into exactly **5 top tabs**: **Records · Incidents · Forms · Audit · Human Rights Committee**. Build a single Records surface that absorbs Review + EVV & timesheets (all sub-tabs) + Approved EVV Archive + Host home, with one combined "needs review" exception queue and a context-aware export gate. Incidents / Audit / HRC are untouched.

## Reused (no rewrites)
- `src/lib/utah-evv-export.ts` — `buildUtahCsv`, `downloadCsv`, header. Untouched.
- `src/lib/evv-codes.ts` — `EVV_SERVICE_CODES`, `isEvvLockedCode`, `evvServiceLabel`. Untouched.
- `src/lib/service-billing.ts` + `src/lib/billing-units.ts` — billing/units math. Untouched.
- `src/lib/nectar-quality.ts` — `validateNarrative` for the "Missing/short note" flag.
- `src/components/residential/residential-daily-tab.tsx` — rendered as-is when filter = Residential & Daily.
- `src/components/evv/approved-evv-archive.tsx` `EvvArchivePage` — embedded as the "Approved/Billed" view.
- `src/components/evv/utah-export-dialog.tsx` — existing Utah CSV export dialog (called only when gate passes).
- `src/components/nectar/nectar-search-bar.tsx` — semantic search bar above the Records table.
- `src/routes/dashboard.compliance-desk.tsx` `ComplianceDeskWrapped` — keep route; reuse the reconciliation / approve / reject mutations and `SELECT_COLS`. The Records "needs review" + "pending approval" lists call into the same queries it already runs against `evv_timesheets` (`review_status`, `is_out_of_bounds`/`outside_geofence_reason`, `corrected_clock_in/out`, etc.).
- `src/components/scheduling/timesheets-reconcile.tsx` — kept as collapsible under Records → Pay-period (advisory), unchanged.
- `src/components/admin-hubs/hub-shell.tsx` — same shell, just 5 tabs.
- Incidents / Audit / HRC components — untouched.

## New (small, glue only)
- `src/components/records/records-tab.tsx` — the Records surface. Filter bar + NECTAR search + one results table. Routes per-row click to existing detail.
- `src/lib/records-review-rules.ts` — pure function `reviewExceptions(row)` returning `[{ code: "out_of_geofence" | "missing_note" | "no_clockout_stale", label }]`. Inputs only: existing columns (`is_out_of_bounds`, `outside_geofence_reason`, `shift_note_text`, `goals_completed`, `clock_out_timestamp`, `clock_in_timestamp`, service code → required-PCSP via existing config). Threshold for stale no-clockout: `clock_in_timestamp` older than 18h with `clock_out_timestamp = null`.
- Tiny badge component for the reason chips (reuses shadcn Badge).

## Filters (combinable, URL-backed via zod, default `status=needs_review`)
- **Type**: EVV-locked · Residential & Daily (HHS+RHS) · Internal/Non-EVV. Implemented by filtering on service codes via `isEvvLockedCode` + the HHS/RHS set.
- **Status**: Needs review · Pending approval · Approved · Billed. Derived exactly as today: needs_review = `reviewExceptions(row).length > 0`; pending = `review_status` in (`pending`, null) without exceptions; approved = `status='Approved'` no export record; billed = has `evv_export_records` row.
- **Service code** (multi), **Staff** (multi), **Client** (multi), **Date range** (+ month for residential grid).
- Selecting "Residential & Daily" swaps the table body for `<ResidentialDailyTab>` (program filter inside it preserved). Selecting "Billed/Approved" with EVV-only codes renders `<EvvArchivePage>` inline for that slice; otherwise the unified Records table.

## Exception queue (one concept, was two)
`reviewExceptions(row)` returns reasons; row is in "Needs review" iff non-empty:
1. **Out of geofence** — `is_out_of_bounds === true` AND `outside_geofence_reason` is null/empty (variance grace already applied upstream by the punch flow).
2. **Missing/short note or required PCSP goal not checked** — `validateNarrative(shift_note_text)` returns non-null, OR code requires a PCSP goal and `goals_completed` empty.
3. **No clock-out (stale)** — `clock_out_timestamp` null AND `now − clock_in_timestamp > 18h`.
Each row in the queue renders a Badge per reason ("Out of geofence", "Missing note", "No clock-out"). Clean rows skip the queue entirely (already approvable/billable).

## Export gate (compliance-critical)
Above the table, two buttons:
- **Export Utah DHHS EVV CSV** — visible/enabled iff every code in the currently-filtered result set passes `isEvvLockedCode`. Calls the existing `utah-export-dialog` / `buildUtahCsv`. Otherwise hidden with hint: *"DHHS EVV export is available only when the filter shows EVV-locked codes only."*
- **Export Master Agency Ledger CSV** — always available; exports the current filtered set via `downloadCsv` with human-readable columns (reused from existing archive CSV in `approved-evv-archive.tsx`).

Gate is computed from the actual filtered rows' service codes, not just the filter input — a mixed result hides the DHHS button.

## File changes
- **Edit** `src/routes/dashboard.hub.documentation.tsx` — tabs array down to 5: `records`, `incidents`, `forms`, `audit`, `hrc`. Update zod enum + `tab` search param. Remove top-level `review`, `evv`, `archive`, `host-home` entries. Mount `<RecordsTab />`.
- **New** `src/components/records/records-tab.tsx`.
- **New** `src/lib/records-review-rules.ts`.
- **Edit** `src/routes/dashboard.evv-archive.tsx` — keep route alive (deep links), no UI change.
- **No changes** to: compliance-desk route file internals (still routable standalone for legacy links), residential-daily-tab, approved-evv-archive component, utah-evv-export, evv-codes, billing libs, incidents/audit/hrc, RLS, RHS/HHS firewall.

## Acceptance — verified before reply
1. Documentation has exactly 5 tabs; old Review / EVV & timesheets / Approved EVV Archive / Host home are gone.
2. Records defaults to `status=needs_review`, NECTAR search sits above, all 6 filters combine, residential view appears when Type = Residential & Daily.
3. Needs-review rows show a reason badge; clean rows do not appear in the queue.
4. DHHS EVV CSV button hidden the moment a non-EVV code is in the filtered result; Master Ledger always reflects filter.
5. Incidents / Audit / HRC tabs render unchanged.
6. No new tables / migrations / RLS / server functions; all reads via existing queries on `evv_timesheets` + `evv_export_records` under existing org-scoped RLS.