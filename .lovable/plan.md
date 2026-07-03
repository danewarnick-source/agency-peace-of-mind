## Goal
Show each staff member's DSPD-required-training status directly on their roster pill, and gate the "HIVE Training" section on an org-level opt-in.

## 1. Entitlement: `hive_training` add-on

**File:** `src/lib/hive-tiers.ts`
- Add `"hive_training"` to `AddonId`
- Add catalog entry ("HIVE Training — DSPD-aligned courses, competency sign-off, verifiable certs")
- Include in Pro + Enterprise `addons` arrays (Starter = opt-out by default; HIVE Exec can toggle)

**No new hook needed** — call sites use `useEntitlements().hasAddon("hive_training")`.

### Gate the HIVE Training tab
- **Sidebar** (`src/components/site-header.tsx` or wherever the "HIVE Training" nav link lives — will grep): if `!hasAddon("hive_training")`, render with lock icon + tooltip "Enable HIVE Training on your plan" and route to `/dashboard/billing/subscription` instead of the hub.
- **Route guard** at top of `dashboard.hive-training.index.tsx` (and course player): if entitlement missing, render a small `<FeatureLocked feature="HIVE Training" />` card. Server functions that create assignments/orders already run through `assertAddonForOrg` — extend the same check to `hive_training`.

## 2. Per-staff training status on the roster

### Data model — no schema change
Reuse existing tables:
- `BASELINE_STAFF_TRAININGS` from `src/lib/staff-training-requirements.ts` = the canonical DSPD list (30-Day, CPR/First Aid, De-escalation, ABI, Annual 12h)
- `hive_training_assignments` (status, completed_at, expires_at, course_id)
- `hive_training_courses` — extend the existing seed to tag each course with a `baseline_key` mapping to `BASELINE_STAFF_TRAININGS.key`. Small migration: `ALTER TABLE hive_training_courses ADD COLUMN baseline_key text;` + backfill for the 4-5 courses we already ship. GRANTs already exist.

A staffer is "certified" for baseline X if there exists a `hive_training_assignments` row where `course.baseline_key = X` AND `status = 'completed'` AND (`expires_at IS NULL OR expires_at > now()`).

### New server fn
`src/lib/hive-training-roster.functions.ts` → `getRosterTrainingStatus({ organizationId })` (uses `requireSupabaseAuth`):
- Fetches org members (user_id, full_name, hire_date, applicability flags for behavior/ABI already computed by existing `getStaffChecklist` logic — reuse the helper)
- Fetches completed+active `hive_training_assignments` joined to `hive_training_courses` for those users
- Returns `Array<{ userId, fullName, trainings: Array<{ baselineKey, title, status: 'certified'|'missing', completedAt?, expiresAt?, courseId? }> }>`

### Roster pill UI
In `src/routes/dashboard.employees.index.tsx` — under each member row, render a compact "DSPD training strip":
```
[✓ 30-Day  Aug 2025 → Aug 2026]  [✓ CPR/First Aid ...]  [⊕ Assign: De-escalation]  ...
```
- Green check + completed/renewal dates when certified
- "Assign training" button when missing → opens existing assignment dialog (reuse `assignCourse` mutation from hive-training page, keyed to the mapped course). Button disabled with lock tooltip if org lacks `hive_training` add-on.
- Only rows that pass applicability (behavior/ABI conditionals) are shown for a given staffer.

Add a small `<StaffTrainingStrip staffer={...} />` component in `src/components/training/staff-training-strip.tsx` to keep the roster file lean.

## 3. Out of scope
- No changes to billing/checkout flows.
- No new tables beyond the one `baseline_key` column.
- External certifications (uploaded outside HIVE Training) remain visible via existing `certifications` UI; this strip is HIVE Training-only per your description.

## Files to create/edit
- edit `src/lib/hive-tiers.ts` (add addon)
- edit sidebar nav (find + gate HIVE Training link)
- edit `src/routes/dashboard.hive-training.index.tsx` (route-level lock)
- new migration: `hive_training_courses.baseline_key` + backfill
- new `src/lib/hive-training-roster.functions.ts`
- new `src/components/training/staff-training-strip.tsx`
- edit `src/routes/dashboard.employees.index.tsx` (render strip per member)