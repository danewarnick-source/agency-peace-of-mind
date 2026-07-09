# Auto-enable self-administration support when a client has any medication on file

## What changes

Right now `public.clients.self_admin_med_support` is a plain boolean with `DEFAULT false`. The Clinical Safety toggle in the eMAR chart is the only thing that flips it, so a client with meds on file but the toggle still off gets blocked out of the eMAR until an admin remembers to open the safety profile and turn it on.

The rule the user wants: **the first time a client has any medication on file, self-admin support turns ON automatically, no matter which entry path added the medication (Smart Import commit, manual add on the profile, any future importer). Admins can still turn it OFF for a specific client, and the rule must not fight that decision by flipping it back on the next time a med row is written.**

## Approach

Do it at the database layer with a trigger on `client_medications`. That is the only surface every entry path funnels into — smart import commit, manual add, and any future import all `INSERT` rows here — so one trigger covers all of them and stays correct even if we add another importer later.

To respect an admin's explicit "off," add a lock column that records whether an admin has taken over the decision. The trigger only auto-enables when the lock is clear. The toggle UI sets the lock the moment a human touches it.

### 1. Schema (single migration)

- Add `public.clients.self_admin_med_support_locked boolean NOT NULL DEFAULT false`.
  - `false` (the default) means "the auto rule owns this flag."
  - `true` means "an admin has explicitly set this — leave it alone."
- Add trigger function `public.autoenable_self_admin_on_med()`:
  - Fires `AFTER INSERT` on `public.client_medications`.
  - When the new row's client currently has `self_admin_med_support = false` AND `self_admin_med_support_locked = false`, update that client row to `self_admin_med_support = true`. Never touches the flag when the lock is on. Never turns it back off.
  - `SECURITY DEFINER`, `SET search_path = public`, owned by the migration role so it can update `clients` regardless of the writer's RLS scope (Smart Import commits and manual inserts already run as authenticated org members).
- Same migration includes the retroactive backfill:
  ```sql
  UPDATE public.clients c
     SET self_admin_med_support = true
   WHERE c.self_admin_med_support = false
     AND c.self_admin_med_support_locked = false
     AND EXISTS (SELECT 1 FROM public.client_medications m WHERE m.client_id = c.id);
  ```
  This catches the ~5 clients today that already have meds but the toggle off.

### 2. UI: mark the lock when an admin sets the toggle

Only file touched: `src/components/workspace/emar-chart.tsx` (`ClientSafetyEditor` save mutation, ~line 194-210). Extend the `clients.update({...})` call to also write `self_admin_med_support_locked: true`. That means any admin save — whether flipping ON or OFF — takes ownership of the flag going forward, so the trigger stops auto-managing that client. This matches the user's stated case ("an admin should still be able to turn it off for a specific client") without the auto rule ever undoing the admin's choice.

No other component reads or writes `self_admin_med_support_locked`. It is invisible to staff and admins; it is internal bookkeeping for the trigger.

### 3. Types

`src/integrations/supabase/types.ts` is auto-regenerated after the migration is approved, so the new column shows up there automatically for the UI edit.

## What is deliberately NOT changing

- No new UI element, no new admin screen. The existing "Admin — edit clinical safety profile" editor is the same control it is today; only its save payload grows by one field.
- No changes to Smart Import, the manual "add medication" form, or any other insert path — the trigger is what unifies them.
- No changes to how the flag is *read* anywhere (mar-emar-tab gate, emar-chart eligibility, etc.).
- No mass update to `self_admin_med_support_locked` for existing rows — everyone starts at "auto rule owns this," and the backfill lifts existing med-holding clients into the ON state in the same migration.
- No changes to `client_medications` schema or RLS.

## Edge cases considered

- **Deleting/discontinuing the last med** does not turn the flag back off. The user asked for "on when meds are present," not "off when they aren't"; and turning it off silently would break access to historical eMAR data. If a client legitimately no longer self-administers, an admin uses the existing toggle (which now also sets the lock).
- **Smart Import commits multiple meds at once**: the trigger runs per row, but the update is idempotent — once the client is ON, subsequent rows in the same commit are no-ops.
- **Trigger + admin race**: if an admin turns the toggle OFF at the same moment a new med row is inserted, whichever transaction commits last wins. That is acceptable — a human touching the toggle sets the lock, so any later med inserts will not flip it back on.

## Order of operations

1. Ship the migration (adds column, adds trigger, runs the backfill in one call).
2. After the migration is approved and the types file regenerates, update `emar-chart.tsx` to include `self_admin_med_support_locked: true` in the safety-profile save.
