
## Goal

The staff **About** tab should show live admin data for **Behavioral Trigger Flags**, **Emergency Contacts**, and **Interests & Hobbies** — read-only. And remove the section-visibility toggles on the admin client page, since they aren't reliably working and are gating this information unnecessarily.

## Data sources (already exist on admin side)

- **Behavioral triggers** → `client_target_behaviors` (edited on admin's Care Plan → Target Behaviors tab, via `TargetBehaviorsPanel`).
- **Emergency contacts** → `client_emergency_contacts` (edited on admin's Identity tab).
- **Interests & hobbies** → `clients.preferred_activities` (string[]; populated via intake/import).

## Changes

### 1. `src/lib/client-care-data.functions.ts`
Extend the shared care-data server fn (the single canonical read path used by the About tab) so it also returns:

- `target_behaviors: { id, behavior_name, description }[]`
- `emergency_contacts: { id, name, phone, relationship }[]`
- `preferred_activities: string[]`

Add three parallel selects to the existing `Promise.all`, and mirror the results into `visibility.staffCare` unfiltered (these three lists always mirror admin — no per-item visibility gating).

### 2. `src/components/workspace/about-tab.tsx`
Replace the three static placeholder cards with real data from `staffCare`:

- **Behavioral Trigger Flags** — list each `behavior_name` with `description` beneath. Empty state: "No documented triggers on file."
- **Emergency Contacts** — list `name` · `relationship` · `phone` (phone as `tel:` link on mobile). Empty state: existing copy.
- **Interests & Hobbies** — render each entry in `preferred_activities` as a `Badge`. Empty state: "No interests recorded yet."

All read-only — no edit affordances.

### 3. `src/routes/dashboard.clients.$clientId.tsx`
Remove the six `<SectionVisibilityToggle>` mounts (identity, care_plan, billing, files, operations, compliance) and drop the import. Per-field eye toggles (`FieldVisibilityToggle`) on individual goals/meds/codes stay — those are working.

Server-side, `getClientCareData` continues to honor per-field toggles; only the section-level gate goes away. About-tab surfaces (triggers/contacts/interests/PCSP goals) are always visible to staff.

## Technical notes

- No migration needed — all three tables/columns already exist.
- `client_emergency_contacts` and `client_target_behaviors` are org-scoped with existing RLS; the shared care-data fn already runs under `requireSupabaseAuth`, so staff reads pass.
- `client_care_data` query key is unchanged, so the workspace About tab picks up the new fields on the next fetch with no invalidation plumbing.

## Out of scope

- Editing triggers/contacts/interests from the staff portal (intentional — admin-only).
- Removing per-field eye toggles on goals/meds/codes.
- Changing where admins edit interests today (still whatever intake/import flow populates `preferred_activities`).
