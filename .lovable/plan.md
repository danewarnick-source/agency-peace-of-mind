## Why the toast didn't appear

The toast wiring is already in place in `NotificationBell.tsx` — it listens on a Supabase realtime channel for `INSERT`s into `public.notifications` and pops a sonner toast for urgent coverage-risk rows (`type = 'open_shift_warning'`).

The reason nothing shows up: the `notifications` table is **not** part of the `supabase_realtime` publication, so Postgres never broadcasts the insert. The bell still gets new rows on its 30-second poll, which is why the bell entry appears but no toast does.

Verified directly against the database:

```text
SELECT tablename FROM pg_publication_tables
 WHERE pubname='supabase_realtime' AND tablename='notifications';
-> 0 rows
```

## The fix (one migration, nothing else)

Add `public.notifications` to the realtime publication so INSERTs are broadcast to the channel the bell is already subscribed to.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

No app code, no new components, no new notification system, no changes to what's already in the bell. RLS on `notifications` already scopes rows to the right org/recipient, so realtime delivery inherits the same access rules.

## Acceptance after the change

- Staff decline → admin sees the sonner toast pop in automatically (no bell click), with the shift name and an "Open" action that jumps to the shift.
- Same notification still sits in the bell and persists until the shift is re-covered; dismissing the toast doesn't clear it.
- Routine notifications still don't toast (the toast filter is `type === 'open_shift_warning'` + urgency `urgent`/`critical`).
- Advisory only; no auto-reassign; no new roles.
