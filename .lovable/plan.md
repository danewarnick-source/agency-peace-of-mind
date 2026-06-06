
# Staff-type applicability (N/A from SOW)

Two-part build. Part 1 ships now and **pauses for your confirmation**. Part 2 only runs after you approve the proposed mapping — because a wrong applicability mapping hides real requirements (false N/A) which is worse than a false gap.

## Part 1 — NECTAR proposes (then PAUSE)

### Schema (one migration)
- `staff_types` (per org): `id`, `organization_id`, `key` (slug, e.g. `direct_support`, `host_home`), `label`, `description`, `source_basis` (citation text), `proposed_by` (`'nectar'|'admin'`), `confirmed_at`, `confirmed_by`, timestamps. Unique `(organization_id, key)`. RLS: org members read; admin/manager write.
- `nectar_requirements.metadata` extended with:
  - `applies_to_staff_types`: `string[]` of staff_type keys, OR `"all"` sentinel.
  - `applies_to_proposed_at`, `applies_to_proposed_by`, `applies_to_confirmed_at`, `applies_to_confirmed_by`, `applies_to_source_basis`, `applies_to_ambiguous` (bool).
- `profiles` (or `organization_members`) gets a per-org `staff_type_keys` array — added in Part 2, NOT Part 1.
- GRANTs + RLS on new table.

### Server fns (`src/lib/staff-types.functions.ts`)
- `proposeStaffTypesAndMapping({ organization_id })` — admin/manager only:
  1. Reads org's authoritative sources (SOW + provider contract) via existing `listAuthoritativeSources` / source text.
  2. Calls Lovable AI (same pattern as `generateRequirementsFromSource`) with a structured prompt that returns `{ staff_types: [...], mapping: [{requirement_key, applies_to_staff_types, source_basis, ambiguous}] }`.
  3. Writes `staff_types` rows with `proposed_by='nectar'`, `confirmed_at=NULL`.
  4. Writes `metadata.applies_to_staff_types` (defaulting ambiguous/unmapped to `"all"`) onto each requirement, with `confirmed_at=NULL`.
  5. Returns the proposal table for review.
- `listStaffTypeProposal({ organization_id })` — returns proposed types + per-requirement mapping table for the review UI.
- `confirmStaffTypeProposal({ organization_id, edits })` — admin sets `confirmed_at`. (Used in Part 2.)

### UI (Part 1)
- Add a section on `dashboard.hr-admin.tsx` (or a new `dashboard.hr-admin.staff-types.tsx`): "Staff types & applicability (proposed by NECTAR — awaiting confirmation)".
- Table: requirement title → applies-to types (chips) → source citation → ambiguous flag.
- "Run NECTAR proposal" button (admin/manager) + "Edit & confirm" button (DISABLED until Part 2 ships).
- Banner: "Confirm the mapping below before N/A rendering turns on — until then everything renders as applicable."

### Guardrails
- Ambiguous / unstated → `"all"` (never hide).
- Existing matrix, completion %, gating, RLS, auto-check, cumulative-hours logic are **unchanged** in Part 1.
- State-agnostic: derived purely from each org's own sources.

### Verify Part 1
- Migration succeeds.
- "Run NECTAR proposal" produces staff_types + per-requirement mapping with citations; ambiguous rows flagged + defaulted to all.
- Nothing in the matrix or staff HR tab changes yet.

**Then I pause and wait for you to review the proposed types + mapping.**

## Part 2 — Assign type + render N/A (after you confirm)

Will be implemented in a follow-up turn once you approve Part 1's proposal. Sketch:
- Add `staff_type_keys uuid[]/text[]` to `organization_members` (admin/manager-gated editor on the staff HR tab).
- New `getStaffApplicability(staff, requirement)` shared helper used by:
  - `getHrComplianceMatrix` (matrix cells)
  - `staff-hr-checklist-card` (staff HR tab)
  - `getHrAdminRollup` (gap / completion denominators)
- Rendering: applicable+done → check, applicable+not-done → gap, not-applicable → muted "N/A".
- Untyped staffer → treated as applies-to-all (with a subtle "Set staff type" hint).
- Denominators for completion %, gap counts, and rollup **exclude** non-applicable items.

## Out of scope (do not change)
Completion logic, signed-training auto-check, cumulative-hours logic, RLS beyond the new table, scheduler gating.
