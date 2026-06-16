
## Goal

Make the scheduler's code sections fully driven by real client authorizations, and give admins two ways to repeat a schedule: replay an existing day/week/month, and set up recurring shifts when creating a new one.

## 1. Dynamic code sections (drop hard-coded list)

Today `SECTIONS` in `src/routes/dashboard.scheduler.tsx` is a fixed 8-code list (SLH, COM, PAC, RP2, HHS, RHS, PM1, DSI). Codes outside that list never render, and codes inside it render even when no client is authorized.

Change to:

- Derive the visible code list from `data.auths` (the org's open `client_billing_codes` already loaded by `useSchedulerData`): unique `service_code` values that have ≥ 1 authorized client today.
- Exclude day-program-only codes (DSG, DSP) — they belong on the Day Program tab, not the Schedule tab.
- Order: preserve the canonical ordering for known codes (current SECTIONS order), then append any other authorized code alphabetically.
- Label resolution: use `evvServiceLabel(code)` from `src/lib/evv-codes.ts` so new codes (PM1, future codes) get a real name automatically. Keep a small override map only for the friendlier names already used ("Supported Living", "Host Home — administrative hours", etc.).
- Color: route unknown codes through a stable fallback in `codeColor()` (hash → palette) so new sections render in the same visual format as the others.
- Empty state for an authorized-but-currently-clientless code (edge case after a removal): hide instead of showing "No clients authorized…" — the new rule is "show only what real clients have."

Result: adding PM1 to a client's billing codes makes the PM1 section appear automatically with that client listed; removing the last PM1 client makes the section disappear.

## 2. "Repeat shifts" button (replay existing schedule)

Add a button next to "Auto-fill open shifts" in `NectarBar` labeled **Repeat shifts**.

Flow (single dialog):

1. Source range — admin picks Day / Week / Month, then a specific date (defaults to current `anchor`). We show a count of real `scheduled_shifts` in that range so they know what they're about to copy.
2. Target — Repeat for: N days / N weeks / N months, OR pick specific target dates from a small calendar.
3. Options: keep staff assignments vs. create as open shifts; skip dates that already have shifts; copy notes/awake-overnight flag.
4. Preview list (client · code · staff · time · target date) with per-row include checkbox.
5. Apply → creates draft `scheduled_shifts` rows via the existing `applyDrafts` server fn (or a new `repeatShifts` server fn that wraps the same insert path). Toast with count; invalidate `scheduler-data`.

Backend: new `src/lib/scheduler/repeat.functions.ts` with two server fns, both `requireSupabaseAuth` + admin/manager check:
- `previewRepeat({ organizationId, sourceStartIso, sourceEndIso, targetDates[] })` → returns the candidate shift rows (no writes).
- `applyRepeat({ ...same, keepStaff, skipIfExists })` → inserts. Reuses the existing conflict checks already used by `saveShift` so we don't double-book.

No schema changes — uses existing `scheduled_shifts`.

## 3. Recurrence option inside Add Shift dialog

In the existing `AddShiftDialog` add a "Repeat this shift" section:

- Toggle off by default (current behavior unchanged).
- Frequency: Daily / Weekly / Monthly.
- Weekly: multi-select days of the week (Sun–Sat checkboxes).
- Monthly: "on day N of month" or "same weekday of month."
- End: "after N occurrences" or "until date" (cap at 26 weeks to keep inserts bounded).
- Time stays whatever the admin entered in the main form; recurrence only varies the date.

On save, the existing `saveShift` mutation runs once for the seed shift, then a new `createRecurringShifts` server fn (same file as above) expands the rule into individual `scheduled_shifts` rows (one insert per occurrence) with the same client/code/staff/time/awake/notes. We persist the rule too, in a new lightweight column on the seed row so admins can later "edit series."

### Schema (one small migration)

Add to `scheduled_shifts`:
- `recurrence_rule jsonb null` — `{ freq, days?, dayOfMonth?, endsAfter?, endsOn? }` on the seed shift only.
- `recurrence_parent_id uuid null` — points generated children at the seed; index it.

Self-referencing FK, no new table, RLS already covers it (same org policies). Grants already in place for `scheduled_shifts`.

## Files touched

- `src/routes/dashboard.scheduler.tsx` — dynamic SECTIONS derivation; label/color fallbacks.
- `src/components/scheduler/nectar-bar.tsx` — add "Repeat shifts" button + dialog mount.
- `src/components/scheduler/repeat-shifts-dialog.tsx` *(new)* — source/target picker + preview.
- `src/routes/dashboard.scheduler.tsx` (AddShiftDialog block) — recurrence section.
- `src/lib/scheduler/repeat.functions.ts` *(new)* — `previewRepeat`, `applyRepeat`, `createRecurringShifts`.
- `supabase/migrations/<new>.sql` — add `recurrence_rule`, `recurrence_parent_id` to `scheduled_shifts`.

## Out of scope (per your "don't change other parts" rule)

- No layout/visual changes to existing sections; new sections render in the same card format.
- No changes to Day Program tab, Staff view, billing math, or unit calculations.
- No edits to caseload editor, Nectar drafting, or take-shift flow.
