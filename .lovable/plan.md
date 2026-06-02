## Goal

Turn the platform into a true multi-state system where state is a configuration layer (template), not hardcoded logic. Utah/DSPD becomes the first reference state instance instead of the implicit default.

## Scope (Prompt 47)

1. **Data model — state as a first-class entity**
   - New tables (Executive-managed):
     - `platform_states` — one row per US state (code, name, status: `draft` / `active` / `coming_soon`, reference flag for Utah).
     - `state_templates` — the editable configuration blob per state (terminology overrides, training mandates, billing/service-code set, EVV specifics, required document cadences, department names). JSONB sections so we can extend per area without schema churn.
     - `state_requirement_sources` — uploaded authoritative docs per state (mirror of provider Foundation A/B sources: file ref, title, jurisdiction, parse status, derived requirement count, source attribution metadata).
     - `state_derived_requirements` — NECTAR-parsed per-state requirement set with source attribution (parallel to existing `nectar_requirements` but scoped to a state, not an org).
   - Extend `organizations`: add `state_code` (FK to `platform_states.code`) + optional `additional_state_codes text[]` for multi-state providers. Backfill all existing orgs to `UT`.
   - Extend `nectar_requirements` (provider-level) with `inherited_from_state_code` so per-provider requirements can show which ones layered on top of a state baseline.
   - All new tables: GRANTs + RLS (HIVE Executive read/write; authenticated read on `platform_states` + the active state's published template only).

2. **Executive UI — state organization**
   - New sidebar item **States** (HIVE Executive only) → `/dashboard/hive-exec/states`:
     - List of 50 states with status chips (active / draft / coming-soon), provider count per state, last template update.
     - Click into a state → state detail with tabs: **Template**, **Requirements & Sources**, **Providers**.
   - Update HIVE Overview, Companies list, NECTAR queue, Account Health, Support Queue, Plans & Billing to support a **State filter** (All states / single state) so Executives can work across or drill into one state.
   - Reference-state badge on Utah ("Reference implementation").

3. **State template editor (`/dashboard/hive-exec/states/$stateCode`)**
   - Editable sections, each a JSONB slice with sensible defaults pulled from the existing Utah implementation:
     - **Terminology**: department name, role/service display names, regulator label (e.g. DSPD vs equivalent).
     - **Training mandates**: list of required course slugs + cadence + role applicability.
     - **Billing & service codes**: per-state code set (reuses the existing `evv-codes` shape, but the canonical list lives in the template).
     - **EVV specifics**: geofence default radius, variance grace window, reconciliation policy text, approved-locations cap.
     - **Required documents & cadences**: doc types, frequency, who attests.
     - **Department / org structure**: agency types, sub-program naming.
   - Save = versioned write; "Publish" toggles `state_templates.published_at`. Drafts only visible to Executives.
   - Reset-section-to-Utah-defaults button on each section (Utah = canonical reference).

4. **State requirements upload + NECTAR parsing**
   - On the state detail **Requirements & Sources** tab: upload UI mirroring the provider Foundation A/B drop (`authoritative-source-drop` component) but scoped to a state.
   - Server fns:
     - `uploadStateRequirementSource` — stores file, kicks NECTAR parse.
     - `parseStateRequirementSource` — reuses the existing `nectar-engine` parser; writes derived rows into `state_derived_requirements` with `source_id` attribution.
     - `listStateRequirements(stateCode)` — for display.
   - Provider-level requirements engine reads the state baseline first, then layers org-specific overrides on top.

5. **State-aware onboarding**
   - `/dashboard/hive-exec/new-company` (existing route): add the state picker as the first question. Default sensible answers from the chosen state's template (terminology, training, codes, EVV).
   - Then 3–5 simple questions: which authorized service codes from the state's set, which programs, primary contact, etc.
   - On submit:
     - Create the org with `state_code`.
     - Seed provider-level: authorized codes (subset of state codes), training assignments (state mandates), terminology overrides default to inherit, requirements inherit from `state_derived_requirements`.
   - Replace the current Utah-hardcoded onboarding defaults with the lookup against the state template.

6. **State-as-a-layer runtime (no hardcoding)**
   - New hook `useStateTemplate()` that resolves the current org's `state_code` → published `state_templates` row + cached on React Query.
   - Replace hardcoded "DSPD", "Utah", default geofence radius, default training set, and other Utah assumptions in shared components with `template.terminology.*` / `template.evv.*` / `template.training.*` lookups. Keep Utah's published template as the source of those exact values so behavior is unchanged for the existing tenant.
   - Foundation D `jurisdiction` continues to be the source of legal scope; the state template is the operational config layer that drives UI + workflow.

7. **Gating & design**
   - All Executive routes server-gated via `requireSupabaseAuth` + `assertHiveExecutive`.
   - Admin/staff get read-only access to their state's published template via a thin server fn (`getMyStateTemplate`).
   - HIVE design system inside Executive (existing hexagon/amber accents); state list uses the existing card+status-chip pattern.

## Files (new)

- Migration: `platform_states`, `state_templates`, `state_requirement_sources`, `state_derived_requirements`, `organizations.state_code`, `nectar_requirements.inherited_from_state_code`. Seed all 50 states (UT active+reference, others coming-soon). Seed Utah template from existing constants. Backfill all orgs to `UT`.
- `src/lib/state-templates.ts` — TypeScript types for the template JSONB sections + Utah defaults constant (source of seed data).
- `src/lib/state-templates.functions.ts` — list/get/upsert/publish state templates, list/get platform states, get-my-state-template.
- `src/lib/state-requirements.functions.ts` — upload, parse, list state requirement sources & derived requirements.
- `src/hooks/use-state-template.tsx` — React Query hook for current org's published template.
- `src/routes/dashboard.hive-exec.states.tsx` — state list.
- `src/routes/dashboard.hive-exec.states.$stateCode.tsx` — state detail with Template / Requirements / Providers tabs.
- `src/components/hive-exec/state-template-editor.tsx` — the per-section editors.
- `src/components/hive-exec/state-requirement-source-drop.tsx` — wraps the existing authoritative-source drop, scoped to a state.

## Files (edited)

- `src/routes/dashboard.hive-exec.tsx` — add **States** sidebar entry.
- `src/routes/dashboard.hive-exec.new-company.tsx` — state-first onboarding; reads from state template; seeds inherited config on submit.
- `src/routes/dashboard.hive-exec.index.tsx`, `dashboard.hive-exec.health.tsx`, `dashboard.hive-exec.tickets.tsx`, `dashboard.hive-exec.plans.tsx`, `dashboard.hive-exec.nectar.tsx` — add state filter.
- A small number of shared components that hardcode "DSPD" / "Utah" / default geofence — swap to `useStateTemplate()` lookups (Utah template values keep behavior identical).

## Out of scope (this prompt)

- Building the full template content for the other 49 states (the schema + editor make that an Executive content task, not a code task).
- Cross-state migration of an existing provider (Company Migration tool already exists; multi-state move is a follow-up).
- Per-state localization of staff app strings beyond the terminology slice.
