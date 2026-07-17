
## Goal

Make the staff **About** tab a read-only mirror of the admin **Client → Profile** tab. Same fields, same grouping, same values (e.g. Justin's Support Coordinator will now show). Drop the duplicated Face Sheet card that repeats the same data in a different shape.

## What admin Profile shows today (source of truth)

From `ClientProfileTab`:

- **Identity & contact**
  - Person: Name, Medicaid ID, Guardian (self-guardian or name + phone), DOB + age, Phone
  - Support Coordinator: Name, Phone, Email
  - Enrollment: Admitted, Discharge date
  - Flags: ABI, Human Rights applicable, DNR order
- **Contacts** — emergency contacts (name / relationship / phone)
- **At a glance** — Primary diagnosis, Primary care, PCSP expiration, Admitted
- **Clinical Alert** banner — `special_directions` (when present)

Plus the record-completeness bar and archive footer, which are admin-only actions and stay off the staff view.

## Changes

### 1. `src/lib/client-care-data.functions.ts`
Add the extra client columns to the existing `clients` select and expose them on `CareIdentity`:

- `phone_number`
- `is_own_guardian`, `guardian_name`, `guardian_phone`
- `support_coordinator_name`, `support_coordinator_phone`, `support_coordinator_email`
- `has_abi`, `hr_applicable`, `dnr_applicable`
- `diagnoses` (string[]), `primary_care_name`
- `pcsp_expiration_date`
- `special_directions`

`identity` (admin view) gets the raw values; `visibility.staffCare.identity` mirrors them 1:1 (no gating — user's directive from the last turn).

### 2. `src/components/workspace/about-tab.tsx`
Rebuild the tab to match admin Profile grouping, read-only:

- **Clinical Alert banner** at top when `special_directions` is set (amber card, no edit).
- **Identity & contact** card with the four admin groups (Person / Support Coordinator / Enrollment / Flags), using the same `Row`-style label/value shape.
- **Emergency Contacts** card — keep current live-data card (already correct).
- **At a glance** card — Primary diagnosis, Primary care, PCSP expiration (with the same amber "expiring soon" treatment), Admitted.
- **Person-Centered Support Plan** goals — keep as-is.
- **Behavioral Trigger Flags** — keep as-is.
- **Interests & Hobbies** — keep as-is.
- **Remove** `<FaceSheetInfoCard />` from About (it renders the same identity/contact/coordinator data admins already see above; the printable face sheet stays available elsewhere).
- Keep `<ClientPhotoCard />`.

No edit affordances anywhere on this tab; no admin-only controls (record-completeness bar, archive footer, edit pencils).

### 3. Copy small helpers into the staff view
`fmtDate`, `age`, and the amber "PCSP expiring within 30 days" check are trivial — inline them in `about-tab.tsx` so the file stays self-contained.

## Out of scope

- Editing anything from the staff portal.
- Changing the admin Profile tab.
- Record-completeness bar, archive/retention footer, or "Continue intake" flow on staff side.
- Redesign of PCSP goals / behavioral triggers / interests sections (unchanged from the last turn).
