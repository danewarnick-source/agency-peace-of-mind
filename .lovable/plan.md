The "Additional" rows on the staff About tab come from `custom_field_definitions` rows in your database. They were seeded by earlier smart-import / onboarding passes before the admin About form had first-class inputs for the same concepts. The admin panel still shows them (under the "Custom fields" collapsible at the bottom of each section), but they duplicate real columns you're already editing above — so from the admin side they look absent while they still leak into the staff About tab as "Additional" rows.

## What we found in your org

**Group A — pure duplicates of real `clients` columns.** The canonical data already lives on `clients.*`; the custom field is redundant.

- `support_coordinator_name` → `clients.support_coordinator_name`
- `support_coordinator_phone` → `clients.support_coordinator_phone`
- `support_coordinator_email` → `clients.support_coordinator_email`
- `prescriber_name` → `clients.prescriber_name`
- `emergency_medical_treatment_authorization` → `clients.emergency_medical_treatment_authorization`
- `preferred_name` → `clients.preferred_name`
- `diagnoses` → `clients.diagnoses` (array)
- `allergies` → `clients.allergies` (array/text)

**Group B — duplicate custom-field keys** (same concept, two definitions):

- `support_coordinator` (bare) — duplicates `support_coordinator_name`
- `financial_rep_payee` — duplicates `representative_payee`
- `plan_effective_date` — duplicates `pcsp_effective_start`
- `plan_end_date` — duplicates `pcsp_review_date`

**Group C — orphaned lowercase `goal_*` keys.** These were meant for the CST goals table, not client-level fields. They surface once per client but describe a single goal, which is meaningless.

- `goal_domain`, `goal_current_status`, `goal_strengths`, `goal_barriers`, `goal_success_criteria`

## Plan

1. Write a single migration that deletes the definitions in Groups A + B + C for your organization. Because `custom_field_values` has an FK to `custom_field_definitions`, the values delete via cascade (or we delete values first if there's no cascade — the migration handles both).
2. Nothing else changes. The admin's first-class inputs stay the same, and the staff About tab's "Additional" list will only show fields we don't already surface elsewhere.

## What we will NOT touch (asking first)

These aren't duplicates but also aren't editable as first-class fields anywhere in the admin UI today. Deleting them would lose data:

- `secondary_phone`, `county`, `day_program_name`, `transportation_notes`, `funding_source`
- `pcsp_author_name`, `pcsp_meeting_date`, `pcsp_signed_by_client`, `pcsp_signed_by_guardian`
- `representative_payee`
- `dspt_person_id`, `host_home_provider`, `provider_name`, `support_team_roster`
- `rights_restrictions`, `communication_dictionary`, `typical_daily_routine`, `risk_assessment`, `client_preferences_strengths_notes`

If any of these are also legacy and can be dropped, tell me which and I'll add them to the same migration.

## Acceptance

- The "Additional" section on the staff About tab no longer repeats the Support Coordinator name/phone/email, prescriber, diagnoses, allergies, preferred name, or the duplicate PCSP/plan/rep-payee entries.
- Admin edit screens continue to work with the first-class columns as before.