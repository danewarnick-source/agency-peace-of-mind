## What's wrong now

The admin only sees the bell badge update — no popup. The toast logic exists in `NotificationBell.tsx`, but it only fires inside the realtime `INSERT` callback. If the realtime event is missed (tab was backgrounded, connection blip, page just loaded, navigated between routes, etc.), the 30-second poll still refreshes the bell count — but nothing toasts. That matches exactly what you're seeing: number on the bell, no popup.

The notifications are correct in the DB (`type: open_shift_warning`, `urgency: urgent`, with a clear title like "Dane declined Maple House · Overnight 11:00 PM – 7:00 AM"), so the data side is fine. The gap is purely "live event missed → no toast".

## Fix (one file)

Edit only `src/components/NotificationBell.tsx`. Reuse the existing sonner toast and existing notification data — no new system, no schema changes, no new screens.

Add a small "toast on first sight" effect alongside the existing realtime listener:

- Keep a `useRef<Set<string>>` of notification IDs we've already toasted in this session (persist the set in `sessionStorage` keyed by org id so route changes / remounts don't re-toast the same row, but a fresh login does surface anything still unread).
- Whenever the `notifications` query data changes, iterate the list and for each row where:
  - `type === "open_shift_warning"` AND
  - `urgency === "urgent" || "critical"` AND
  - `read_at === null` AND `dismissed_at === null` AND
  - id is not already in the seen-set
  
  …call the same `toast(n.title, { description, action: Open → n.link_to })` already used today, then add the id to the seen-set.
- Keep the existing realtime `INSERT` handler, but route it through the same "toast if not yet seen" helper so live events and polled/initial-load events use one code path and can't double-toast.
- Leave the bell entry untouched — toast is purely additive; dismissing the toast doesn't mark read or dismiss the row.

This guarantees: live insert → instant toast (as today); missed live insert → toast appears on next poll/refetch (within 30s) or on next page load; already-seen-in-this-session rows never re-toast.

## Out of scope

- No changes to the bell UI, the notification table, RLS, the publication, or the decline flow.
- Routine (non-urgent, non-coverage-risk) notifications still don't toast.
- No auto-reassign, no new roles, no new notification types.

## Acceptance

- As Tom or Dane, declining a published Maple House shift makes a sonner toast pop in the admin's top-right automatically — naming the shift, with an "Open" action.
- If the admin was offline / on another tab when the decline happened, opening the app (or just waiting up to 30s) still pops the toast for that unread urgent decline once.
- The same notification still sits in the bell and persists until the shift is re-covered. Dismissing the toast does not clear the bell entry.
- The same urgent decline does not re-toast on every navigation in the same session.
- Routine notifications still don't toast.
