## Phase 4 — Recurring Shifts, Auto-Assign, Reconciliation, Mobile Polish

Four batches, each shippable on its own. Say "next" between batches.

### Batch A — Recurring shifts & rotations
Pattern-based generation, so admins stop hand-building identical weeks.
- Reuse existing `shift_templates` for single-shift recurrences; add new `recurring_shift_patterns` table (org, client, service_code, staff_id nullable for open, weekday_mask, start_time_local, end_time_local, effective_from, effective_until, rotation_group_id nullable, active).
- Optional `staff_rotation_groups` (+ `members`) — round-robin assignment across a pool.
- Server fns `recurring.functions.ts`: `listPatterns`, `upsertPattern`, `togglePattern`, `materializeWeek({weekStartIso})` (idempotent — skips dates that already have a shift matching the pattern key).
- UI: "Recurring patterns" dialog from Scheduler toolbar; "Materialize week" button (creates drafts); patterns auto-run on `copyPreviousWeek` + new weeks.

### Batch B — Auto-assign engine
Fill open shifts in one click using eligibility + fairness.
- Pure scorer `src/lib/scheduling/auto-assign.ts`: eligible staff (cert current, no overlap, not on PTO, client training, age rule, location radius) → score by (a) hours-balance vs target, (b) recent rotation fairness, (c) staff preference flags, (d) historical client pairing.
- Server fn `autoAssignRange({startIso,endIso,dryRun})` returns proposed assignments + reasons. On apply: writes `staff_id`, status=`draft`, `created_from='rotation'`.
- UI: "Auto-assign open shifts" button in toolbar → preview drawer (per-shift candidate, score, reason) → Apply (all or selected).
- Respects existing HARD/POLICY rules; never auto-assigns when a HARD conflict would be created.

### Batch C — Payroll & timesheet reconciliation
Compare scheduled vs EVV-clocked hours and export.
- Server fn `reconcileRange({startIso,endIso,locationId?})`: joins `scheduled_shifts` × `evv_timesheets` by staff+client+overlapping window; classifies each row as `match`, `clocked_short`, `clocked_over`, `missing_clock`, `no_schedule`; computes scheduled/actual minutes + variance.
- `Reconciliation` page at `/dashboard/scheduler/reconcile`: filters (week, location, staff), totals by category, per-staff drilldown.
- Export: CSV download via server fn returning data → client `Blob` (no edge function). Includes pay category from `time_pay_settings`.
- "Mark resolved" writes a note (`scheduled_shifts.notes` append) — no schema change.

### Batch D — Mobile staff polish & push notifications
Make `/dashboard/schedule` and notifications feel native.
- Schedule agenda: pull-to-refresh, sticky day headers, swipe-left = decline / swipe-right = accept on pending cards; haptic-style toast confirmations.
- Realtime: enable Realtime on `scheduled_shifts` and `notifications`; subscribe in agenda + bell badge so publishes, swaps, claims, and PTO decisions appear without reload (scoped by `staff_id=auth.uid()` via RLS).
- Push: web-push via Lovable Cloud — new table `push_subscriptions(user_id, endpoint, p256dh, auth)`; service-worker `public/sw.js`; server fn `sendPushToUser` called from existing notification inserts (shift publish, swap approved, PTO decided, claim approved). VAPID keys via `secrets--add_secret`.
- Offline-friendly accept/decline: queue requests in `localStorage` when offline; replay when back online.

### Files (high level)
**New**: `src/lib/scheduling/recurring.functions.ts`, `src/lib/scheduling/auto-assign.ts`, `src/lib/scheduling/auto-assign.functions.ts`, `src/lib/scheduling/reconcile.functions.ts`, `src/components/scheduling/recurring-patterns-dialog.tsx`, `src/components/scheduling/auto-assign-drawer.tsx`, `src/routes/dashboard.scheduler.reconcile.tsx`, `src/lib/push.functions.ts`, `public/sw.js`
**Edited**: `src/lib/scheduling/conflicts.ts` (no change; reused), `src/routes/dashboard.schedule-preview.tsx` (toolbar buttons), `src/routes/dashboard.schedule.tsx` (swipe/realtime/offline queue), `src/components/notifications/*` (realtime + push prompt)
**Migrations**: `recurring_shift_patterns`, optional `staff_rotation_groups[_members]`, `push_subscriptions`; enable Realtime on `scheduled_shifts` + `notifications`.

Order of execution: A → B → C → D. Batch A is the foundation Batch B builds on (rotation groups feed scorer). Batch C and D are independent and could swap.

Approve and I'll start Batch A.