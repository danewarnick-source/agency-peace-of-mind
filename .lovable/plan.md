## Goal

Support the "same person is both a Host and a DSP" case (Harvey), without collapsing the two data models. Hosts stay in `hhp_cue_cards` (never clock, never scheduled). Staff stay in `organization_members` + `profiles` (invited, roster, EVV, caseload). A new nullable link column ties the two rows together when they refer to the same real person.

## Data model

Add one nullable column to `hhp_cue_cards`:

```
linked_staff_user_id  uuid  references auth.users(id) on delete set null
```

Plus a partial unique index so a given staff user can't be linked to two host cards inside the same org:

```
unique (organization_id, linked_staff_user_id) where linked_staff_user_id is not null
```

RLS is unchanged — the existing `hhp_write` policy already gates edits.

## Server function

Extend `updateHhpCueCard` in `src/lib/hhp-cue-cards.functions.ts` to accept `linked_staff_user_id: string | null`. When set, verify the target user is an active member of the same organization before writing (guards against cross-org linkage). Include the column in `CARD_COLS` and the `HhpCueCard` type.

## UI — Hosts tab

In `src/components/hosts/hosts-page.tsx`, on the host edit dialog add a **"Also a staff member"** section:

- Combobox listing active `organization_members` in the org (reuses existing `useOrgMembers` / equivalent hook — will pick whichever the Caseload picker already uses).
- Two helper buttons beside it:
  - **Invite as staff** → opens the existing staff-invite dialog prefilled with the host's name + email; on success, auto-links the new user to this card.
  - **Unlink** → clears the field.
- Below the combobox, a small info line: *"Harvey will appear on the staff Roster and in client Caseload pickers. Their Host record stays separate — hosts still never appear on the schedule."*

On the host card in the list view, add a subtle **"Also DSP"** badge when `linked_staff_user_id` is set, so it's obvious at a glance which hosts are also employees.

## UI — Caseload picker (client Care tab)

No structural change. Once Harvey exists as a staff row (via the invite above), he shows up in Blake's Caseload picker automatically. Add a one-line footnote to the Caseload help text: *"Hosts only appear here if they're also invited as staff."* — so the earlier surprise doesn't repeat.

## What this does NOT do

- Does not merge hosts and staff into one table.
- Does not auto-create a staff account when you create a host — the provider has to click **Invite as staff** (staff invites require email, role, employment terms; silently minting them would break HR/compliance).
- Does not change scheduling, EVV, or billing logic. The staff-side Harvey clocks shifts; the host-side Harvey still produces daily notes + overnight confirmations. They just share a real-world identity via `linked_staff_user_id`.

## Migration summary

- Adds `linked_staff_user_id` (nullable) to Host Home Provider cue cards, so a host can be marked as also being an employee.
- Adds a uniqueness rule so one staff member can only be linked to one host card per organization.
