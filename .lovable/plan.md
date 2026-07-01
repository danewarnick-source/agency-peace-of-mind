## Goal
Make Smart Import behave like a visual pre-client-profile workspace: all PCSP/intake/1056/MAR data NECTAR extracts is visible for provider review before finalizing, then committed into the real client profile, Client Files, PCSP goals, medications/MAR, training inputs, and care workflows.

## Plan

1. **Expand the Smart Import client data map**
   - Replace the narrow client review field list with the existing canonical client-profile registry plus the full PCSP extraction keys.
   - Include fields currently extracted but hidden or treated as “unmapped,” such as support coordinator company, mailing address, PCP/specialist/prescriber fields, diagnoses, allergies, swallowing/dysphagia, staff ratio, rights/DNR/ABI flags, preferred activities/living, medical insurance, admission/discharge, and plan dates.
   - Keep billing-code routing behavior unchanged.

2. **Rebuild the Smart Import review wizard into profile-shaped sections**
   - Keep the existing step rail, but make the contents visually match what the provider expects in the eventual client profile:
     - Person & contacts
     - Support coordinator / guardianship / emergency contacts
     - Services & authorizations
     - Health, safety & medical providers
     - Medications / MAR setup
     - PCSP goals & care plan
     - Required documents
     - Staff assignment
     - Final review
   - Show every extracted value with source/evidence snippets and editable controls before commit.
   - Do not hide “non-SOW” extracted values when they are clinically or operationally relevant.

3. **Add a PCSP goals review panel inside Smart Import**
   - Surface all extracted `pcsp_goal` rows before finalization.
   - Allow the provider to edit, delete, and add goals manually when NECTAR misses them.
   - Flag goals that appear incomplete, such as missing support details, success criteria, current status, or domain/context when those are expected from the PCSP.
   - Commit approved goals into the same client goal storage already used by the Care tab so they appear immediately after setup.

4. **Add a medication/MAR review panel inside Smart Import**
   - Surface all extracted `client_medication` rows in an editable medication table.
   - Include medication name, dose, route, frequency/schedule, scheduled time(s), PRN status/instructions, prescriber, purpose/diagnosis, support level, and support explanation when present.
   - Provide “No medications found — confirm/add manually” and “PCSP says no medications” states.
   - On commit, create/update `client_medications` rows so MAR/eMAR sheets, shift medication attestation, daily logs, and client-specific training can consume them.
   - Preserve the existing safety behavior that never disables MAR if active medications already exist.

5. **Make document evidence and contradictions reviewable before commit**
   - Keep the uploaded PCSP as the source-of-truth document in Client Files after finalization.
   - In Smart Import, group extracted data by section and show the source document/snippet.
   - Flag obvious contradictions before commit, such as two different DOBs, guardian names, medication doses, or service-code values from different uploaded documents.
   - Let the provider choose/edit the value that should be committed; do not auto-resolve contradictory PHI/care data silently.

6. **Strengthen final commit so reviewed data lands everywhere it should**
   - Extend the commit path, not a parallel path, so the existing “Complete client setup” action remains the single finalization action.
   - Ensure reviewed fields populate the `clients` profile columns/custom profile values, PCSP goals, billing codes, external services, staff assignments, Client Files, and medication rows.
   - Add commit gaps/audit messages when a value cannot be saved, instead of showing a green success while silently dropping data.

7. **Validation and tests**
   - Add/update end-to-end coverage for creating a new client from a PCSP and verifying that:
     - extracted goals appear in Smart Import review and then on the Care tab,
     - extracted medications appear in Smart Import review and then in medication/MAR consumers,
     - profile fields visible in the screenshots are populated after finalization,
     - “no goals found” and “no medications found” manual paths are visible,
     - contradictory extracted values are flagged for review.

## Technical notes
- Primary files to update:
  - `src/routes/dashboard.smart-import.$jobId.review.tsx`
  - `src/lib/smart-import-commit.functions.ts`
  - `src/lib/client-import-schema.ts`
  - `src/lib/client-profile-fields.ts`
  - related E2E tests under `e2e/`
- If the live backend is missing any required medication/goal columns or constraints, I will surface a migration/handoff separately before code depends on it.
- No NECTAR auto-publishing or unreviewed action is added; the provider remains accountable through review/edit/finalize.