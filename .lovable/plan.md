
# Goal
Make the PCSP the "source of truth" for the client profile. If a fact is anywhere in the PCSP (DOB, physical address, primary care phone, guardian email, etc.), it should end up on the client profile without an admin re-typing it — and any remaining gap should be an obvious, one-click fix, not a silent empty field.

# What's actually causing the gaps today
Three separate layers each drop a different subset of PCSP data:

1. **Extractor prompt** (`src/lib/document-extraction.ts`)
   Enumerates ~70 keys but leaves out several PCSP-visible facts (e.g. gender/sex, preferred pronouns, communication preferences, mobility/adaptive equipment, primary language, ethnicity/race if collected, funding source, day program name, transportation notes, additional phone numbers, alternate address, secondary Medicaid/insurance IDs, county, PCSP author, plan review dates, PCSP signature dates). If the model isn't told to look, it doesn't return them.

2. **Finalizer** (`applyExtractedFieldsToClient` in `src/lib/client-import-schema.ts`)
   Only writes columns it explicitly lists. Any extra `field_key` the model DOES return today is discarded (not even parked as a `custom_field_value`). This is why users see fields on the review screen that never appear on the profile.

3. **Profile registry** (`src/lib/client-profile-fields.ts`)
   The profile only renders keys registered here. New PCSP facts have nowhere to land in the UI even after we widen extraction + finalizer.

# Plan

## 1. Widen the extraction schema (PCSP-first pass)
Extend `SYSTEM_PROMPT` and `CORE_CLIENT_FIELD_KEYS` in `src/lib/document-extraction.ts` to cover every field the standard Utah DSPD PCSP template exposes but we currently ignore:

- Identity: `gender`, `pronouns`, `preferred_name`, `primary_language`, `communication_notes`, `race`, `ethnicity`, `marital_status`
- Contact: `secondary_phone`, `email`, `county`, `city`, `state`, `zip`, `mailing_city`, `mailing_state`, `mailing_zip`
- Health context: `mobility_notes`, `adaptive_equipment`, `dietary_restrictions`, `weight`, `height`, `blood_type`, `menstrual_supports`, `vision_status`, `hearing_status`
- Insurance / IDs: `secondary_insurance`, `ssn_last4`, `medicare_id`
- Program: `day_program_name`, `day_program_phone`, `transportation_notes`, `funding_source`
- Plan metadata: `pcsp_author_name`, `pcsp_meeting_date`, `pcsp_effective_start`, `pcsp_review_date`, `pcsp_signed_by_client`, `pcsp_signed_by_guardian`

Add an explicit instruction to the prompt: **"If a fact appears anywhere in the document — narrative text, tables, headers, or signature blocks — you MUST emit it. Missing a fact that is visible in the document is worse than a low-confidence guess (mark low confidence instead)."**

Also add a second **profile-completeness safety pass**: after the main extraction, if any of a defined "must-have" set (DOB, address, primary phone, guardian, emergency contact) is missing from the fields array, run a small targeted follow-up call (same pattern as the existing `extractGoalsOnly` retry) asking only for those keys.

## 2. Make the finalizer field-driven, not hand-coded
In `applyExtractedFieldsToClient`:

- Replace the long list of hand-written `setScalarText("column", "key")` lines with a loop over `CLIENT_PROFILE_FIELDS` from `client-profile-fields.ts`. Each registry entry declares its storage (column vs custom) and its extraction aliases, so adding a new field in one place populates it end-to-end.
- Add a `setCustomText / setCustomBool / setCustomArray` path that mirrors `setScalarText` but writes through `writeProfileFieldValue`, so any registry field with `storage.kind === "custom"` auto-fills too.
- Fallback bucket: for any high-confidence extracted field whose key is not in `CORE_CLIENT_FIELD_KEYS` and not a registry alias, park it as a `custom_field_value` with `source: "pcsp"` so it's visible under "Additional PCSP details" instead of vanishing.

## 3. Grow the profile registry
Add registry entries in `client-profile-fields.ts` for the new keys from step 1 that deserve first-class UI (pronouns, preferred name, primary language, communication notes, mobility, adaptive equipment, dietary restrictions, secondary phone, email, county, day program, transportation notes, PCSP author, PCSP signature dates). Column-backed where a `clients` column already exists; custom-backed otherwise. No new DB columns in this pass — we lean on `custom_field_values` for anything new, so this stays a code-only change.

## 4. "PCSP coverage" panel on the client profile
On the profile Care/Overview tab, add a compact **"Pulled from PCSP"** card:

- Green rows: fields the current PCSP filled.
- Amber rows: fields the current PCSP contained but that were overridden by a prior value (i.e. entries in the `suggested` list from the finalizer) — one-click "Accept PCSP value".
- Grey rows: fields the PCSP did NOT contain — inline "Add manually" input, same pattern as `AddMissingFieldPopover` from Smart Import review.

This is the "no missing fields when the PCSP has that information" guarantee, made visible.

## 5. Backfill for clients whose PCSP is already filed
Add a small `reapplyPcspToClient` server function that re-runs steps 2–3 against the client's most recent stored PCSP extraction (already in `client_documents` / `extracted_fields`) without re-calling the AI. Expose it as a "Re-sync from PCSP" button on the coverage card so existing clients benefit immediately.

## Explicitly out of scope
- No new `clients` table columns (all new PCSP facts land in `custom_field_values`).
- No changes to Smart Import wizard step order — the finalizer widening is what flows through.
- No changes to billing-code, medication, or goal extraction (those already have dedicated passes).

# Technical notes (for the implementer)
- Keep the finalizer's existing conflict/duplicate detection (`writeScalarConflict`, `writeDuplicateFlag`) — the registry loop should call into it unchanged.
- The "safety pass" second AI call should reuse `gatewayFetch` with `max_tokens: 4000` and only fire when ≥1 must-have is missing, to keep cost bounded.
- `CORE_CLIENT_FIELD_KEYS` must stay in lockstep with the new extraction keys or Smart Import will mis-classify them as custom attributes.
- Coverage card reads from `extracted_fields` for provenance ("Filled from PCSP · page 3") so admins trust it.

Ready to switch to build mode and implement?
