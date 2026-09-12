# DSPD Compliance Engine — Schema Design (Phase 0)

Status: **draft build spec**, not legally reviewed, not activated. Everything
introduced here stays `rule_status IN ('draft','pilot')` and is scoped away
from the real True North Supports (TNS) tenant via `organizations.is_demo`
(the existing flag — see Landmines: never invent a new one when a real
column already does the job).

This is a build spec, not a dissertation — it gets the table set roughly
right and moves on. Any field-level nuance not resolved here is resolved in
Phase 2 hand-authoring of the 8 pilot rules.

## Why new tables instead of extending `company_obligations`

`company_obligations` is a flat, single-instance-per-period reminder engine:
one `due_at`, one `status`, one `evidence_type`. DSPD requirements need:
- **versioned** rule text (a requirement can be revised; old assignments
  must keep pointing at the version they were evaluated under),
- a **typed condition tree** for applicability (agency awarded SEI AND has
  no ACRE-certified staff → ...), not a fixed `scope` enum,
- **ALL/ANY sub-element groups** with independently queryable progress
  ("17 of 25 topics"),
- **evidence reused across requirements** (one CPR card should be able to
  satisfy the 1.8.5 element and any other rule that asks for CPR),
- a `not_applicable` outcome (fact says this rule doesn't apply to this
  subject) that `company_obligations` has no room for.

Reuse company_obligations' *patterns* (reminder pre-insert into
`notifications`, staff_groups targeting, trigger-on-write instead of cron)
without forcing DSPD's richer shape into its tables.

## Table set (`dspd_` prefix)

### `dspd_requirement_definitions`
One row per requirement **version**. Never mutated in place once any
assignment references it — a revision inserts a new row and marks the old
one `superseded`.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| requirement_key | text | e.g. `REQ-1.8.4` — stable across versions |
| version | integer | starts at 1; unique with requirement_key |
| source_clause_id | text | e.g. `DHHS91172-A-0061`, traces to `Requirements.csv` |
| section_ref | text | e.g. `1.8(4)` |
| sow_version | text | `DHHS91172` |
| effective_date | date | |
| title | text | |
| category | text | matches `Category_Reference.csv` |
| applies_to | text | `agency` \| `staff` \| `client` \| `site` |
| service_codes | text[] | empty = ALL; else e.g. `{SEI}` |
| applicability_rule | jsonb | typed condition tree, see below; `null` = always applicable once service_codes/applies_to match |
| completion_group | jsonb | ALL/ANY element tree, see below; `null` = single atomic completion, no sub-elements |
| deadline_anchor | text | e.g. `hire_date`, `first_solo_service_at`, `staff_client_assignment`, `sei_award_date`, `service_start` — enumerated, not free text |
| deadline_offset_days | integer | nullable; null when deadline is an event itself (e.g. "before first solo support") rather than an elapsed period |
| deadline_rule_note | text | free text for compound rules the offset column can't express (e.g. 30.6.a's cohort branch) — evaluator code, not the column, implements these; the note is what an auditor reads |
| reminder_offset_days | integer[] | **kept separate from deadline_offset_days** per the instruction — these are "warn N days before due", not part of the legal deadline computation |
| renewal_rule | text | free text; `null` explicitly means "no renewal, non-recurring" — never defaulted to annual |
| handling_label | text | `IN_PLATFORM` \| `UPLOAD` \| `EXTERNAL` \| `SYSTEM` — a default, not proof of acceptance |
| acceptance_criteria | jsonb | what an admin must confirm before accepting evidence (issuer, scope, dates present, etc.) — required for anything not `SYSTEM` |
| extra_facts_needed | text[] | `fact_id`s from `dspd_fact_definitions` this rule reads |
| rule_status | text enum | `draft` \| `pilot` \| `published` \| `superseded` — **published is never reached in this engagement** |
| approved_by | uuid nullable | profile id; null until a human signs off (never set here) |
| approved_at | timestamptz nullable | |
| notes | text | ambiguity/caveats an auditor needs, e.g. the 30.6(a) email-typo caveat |
| created_at / updated_at | timestamptz | |

`applicability_rule` and `completion_group` are typed JSON trees evaluated
by the pure-function evaluator in `src/lib/dspd-compliance/` (Phase 3), e.g.:

```json
{
  "op": "ALL",
  "conditions": [
    { "op": "FACT_EQUALS", "fact_id": "FACT-008", "subject": "agency", "value": true },
    { "op": "EXISTS", "source": "staff_assignments", "filter": { "service_codes_contains": "SEI" } }
  ]
}
```

Supported node ops: `ALL`, `ANY`, `NOT`, `EXISTS`, `COUNT` (with a
`comparator`/`threshold`), `FACT_EQUALS`, `DATE_COMPARE`. Evaluator inputs:
`dspd_agency_facts`, `staff_assignments`, `client_billing_codes`, and
resolved qualification keys from `resolveStaffQualifications`.

`completion_group` example (REQ-1.8.4, ALL of 25 topics):
```json
{ "op": "ALL", "elements": ["1.8(4)(A)", "1.8(4)(B)", "...", "1.8(4)(W)"] }
```
REQ-30.6.c (ANY one complete route):
```json
{ "op": "ANY", "routes": [["30.6(c)(1)"], ["30.6(c)(2)"]] }
```
"ANY" is a route selector, not a partial-credit union — satisfying one
element from route A and one from route B does not count (explicit ground
rule).

### `dspd_requirement_elements`
Sub-elements broken out as independently queryable rows (not fully folded
into jsonb) so progress bars and per-topic evidence attach cleanly.

| column | type |
|---|---|
| id | uuid PK |
| requirement_definition_id | uuid FK → dspd_requirement_definitions |
| clause_id | text | source `clause_id`, e.g. `DHHS91172-A-0062` |
| element_key | text | e.g. `1.8(4)(A)` |
| clause_text | text | verbatim from `pilot_elements.json` |
| requirement_role | text | `element` (matches source) |
| route_group | text nullable | for ANY-groups, which route this element belongs to (e.g. `route_1`, `route_2`) |
| sort_order | integer | |

### `dspd_fact_definitions`
Seeded from `Applicability_Facts.csv` (all 85 rows — inert catalog rows for
facts not wired into the 8 pilot rules are fine per the phase plan).

| column | type |
|---|---|
| id / fact_id | text PK | e.g. `FACT-008` |
| fact_scope | text | `agency` \| `staff` \| `client` \| `site` |
| question | text | |
| answer_type | text | `yes/no` \| `selection / list` \| free text passthrough of CSV `answer_type` |
| answered_by | text | e.g. `Owner / administrator` |
| linked_requirement_keys | text[] | |
| collection_rule | text | |
| wired_for_pilot | boolean | true only for the facts the 8 pilot rules actually read |

### `dspd_agency_facts`
Per-org, effective-dated **answers** to fact definitions.

| column | type |
|---|---|
| id | uuid PK |
| organization_id | uuid FK |
| fact_id | text FK → dspd_fact_definitions |
| subject_type | text | `agency` \| `staff` \| `client` \| `site` |
| subject_id | uuid nullable | null for agency-level facts |
| value | jsonb | typed answer (bool, string, list) |
| effective_from | timestamptz | |
| effective_to | timestamptz nullable | null = current |
| recorded_by | uuid | profiles.id |
| source | text | `setup_wizard` \| `admin_edit` \| `derived` |
| created_at | timestamptz | |

Effective-dating means a fact change (e.g. "client no longer has ABI need")
doesn't erase history — it closes the old row (`effective_to`) and inserts a
new one, which is what lets the recalculation step target only the affected
subject.

### `dspd_setup_progress`
Per-org gate state (Phase 4).

| column | type |
|---|---|
| organization_id | uuid PK/FK |
| required_fact_ids | text[] | snapshot of which facts were required at setup time |
| answered_fact_ids | text[] | |
| is_complete | boolean | |
| completed_at | timestamptz nullable | |
| backfilled | boolean | true for orgs marked complete by the Phase 1 migration backfill, not by walking the wizard |

Explicitly **not** the same as "compliance complete" — it only gates
staff/client creation on the minimum facts the pilot rules need.

### `dspd_assignments`
The per-subject, per-requirement-version obligation instance. Lifecycle
status, not a boolean, matching System_Design.

| column | type |
|---|---|
| id | uuid PK |
| organization_id | uuid FK |
| requirement_definition_id | uuid FK |
| subject_type | text | `staff` \| `agency` \| `client` (mirrors `applies_to`) |
| subject_id | uuid nullable | staff/client id; null for agency-level |
| period_or_event_key | text | dedupe key — e.g. `hire` for one-time, `2027` for an employment-year window, `client:<id>` for a client-anchored assignment |
| status | text enum | `not_started` \| `in_progress` \| `submitted` \| `needs_correction` \| `accepted` \| `expired` \| `superseded` \| `not_applicable` |
| due_at | timestamptz nullable | computed from deadline_anchor/offset; null when the rule has no stated deadline |
| generated_from_fact_id | text nullable | which fact triggered creation, for "Why this applies" |
| generated_reason | text | human-readable, cites source clause + fact |
| unit_progress | jsonb nullable | e.g. `{ "hours_logged": 8, "hours_required": 12 }` or `{ "topics_done": 17, "topics_required": 25 }` |
| reviewed_by | uuid nullable | |
| reviewed_at | timestamptz nullable | |
| review_notes | text nullable | |
| created_at / updated_at | timestamptz | |
| UNIQUE | (requirement_definition_id, subject_type, subject_id, period_or_event_key) | **this is the idempotency guarantee** — replaying the same trigger upserts, never duplicates |

### `dspd_evidence`
Reusable evidence record — one accepted record, many satisfied
requirements.

| column | type |
|---|---|
| id | uuid PK |
| organization_id | uuid FK |
| subject_type / subject_id | | whose evidence this is (almost always staff) |
| evidence_kind | text | e.g. `credential`, `training_record`, `attestation`, `external_receipt` — aligned with existing `kind:key` qualification-key normalization in `staff-qualifications.functions.ts` |
| qualification_key | text nullable | when this really is "staff has qualification X", store the normalized key so `resolveStaffQualifications` stays the source of truth instead of a duplicate check |
| issuer | text nullable | |
| scope | text nullable | free text describing what it covers, e.g. "CPR" |
| valid_from | date nullable | |
| valid_to | date nullable | null = doesn't expire |
| file_path | text nullable | upload storage path |
| external_reference | text nullable | for EXTERNAL handling (URL/receipt id) |
| attestation_id | uuid nullable | FK-ish to `policy_signatures` when reused |
| review_status | text enum | `submitted` \| `accepted` \| `rejected` |
| reviewed_by / reviewed_at / review_notes | | |
| created_by | uuid | |
| created_at / updated_at | timestamptz | |

### `dspd_evidence_links`
Many-to-many evidence ↔ (assignment, optionally one element).

| column | type |
|---|---|
| id | uuid PK |
| evidence_id | uuid FK → dspd_evidence |
| assignment_id | uuid FK → dspd_assignments |
| element_id | uuid nullable FK → dspd_requirement_elements | null = satisfies the whole requirement, not one topic |
| created_at | timestamptz |
| UNIQUE | (evidence_id, assignment_id, element_id) |

Accepting one `dspd_evidence` row can flip multiple `dspd_assignments` to
`accepted` (or advance `unit_progress`/mark one element done) via its links
— this is the "evidence reuse" row from System_Design.

### Reminders
No new reminder table. Phase 3's assignment generator calls the same
`notifications` pre-insert pattern `scheduleRemindersInternal` already
uses in `company-obligations.functions.ts`, keyed off `dspd_assignments.due_at`
and a `reminder_offset_days` read from the assignment's requirement
definition — same mechanism, new source table.

## RLS / migration convention

Every `dspd_*` table: `organization_id` FK (or reachable via a FK'd
document, e.g. `dspd_requirement_elements` has no org column itself — scope
through its parent), RLS enabled, `is_org_member` for SELECT,
`is_org_admin_or_manager` (plus `is_super_admin`) for writes, GRANT to
`authenticated` + `service_role`, indexes on FK/status/due_at, `set_updated_at`
trigger — copied from
`supabase/migrations/20260813233000_company_obligations_and_staff_groups.sql`.
`dspd_requirement_definitions`/`dspd_requirement_elements`/`dspd_fact_definitions`
are catalog tables (not org-scoped) — readable by any authenticated org
member, writable only by `service_role` (seeded by migration/script, not by
end users).

## Pilot scoping

Rule execution (assignment generation, applicability evaluation) only runs
for organizations where `organizations.is_demo = true` for the duration of
this engagement — enforced in the Phase 3 evaluator entry point, not by RLS
alone (RLS still protects the tables normally; this is an application-level
guard so real TNS data is never touched even though the schema exists
tenant-wide). `dspd_requirement_definitions.rule_status` additionally never
leaves `draft`/`pilot`.

## Explicitly deferred (not gold-plated here)

- The remaining ~750 non-pilot requirements load into
  `dspd_requirement_definitions` with `applicability_rule = null`,
  `completion_group = null` (metadata-only, browsable, inert) — Phase 2.
- `dspd_requirement_elements` bulk import for non-pilot requirements is
  skipped this stage (only the 42 pilot elements are loaded methodically);
  the bulk loader may optionally stub element rows later if `Requirements.csv`
  has clean parent/child linkage, but that's a Phase 2+ judgment call, not
  designed here.
