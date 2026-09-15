# Agency setup coverage — verification audit

Companion to `AGENCY_SETUP_COVERAGE.md`/`.json` (the generated 85-fact — 87-row
— table). That table is the mapping; this document is the verification: what
was actually checked, what was found wrong, and what remains unresolved.
Written against baseline commit `793c6f8f` ("Replace six-fact setup gate with
a comprehensive, registry-driven questionnaire"), which introduced the 85-fact
registry this audits.

## Why this document exists

`AGENCY_SETUP_COVERAGE.md`'s own exhaustiveness check only proves **membership**:
every one of the 85 `Applicability_Facts.json` fact IDs appears somewhere in
`AGENCY_SETUP_QUESTIONS.sourceFactIds`, `DEFERRED_FACTS`, or
`NON_QUESTION_FACT_DISPOSITIONS`, exactly once (compound splits excepted). That
is a real, useful, test-enforced guarantee — but it is not the same claim as
"this fact is collected correctly" or "something reads the value back and
acts on it." Membership in an array and a working, meaningful, consumed
answer are different properties, and this audit checked the second one, not
just the first.

## 1. Executable-consumer verification (source of "coverage of 85 facts")

The 85 facts partition into three groups, each with a different consumer
story:

**11 → 12 agency-level questions** (`AGENCY_SETUP_QUESTIONS`, answered once at
signup, stored as `organizations` columns). Verified by reading
`src/lib/obligations/applicability.ts`'s `loadOrgFacts()` directly — the only
function that feeds `duty-applicability.ts`. It selects exactly:

```
fact_operates_ol_site, fact_uses_volunteers, fact_has_governing_board, services_offered
```

Three of the (now twelve) agency questions' columns are in that list and have
a real consumer. **The other six new columns this baseline commit added are
not** — `fact_provides_respite_overnight`, `fact_is_usor_vendor`,
`fact_supports_self_administered_medication`, `fact_acts_as_representative_payee`,
`fact_provides_transportation`, `sei_award_date`. They are collected, stored,
round-trip correctly, and gate agency-setup **completion** (the create-blocking
gate) correctly — that part is proven by real Postgres tests. But nothing in
the duty/requirement-evaluation engine reads them back. `sei_award_date`
specifically: `third-executable-batch.ts` declares a `liveFactKey:
"sei_award_date"` binding for `REQ-30.6.a`, which reads as if the deadline
logic described in the question's own help text ("awards before 2026-07-01 use
2027-01-31; later awards use award date plus six months") is implemented
somewhere — it is not. No code computes that deadline from the stored date.

This is now self-checking, not just asserted: `scripts/report-agency-setup-coverage.ts`'s
`verifyDutyEngineConsumerClaim()` re-reads `applicability.ts`'s actual
`loadOrgFacts()` source every time the report regenerates, and throws if the
hardcoded six-column "no consumer" list has gone stale in either direction.
The generated table's **Consumer** column states this plainly per row instead
of only showing a requirement-count number.

**Wiring these six facts into the duty engine is a separate, larger change**
that would touch DHHS91172 catalog-rule evaluation. Out of scope here —
`agency-setup-questions.ts`'s own doc-comment says this module "does not gate,
activate, or publish any DHHS91172 catalog rule," and this task's own
instructions forbid publishing catalog rules.

**35 → 36 deferred facts** (`DEFERRED_FACTS`, answered on a staff/client/
location/assignment record once it exists, via `compliance_fact_answers`).
Verified by reading `duty-applicability.ts` and
`load-staff-duty-facts.functions.ts` directly: **neither reads
`compliance_fact_answers` for any scope.** Every generic-storage deferred fact
— including the new assignment fact this task's Part 1 asked for (FACT-060)
and the representative-payee status this task's Part 2 asked for (FACT-018)
— is collected, stored, RLS-protected, and now (Part 1) triggers the existing
duty-reevaluation mechanism, but has no consumer yet either. `org_setup_is_complete()`
explicitly and correctly never reads this table, by design — deferred facts
are not part of agency-setup completion.

Deferred facts with `existing_mechanism` storage (e.g. `clients.has_abi`,
`clients.dnr_applicable`) inherit whatever consumer their named column
already has — several of these (has_abi, the transport-assignment live path)
are independently known to be live; the rest were not individually
re-verified in this pass beyond confirming the storage claim itself is
accurate (the column exists and is spelled correctly).

**4 non-question dispositions** (derived/rule, never asked). FACT-071 (agency
provides only CHA/HSQ/PBA) is a real, verified consumer:
`humanRightsPlanStatus()`/the `CHA_HSQ_PBA` rule in `applicability.ts`.
FACT-076/077 (fixed code-exemption and cadence rules) and FACT-054 (client
age, derived from `date_of_birth`) were not independently re-traced to a
specific call site in this pass; their storage claim ("a fixed rule, not
stored") is structurally correct regardless.

## 2. A real gap this verification found and closed: FACT-065

`FACT-065`'s own `sourceNote` claimed it was "deferred to the client record,"
but no `DEFERRED_FACTS` entry existed for it — it was silently covered only by
being listed in `q_uses_volunteers.sourceFactIds`, which merges it into the
*agency-wide* "does this contractor use volunteers?" yes/no. The exhaustiveness
test passed (the fact ID was present somewhere) while the actual question
— "**which clients**" a volunteer has been used with — was never collected.
The workbook's own `collection_rule` for this row: *"Split compound questions
into typed facts; unknown is not false."* This is now fixed the same way
`FACT-003` (the one other compound split) already was: `FACT-065` is in
`COMPOUND_SPLIT_FACT_IDS` and has its own `DEFERRED_FACTS` entry
(client-scoped, generic storage). Verified: the exhaustiveness test still
passes, and the generated table now shows FACT-065 twice with genuinely
distinct content, matching FACT-003's pattern.

## 3. Part 4 — FACT-078 and FACT-062/FACT-063 scope

Method: read each fact's actual row in `docs/compliance/dhhs91172/
Applicability_Facts.json` (the workbook — gives `fact_scope`, the raw
question, `linked_requirement_keys`) and then the **requirement catalog's own
row** for each of those REQ- keys, in `docs/compliance/dhhs91172/
catalog_batches/*.json` (`Requirement_Catalog.json` itself is a redirect —
`storage: "catalog_batches/catalog_00.json through catalog_09.json"`, `rows`
is empty). The catalog row's `applies_to` field is the platform's own
authoritative classification of which entity the *requirement* binds —
independent of, and in these three cases more reliable than, the workbook's
`fact_scope` column, which is often just whatever the source clause's
grammatical subject happened to be.

### FACT-078 — confirmed correct as agency scope

- Workbook (`Applicability_Facts.json`): `fact_scope: "client"`, question "Is
  the agency a Social Security representative payee for **any** client?"
- Requirement catalog (`REQ-1.28.1`, `catalog_01.json`): `applies_to: "agency"`.
  `clause_text`: *"(1) if they are a Person's social security representative
  payee, be in compliance with PBA requirements;"* — an exception-category
  rule about the agency's own standing, not any one client's identity.
  `notes`: *"Activates Article 15 (PBA) requirements when the agency is a
  representative payee."*
- **Verdict: correct as classified.** The workbook's "client" tag is an
  artifact of the source clause naming "a Person" — the catalog's own
  `applies_to` says this specific rule is agency-scoped, and the `notes`
  field confirms its real job is as an agency-wide *trigger* for a family of
  downstream requirements, not an identifier for which client. The per-client
  instance (does this contractor act as payee **for this specific client**)
  is FACT-018/058/079, correctly deferred to each client's own record and
  unaffected by this screening answer either way.

### FACT-062 — confirmed correct as location scope

- Workbook: `fact_scope: "client"` (a headcount), question "Persons served
  per location (4+ requires Day Treatment license; 3 or fewer requires
  certification)."
- Requirement catalog (`REQ-7.5.a` / `REQ-8.5.a`, `catalog_03.json`): **both**
  `applies_to: "site"`. `clause_text`: *"for **each location** providing
  DSG/DSP have and maintain a: ... Day Treatment license ... for each
  location DSG/DSP is provided for four or more Persons; or ... Day Support
  certification ... for each location ... for three or fewer."*
  `ui_destination: "Locations"`.
- **Verdict: correct as classified.** This genuinely is a per-location
  threshold — every location gets its own count and its own license/
  certification decision. `teams.capacity` (reused, not a new column) is the
  right home for it.

### FACT-063 — was misclassified; fixed in this change

- Workbook: `fact_scope: "client"`, question "Total Persons served in the
  community program (4+ requires Day Treatment license)."
- Requirement catalog (`REQ-7.5.b` / `REQ-8.5.b`, `catalog_03.json`): **both**
  `applies_to: "agency"` — not `"site"`, unlike its sibling clauses (a) above.
  `clause_text`: *"(b) When services are provided **solely in the
  community**, the Contractor shall have and maintain a:"*. `elements_checklist`
  is explicit that the count is **program-wide**: *"four or more Persons in
  total, **regardless if the Persons all receive services at the same time,
  same location, or in the same groups**."* `ui_destination: "Agency
  compliance"` (not "Locations").
- **Prior classification (before this change):** `DEFERRED_FACTS`,
  `scope: "location"`, `deferredTo: "location_record"` — the same treatment
  as FACT-062. The prior session's own `sourceNote` said "Same reclassification
  as FACT-062 — a program-wide total, not a per-client fact," which correctly
  identifies it as *not per-client* but then reclassifies it to *location*
  anyway, which the clause text directly contradicts: a number that is
  explicitly the same "regardless of... location" cannot correctly live on
  any one location's record. `DEFERRED_FACTS`'s own type (`scope: Exclude<
  QuestionScope, "agency">`) cannot even represent an agency-scoped fact —
  this entry could not have been made agency-scoped without moving registries,
  which is presumably why it landed in the wrong one instead.
- **Fix applied:** moved to a new agency-level question,
  `q_community_program_total_persons_served` in `agency-setup-questions.ts`
  (new column `organizations.fact_community_program_total_persons_served`,
  visible only when a community day-support code — DSG, DSI, or DSP — is
  awarded), removed from `DEFERRED_FACTS`. Fully wired end to end: registry →
  wizard rendering (already generic) → `agency-setup-persist.ts` (save +
  rollback-restore) → `agency-setup-completion.ts` (value read-back) →
  regenerated coverage table.
- **Deliberately not `baseRequired: true`.** Threading a new *required*
  field through both `org_setup_is_complete()` (SQL) and
  `factsAreComplete()`/`agency-setup-completion.ts` (TypeScript) — which the
  migration's own comment requires to match exactly — needs end-to-end
  re-verification of the create-blocking gate beyond what this task's
  remaining scope allows for a fact that, per FACT-062/FACT-063's own
  `creates_user_task: "yes"` / `completion_method: "Upload license/approval"`,
  isn't really "complete" until a license is uploaded anyway — a `baseRequired`
  number field would only prove someone typed a count, not that the real
  underlying requirement (holding the license) is met. **This is the one
  place in Part 4 left explicitly unresolved rather than counted as finished:**
  the fact is now correctly scoped, visible in the wizard, and persists
  durably, but does not yet gate completion or generate the upload task
  `creates_user_task: "yes"` calls for. Verified with a real Postgres run that
  leaving it unanswered does not accidentally block a real org's setup
  completion (`agency-setup-gate.integration.test.ts`, "matches TypeScript and
  SQL completion on the full registry-driven fact set" — sets every other
  required field, never touches this column, asserts completion `true` on
  both the SQL and TypeScript sides).

## 4. What "verified" means in this document, precisely

- **Real DB proof** (ran against a real, local, isolated Postgres 16 instance
  with RLS enabled — not a mock): the four-state representative-payee status,
  the assignment-scope save shape, cross-org isolation, the audit-column
  lock, and (for FACT-063) that the new optional column does not affect
  completion. `npm run test:agency-setup-integration` — 16/16, stable across
  repeated runs against the same non-reset database.
- **Source-inspection proof** (read the actual consuming code, not the
  metadata that claims a consumer exists): the duty-engine consumer claims in
  §1, self-checked by `verifyDutyEngineConsumerClaim()` every time the
  coverage table regenerates.
- **Not verified in this pass**: whether every `existing_mechanism`
  deferred fact's *named* consumer (e.g. the ABI-training live path, the
  transport-assignment live path) is itself still correct and live — only
  that the column/mechanism named in `storage.description` exists and is
  spelled correctly. This was out of proportion to re-derive from scratch for
  all ~15 such facts within this task; flagged here rather than silently
  assumed.
