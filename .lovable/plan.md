# Humanize NECTAR "Edit shift" rows

Today, when NECTAR proposes an `edit` to an existing shift, the draft row shows `Edit shift fccb4c70` — the raw shift ID — and the patch as `start → Wed Jun 10, 3:00 PM`. The other two action types (`create`, `reassign`) already show staff and client names. We'll bring `edit` up to the same standard.

## UX

The draft row for an edit will read:

- **Title**: `Edit: Dane → Brandon Johnson · Thu Jun 11` (staff → client · current day)
- **Diff line**: only the fields actually changing, before → after, e.g.
  - `Start: Thu 3:00 PM → Wed 3:00 PM`
  - `End: Thu 7:00 PM → Wed 7:00 PM`
  - `Code: SLN → DSI`

No more raw `fccb4c70` ID.

## Technical

- **`src/lib/nectar-schedule-actions.functions.ts`**
  - Extend the `edit` variant of `ProposedAction` with `client_name`, `staff_name`, and `current: { starts_at: string; ends_at: string; job_code: string | null }`.
  - In `validateAndResolve`, when building an `edit` action, look up the shift in `shiftById`, then resolve `client_name` via `clientById` and `staff_name` via `staffById` (both already constructed at the top of the function). Populate `current` from the shift row.

- **`src/components/schedule-preview/nectar-command-bar.tsx`** (`ActionRow`)
  - Replace the `Edit shift {a.shift_id.slice(0, 8)}` title with `Edit: {a.staff_name} → {a.client_name} · {fmtWhen(a.current.starts_at)}` (date portion only).
  - For the diff, render each changed field on its own line as `Start: <old> → <new>`, `End: <old> → <new>`, `Code: <old> → <new>`, using `fmtWhen` for times. Omit fields that aren't in the patch.

No DB changes, no migration, no new server functions.

## Out of scope

- Showing the diff inline on the schedule grid before approval.
- Same treatment for the `reassign` op's missing time/client context — already readable today.
