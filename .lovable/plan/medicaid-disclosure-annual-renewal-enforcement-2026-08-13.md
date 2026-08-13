# Medicaid Disclosure — annual renewal enforcement

## What I found

- The Medicaid Disclosure item on the staff profile is not a hard-coded baseline training (like Background Screening is). It is a requirement row in the HR staff checklist: "Complete Medicaid Disclosure training within 30 days of hire", currently marked active and provider-confirmed, with metadata `{ phase, scope, short_label }` and **no renewal fields**.
- The checklist, staff profile HR tab, and HR compliance matrix already know how to expire an item: when a requirement's metadata contains `is_renewable: true` and `renewal_interval_months`, they compute the effective expiration as completion date + interval and render the renewal date / expired state. No requirement in the database uses these fields yet.
- The Deadlines panel does **not** read HR checklist expirations at all today — it reads certifications, incidents, summaries, billing codes, host-home certs and Nectar requirement instances. So a lapsed checklist item would never turn red there without a new source.
- There are two extra near-duplicate Medicaid Disclosure rows (from document parsing); one is already marked removed and neither is in the staff-checklist scope, so neither shows on profiles.

## What to build

1. **Make the requirement annually renewable (data change)**
   Add `is_renewable: true`, `renewal_interval_months: 12`, and a renewal source citation (State SOW §1.13(5) — "at hire and annually") to the metadata of the active Medicaid Disclosure staff-checklist requirement. This immediately makes the staff HR tab and the HR compliance matrix show a 12-month renewal date once the document is uploaded/marked complete, matching Background Screening's behavior.

2. **Stamp the expiration on completion**
   In the checklist completion save path, when the requirement is renewable and no explicit expiration was provided, store `expires_at = completed_date + renewal_interval_months` instead of leaving it null. The date is then durable rather than only derived at read time, so exports and any future reader see the same 12-month date.

3. **Surface lapses in the Deadlines panel**
   Add a new deadlines source for renewable HR checklist items: for each staff completion of a renewable requirement whose effective expiration is within 30 days or already past, emit a deadline entry (subject = staff member, link to their employee profile) that buckets to "due soon" / "overdue" like every other item. Medicaid Disclosure will be the first item to use it, and any future annually renewing checklist requirement gets it for free.

4. **Prompt re-upload when overdue**
   On the staff HR checklist card, an item whose effective expiration has passed renders as expired with a re-upload call to action, the same treatment an overdue background screening gets.

## Technical notes

- Metadata change goes through a database migration updating `nectar_requirements.metadata` for the Medicaid Disclosure row scoped to the HR staff checklist (`metadata->>'scope' = 'hr_staff_checklist'`); no schema change.
- Expiration stamping lands in `upsertChecklistCompletion` in `src/lib/hr-staff.functions.ts` (look up the requirement's metadata, compute the date server-side).
- New deadlines source: a server function in `src/lib/hr-staff.functions.ts` returning renewable-checklist expirations for the current org, consumed by `src/hooks/use-deadlines.tsx` with a new `staff_checklist` source and a label/icon in `src/routes/dashboard.deadlines.tsx`.
- Expired styling / re-upload CTA in `src/components/hr/staff-hr-checklist-card.tsx`.
- No changes to the baseline training list, since this requirement lives in the Nectar requirement checklist rather than `staff-training-requirements.ts`.

## Verification

Upload a Medicaid Disclosure for a staff member: the HR tab shows an expiration 12 months out, the compliance matrix cell shows the renewal date with a "12 mo" interval badge, and back-dating a completion past 12 months makes the item show expired and appear as overdue in the Deadlines panel.
