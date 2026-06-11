# Phase 2 — Conflict Engine, Publish/Accept, Settings Rework

Phase 1 is complete. Phase 2 ships in three batches; each typechecks independently and lands sequentially because all three touch `dashboard.schedule-preview.tsx` and the create dialog.

## Batch A — Conflict engine

- New `src/lib/scheduling/conflicts.ts`: pure `evaluateShifts(shifts, rules, context)` returning `{shiftId, severity: 'hard'|'policy'|'warn', code, message}[]`.
- HARD rules: same-staff overlap (excluding parent/segment pairing), same client+service-code double-book, staff inactive, segment outside parent, daily code on segment.
- POLICY rules (Off/Warn/Block via `rule_settings` JSON): expired cert, missing client-specific training, staff <21 on HHS, 2:1 ratio (second staff same client+time), >16h continuous, <8h rest, projected week >threshold, DSI >6h, SLH/SLN overnight without `is_awake_overnight`.
- WARN rule: client weekly target ≥120% met.
- Migration: add `rule_settings jsonb DEFAULT '{}'` and `ot_threshold_hours numeric DEFAULT 40` to `org_shift_behavior_settings`.
- New server fn `evaluateRange` (returns conflicts for range) and `getRuleSettings`/`updateRuleSettings`.
- UI: add `ConflictBadge` on `ShiftCard` (red dot HARD, amber POLICY-Block, amber shield POLICY-Warn). Toolbar "Conflicts (N)" button → popover list, deep-link to shift. Inline section in `ShiftCreateDialog` before Save; block-severity disables Save unless admin types an override reason → stored on `scheduled_shifts.override_reason`.

## Batch B — Publish / Accept workflow

- `ShiftCreateDialog`: default `status='draft'`. Board card actions: Publish single + toolbar "Publish All Drafts" → summary modal "Publishing X shifts across Y staff · Z conflicts remain" → confirm calls `publishShifts`.
- New `src/lib/scheduling/notifications.functions.ts` writing to existing `notifications` table (one per staff per publish).
- `dashboard.schedule.tsx` (staff view): mobile-first agenda — Today section + week list; published cards show client/code/time/location + Accept / Decline (decline requires reason). New `respondToShift` server fn sets `accepted`/`declined` + stores decline reason in `notes`.
- New "Action needed" card on board (replaces "Needs your approval"): lists declines + swap requests + open-shift claims; clicking deep-links to shift.

## Batch C — Settings drawer rework

- New route `src/routes/dashboard.scheduling.settings.tsx` (drawer/page from Board's Settings button).
- "Color shifts by" → defaults to **Service code** (option: Staff).
- Rename "Your shift types" → "Shift time templates"; ensure only time/name/color (already mostly correct from Phase 1 seed).
- "Scheduling rules" list: every POLICY rule rendered as a row with Off/Warn/Block segmented control + plain-English description; OT threshold numeric input. Persists via `updateRuleSettings`.
- Reachable from Board toolbar + a "Coverage requirements" link (re-uses Phase 1 `CoverageRequirementsDialog`) and "Weekly targets" link.

## Files

**New**: `src/lib/scheduling/conflicts.ts`, `src/lib/scheduling/conflicts.functions.ts`, `src/lib/scheduling/notifications.functions.ts`, `src/components/scheduling/conflicts-panel.tsx`, `src/components/scheduling/publish-modal.tsx`, `src/components/scheduling/action-needed-card.tsx`, `src/routes/dashboard.scheduling.settings.tsx`.

**Edited**: `src/lib/scheduling/shifts.functions.ts` (respondToShift), `src/components/scheduling/shift-create-dialog.tsx`, `src/components/scheduling/shift-card.tsx`, `src/routes/dashboard.schedule-preview.tsx`, `src/routes/dashboard.schedule.tsx`.

**Migration**: rule_settings jsonb + ot_threshold_hours on `org_shift_behavior_settings`.

Starting Batch A now.
