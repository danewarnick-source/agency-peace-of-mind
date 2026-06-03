# Make HIVE state-neutral — Utah as the reference instance

This is an architectural change. The app currently has Utah values (DSPD/DHHS, DSI/HHS/RHS codes, Form 520/1056, 14-day respite, ELS caps, etc.) embedded in components, server functions, and even DB triggers. The goal is to move what *can* be configuration into the editable state template, leave a clean "skeleton" for new states, keep Utah's behavior identical, and have NECTAR flag what truly can't be config.

I'll do this in four focused phases so each one is reviewable and Utah never breaks. Phase 1 is mostly inventory + schema; phases 2–4 are the refactor.

---

## Phase 1 — NECTAR inventory + expanded template schema

**A. Inventory (NECTAR-assisted, surfaced as an artifact + UI list)**

Scan the repo for Utah-specific literals and group them. Initial pass already shows these categories:

- **Terminology / agencies**: DSPD, DHHS, "Division of Services for People with Disabilities", Utah Medicaid, regulator labels in `state-templates.ts`, `nectar-*` copy, route headers.
- **Service / billing codes**: DSI, HHS, RHS, DSG, RL6, RP3, RP4, RP5, S5151, S5102, S5125 — hardcoded in `src/lib/evv-codes.ts`, `src/lib/service-billing.ts`, `src/lib/job-codes.ts`, `src/lib/billing-units.ts`, `src/lib/variable-rate-codes.ts`, and DB triggers `enforce_client_spending_hourly_shift`, `enforce_els_caps`, `enforce_respite_caps`.
- **State forms**: Form 520, Form 1056, PCSP, BSP, HRC — `dashboard.billing-520.tsx`, `dashboard.billing.form520.tsx`, `components/workspace/forms-hub-tab.tsx`, AI prompts in `pdf-import.functions.ts`.
- **Training mandates**: CPR/First Aid cadences, HIPAA, abuse/neglect, BSP refresher — `dashboard.tracks.tsx`, course seed data.
- **EVV config**: 500ft default geofence, 7-min variance, 5 approved locations cap, reconciliation policy text — partly in template already, partly in `components/evv/*` and `enforce_approved_location_cap` trigger.
- **Requirement phrasing / citations**: "Section 11.3(5)", "Article 10", "Section 1.28" embedded in triggers + nectar copy.
- **Role labels** ("Direct Support Professional", "House Manager"), department structure (agency types, program levels).
- **Required documents**: PCSP annual, BSP quarterly, HRC, fire drill cadence.
- **Respite / ELS caps**: 14-day stay, 21-day annual, 24 units/day, 260 days/year.

Output: a generated `/mnt/documents/utah-inventory.md` artifact (grouped, with file:line refs) + a new `Inventory` tab on the State Profile page that renders the same list from a JSON inventory file checked into `src/lib/state-inventory.ts`. Each item is tagged **config** (extractable) or **structural** (needs a HIVE Exec ticket).

**B. Expanded template schema**

Extend `state_templates` and `StateTemplate` type with the missing sections (kept additive — existing fields untouched):

```
terminology           (existing — add: agency_short, agency_long, medicaid_program_name, role_labels[])
billing_codes         (existing — add: rate, modifier, daily_or_hourly, cap_units/day, cap_units/year)
forms                 (existing — add: schema_ref, ai_extractor_slug)
training              (existing — add: required_for_roles[], grace_days)
evv                   (existing — already has geofence/variance/cap; add: variance_reason_required, reconciliation_required_after_min)
required_documents    (existing)
department_structure  (existing)
+ NEW citations       { section: code, label, url } map for trigger error messages
+ NEW caps            { respite_max_consecutive_days, respite_annual_days, els_daily_units, els_annual_days }
+ NEW regulator       { name_short, name_long, submission_portal_url, incident_deadline_hours }
```

DB migration adds `citations`, `caps`, `regulator` JSONB columns + seeds Utah values.

---

## Phase 2 — Route platform reads through the template

Introduce a single `useStateConfig()` (extending today's `useStateTemplate`) that returns a fully-typed, fallback-safe config object. Then replace hardcoded reads:

- `src/lib/evv-codes.ts`, `service-billing.ts`, `job-codes.ts`, `billing-units.ts`, `variable-rate-codes.ts` → re-export functions that take a `config` arg (or read from a small `StateConfigContext` provider mounted in `dashboard.tsx`). Keep the existing exports as thin compatibility wrappers that read the active state config so call sites don't all change at once.
- Form labels in `dashboard.billing-520.tsx`, `forms-hub-tab.tsx`, etc. read `config.forms` by slug.
- Terminology pulled via `config.terminology.agency_short` etc. wherever DSPD/DHHS strings appear in JSX.
- Trigger error messages stay in SQL (they're structural protection), but the user-facing copy that paraphrases them moves to `config.citations`.

**Server-side**: `useStateConfig` has a server counterpart `getStateConfig(orgId)` used inside `createServerFn` handlers that currently hardcode codes (Form 520 generator, billing rules, NECTAR prompts).

---

## Phase 3 — Utah as the populated reference + clean skeleton

- Seed Utah's `platform_states` + `state_templates` row with every value moved out in phase 2, mirroring today's literals exactly. This is the "do not break Utah" gate: a regression test script (`scripts/verify-utah-parity.ts`) loads Utah's config and asserts the resolved values equal the previous hardcoded constants.
- For all other states in `platform_states`, leave the new fields empty so the State Profile editor surfaces them as "No value yet" prompts.
- Update the State Onboarding wizard (`dashboard.hive-exec.states.$stateCode.onboarding.tsx`) to walk through each new section, so onboarding becomes the expansive flow the spec asks for.

---

## Phase 4 — NECTAR flagging of structural gaps

- Add a small `state_structural_gaps` table (state_code, area, summary, status, created_by, ticket_id).
- In the Inventory tab, items tagged **structural** render a "File HIVE ticket" button that creates a row + a HIVE Exec ticket (reusing existing `hive_tickets`).
- NECTAR Task Center surfaces open structural gaps per state alongside config TODOs.

---

## Technical details

**Files touched (high-level)**

- DB migration: add `citations`, `caps`, `regulator` JSONB to `state_templates`; create `state_structural_gaps`; seed Utah.
- `src/lib/state-templates.ts` — extend `StateTemplate` type + `FALLBACK_TEMPLATE`.
- `src/lib/state-templates.functions.ts` — extend update fns + add `getStateConfig` server helper.
- `src/lib/state-config.ts` (new) — pure resolver: `(template) => StateConfig`.
- `src/hooks/use-state-config.tsx` (new) — wraps `useStateTemplate`, exposes typed accessors.
- `src/lib/evv-codes.ts`, `service-billing.ts`, `job-codes.ts`, `billing-units.ts`, `variable-rate-codes.ts` — switch from module-level constants to functions parameterized by `StateConfig`; keep backward-compatible default exports that read the active config.
- Components: `components/workspace/forms-hub-tab.tsx`, `dashboard.billing-520.tsx`, `dashboard.billing.form520.tsx`, NECTAR copy in `components/nectar/*`, `dashboard.compliance-desk.tsx`, `dashboard.records-desk.tsx` — replace literals with `config.*` reads.
- `dashboard.hive-exec.states.$stateCode.tsx` — new editor sections for `citations`, `caps`, `regulator`, plus an **Inventory** tab.
- `dashboard.hive-exec.states.$stateCode.onboarding.tsx` — extend wizard steps.
- `scripts/verify-utah-parity.ts` — regression script.

**Out of scope (deliberately)**

- Changing DB trigger logic (caps, receipts, deadlines). Triggers stay as-is in phase 1–3; their numeric thresholds will be parameterizable in a follow-up phase that rewrites the trigger to read from `state_templates` (it's a riskier change and deserves its own pass).
- Translating non-English copy.
- Multi-tenant per-provider overrides of state config (already a separate layer per Prompt 47).

---

## Suggested execution order

Because this touches a lot of files, I'd like to ship it as four reviewable PR-sized chunks rather than one mega-change:

1. **Phase 1** — migration + inventory artifact + Inventory tab (no behavior change).
2. **Phase 2a** — terminology + forms (low risk, mostly JSX label swaps).
3. **Phase 2b** — billing/EVV codes + caps (touches more files; gated by the Utah parity script).
4. **Phase 3 + 4** — onboarding wizard expansion + structural-gap flagging.

If you approve the plan I'll start with Phase 1 in the next turn and stop for your review before Phase 2.
