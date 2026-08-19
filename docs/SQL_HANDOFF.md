# SQL Handoff — run these in Lovable's SQL editor

Each block is copy-paste ready. **Clear the editor before pasting each block.**
Run blocks top to bottom; each has a "what you'll see" note so you can confirm
it worked before moving on.

---

## ACTION — Prompt batch 16–28: belongings inventory, doc uploads, UPI attestations, cadence changes, removals (2026-08-13)

**What this is for:** Thirteen product prompts. Only ONE new table is
needed — everything else reuses existing infrastructure:
- Prompt 16 (Personal Belongings Inventory) — UI only, `client_belongings`
  already has the right columns (confirmed via `supabase/migrations/20260524055323_*.sql`).
  The "$50 or more" checkbox is derived from `estimated_value >= 50`, not a
  stored column.
- Prompt 17 (Room and Board Agreement) — reuses `client_documents` +
  `client-documents` bucket via the existing `NectarAsk` upload component,
  document_type `room_board_agreement`. No schema change.
- Prompts 18/19/23 (OL License, OL Certification, USOR Approved Vendor) —
  reuse `nectar_documents` with `owner_kind='company'` and new
  `document_type` values (`ol_residential_license`,
  `ol_residential_certification`, `usor_approved_vendor`); expiration stored
  in the existing `effective_end` column. No schema change.
- Prompts 21/22/23 (UPI + USOR attestations) — new table `upi_attestations`
  below.
- Prompts 20/25 (SEI / CMP-CMS monthly summary UPI reminder cadence) —
  computed client-side from existing `client_progress_summaries` columns
  (`requires_upi_attestation`, `upi_entered_at`, `finalized_at`). No schema
  change.
- Prompt 24 (CMP/CMS quarterly→monthly) — code-only change in
  `src/lib/progress-summaries.ts` (`MONTHLY_SUMMARY_CODES`). No schema
  change, no data touched — forward-looking only.
- Prompts 26/27/28 (remove org-level written-BSP-policy requirement,
  healthcare-access-training checklist item, remediation-plan tracking) —
  grepped `src`, `supabase/migrations`, and this doc for "BSP", "R539-4",
  "remediation", and "primary health care professional" / "health care
  access training"; none of these exist as a checklist item, compliance
  flag, or authoritative-sources requirement anywhere in the codebase today.
  Nothing to remove — treated as already satisfied.

Matches migration `supabase/migrations/20260813110000_prompts_16_28_batch.sql`.

```sql
-- client_id uses the nil UUID (not NULL) for org-level rows (usor_vendor), and
-- period_label uses '' (not NULL) for one-time rows (sei_support_strategies,
-- usor_vendor) so a real composite UNIQUE constraint can back upserts —
-- Postgres treats NULL <> NULL, which would defeat ON CONFLICT dedup.
CREATE TABLE IF NOT EXISTS public.upi_attestations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  kind             text NOT NULL CHECK (kind IN ('sei_employment_monthly', 'sei_support_strategies', 'usor_vendor')),
  period_label     text NOT NULL DEFAULT '',
  attested_at      timestamptz NOT NULL DEFAULT now(),
  attested_by      uuid NOT NULL,
  attested_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind, client_id, period_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upi_attestations TO authenticated;
GRANT ALL ON public.upi_attestations TO service_role;

ALTER TABLE public.upi_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read upi attestations"
  ON public.upi_attestations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage upi attestations"
  ON public.upi_attestations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_upi_attestations_org_kind
  ON public.upi_attestations (organization_id, kind);
```

**What you'll see:** one `CREATE TABLE`, two `GRANT`s, `ALTER TABLE ... ENABLE
ROW LEVEL SECURITY`, two `CREATE POLICY`, one `CREATE INDEX`. Purely
additive — no existing table, column, or row is touched.

---

## ACTION — Prompt batch 2–15: staff attestations, client profile, incidents, HHS/RHS, HRC, deadlines (2026-08-13)

**What this is for:** Twelve product prompts in one pass. New tables:
`client_healthcare_providers` (open-ended provider list, backfilled from the
old fixed PCP/specialist/prescriber columns), `rhs_hospitalization_days`
(RHS non-billable day flag), `rhs_evacuation_drills` (RHS quarterly drill
log). New columns: `hhs_monthly_attendance.away_notes` (required elaboration
when the away category is Hospitalization), `hrc_meetings.minutes_document_path`
/ `minutes_document_name`. New storage bucket `hrc-documents`. Plus two RLS
policies letting a staffer write their own `staff_baseline_training_completions`
/ `document_attestations` row ONLY for the fixed self-attestable key
`sei_benefits_attestation` (SEI Benefits Knowledge Attestation — staff may
complete it themselves; every other baseline training stays admin/manager-only).
The "New Caregiver Compensation Training" (CMP/CMS) and the presence-only
"Grievance Policy — Staff Copy" / "Driving Record" items reuse the existing
baseline-training tables/columns — no schema changes needed for those three.
Everything below is additive. Matches migrations
`supabase/migrations/20260813090000_staff_self_attest_baseline.sql` and
`supabase/migrations/20260813100000_prompts_2_15_batch.sql`.

### 1. Self-attestable baseline training carve-out

```sql
CREATE POLICY "baseline self attestation write"
  ON public.staff_baseline_training_completions
  FOR ALL
  TO authenticated
  USING (staff_id = auth.uid() AND training_key IN ('sei_benefits_attestation'))
  WITH CHECK (staff_id = auth.uid() AND training_key IN ('sei_benefits_attestation'));

CREATE POLICY "doc_attest_insert_self_attest_baseline"
  ON public.document_attestations
  FOR INSERT
  WITH CHECK (
    staff_id = auth.uid()
    AND subject_kind = 'baseline_cert'
    AND subject_ref IN ('sei_benefits_attestation')
    AND attested_by = auth.uid()
  );
```

**What you'll see:** "Success. No rows returned." No existing rows change —
this only widens who may write a row for one specific training key.

### 2. Healthcare providers, RHS hospitalization, RHS drills, HRC meeting docs

Paste the full contents of
`supabase/migrations/20260813100000_prompts_2_15_batch.sql` from the repo —
it's long (new tables + RLS + a guarded one-time backfill of the old
PCP/specialist/prescriber columns into the new provider-list rows) so it
isn't duplicated here to avoid drift. Run it as one block.

**What you'll see:** several `CREATE TABLE`, `CREATE POLICY`, `CREATE INDEX`,
two `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, one `INSERT INTO
storage.buckets ... ON CONFLICT DO NOTHING`, and three guarded backfill
`INSERT`s (only fire for clients that have a non-null legacy PCP/specialist
/prescriber name and don't already have that provider-type row). No existing
column or row is dropped or overwritten.

---

## ACTION — Correction: shift-note attestation columns belong on `evv_timesheets`, not `general_shifts` (2026-08-11)

**What this is for:** Section 4 below (still present, unchanged, for history)
added `nectar_raw_input` / `nectar_attestation_id` to `public.general_shifts`
on the assumption that table was "the shift documentation table." That's
wrong: `general_shifts` only tracks non-client Training/Admin/Travel/Meeting
time (a free-text `note` column that NECTAR never expands). The actual shift
note NECTAR expands from shorthand — the one that now gets paragraph-level
staff attestation before submit — is `public.evv_timesheets.shift_note_text`
(`src/components/evv/punch-pad.tsx` → `draftShiftNote` in
`src/lib/ai-coach.functions.ts`). This adds the same two columns there.
The `general_shifts` columns are left as-is (unused, harmless) — additive
only, nothing dropped. Matches migration
`supabase/migrations/20260811220000_shift_note_attestation_columns.sql`.

```sql
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS nectar_raw_input text,
  ADD COLUMN IF NOT EXISTS nectar_attestation_id uuid REFERENCES public.nectar_attestations(id);
```

**What you'll see:** "Success. No rows returned." Both columns are nullable,
so existing rows are unaffected.

---

## ACTION — Authoritative Sources compliance overhaul: new columns + `nectar_compliance_instances` (2026-08-11)

**What this is for:** Foundation for the compliance overhaul — each
`nectar_requirements` row gains verification metadata (internal vs.
external, how it's checked, its recurrence pattern, a plain-language
explanation, and an optional link into the feature that produces its
evidence), a new `nectar_compliance_instances` table tracks each concrete
occurrence of a requirement coming due and being resolved, and
`nectar_attestations` gains columns to link an attestation back to the
instance it resolves and to record the staff's raw input alongside
Nectar's expanded version. Additive only — no existing column, table, or
row is changed except the one backfill in step 5, which only sets a new
column's value. Matches migration
`supabase/migrations/20260811090000_add_compliance_overhaul_columns.sql`
in the repo (schema-only, steps 1–4) — run these against the live DB since
migrations here don't auto-apply there.

RLS on the new table follows this repo's standard org-scoping helpers
(`is_org_member` / `is_org_admin_or_manager`) rather than inlined
subqueries, to match every other org-data table.

### 1. `nectar_requirements` — verification + evidence columns

```sql
ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS verification_type text
    CHECK (verification_type IN ('internal','external')) DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS verification_type_source text
    CHECK (verification_type_source IN ('auto_regex','auto_ai','manual_override'))
    DEFAULT 'auto_regex',
  ADD COLUMN IF NOT EXISTS compliance_pattern text
    CHECK (compliance_pattern IN
      ('one_time','renewal','event_driven','ongoing_per_shift','continuous')),
  ADD COLUMN IF NOT EXISTS plain_language_explanation text,
  ADD COLUMN IF NOT EXISTS evidence_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_link jsonb;
```

`feature_link`, when set, is shaped:

```
{ "feature": "incidents" | "shift_notes" | "summaries" | "emar" | "forms" | "pcsp",
  "create_new_label": string,
  "view_existing_label": string,
  "report_route": string }
```

**What you'll see:** "Success. No rows returned." All six columns are
additive with defaults (or nullable), so existing rows are unaffected.

---

### 2. `nectar_compliance_instances` table

```sql
CREATE TABLE IF NOT EXISTS public.nectar_compliance_instances (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id)       ON DELETE CASCADE,
  requirement_id   uuid        NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  triggered_by_id  uuid,
  triggered_by_kind text       CHECK (triggered_by_kind IN
                                 ('incident','shift','client_assignment','authorization','period','manual')),
  triggered_at     timestamptz NOT NULL DEFAULT now(),
  deadline_at      timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','resolved','overdue')),
  resolved_at      timestamptz,
  resolved_by      uuid        REFERENCES public.profiles(id),
  resolved_via     text        CHECK (resolved_via IN ('auto','attestation','upload','both')),
  resolution_note  text,
  external_reference text,
  attestation_id   uuid        REFERENCES public.nectar_attestations(id),
  document_url     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_compliance_instances TO authenticated;
GRANT ALL                            ON public.nectar_compliance_instances TO service_role;

ALTER TABLE public.nectar_compliance_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nci_read" ON public.nectar_compliance_instances
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "nci_write" ON public.nectar_compliance_instances
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_compliance_instances_org    ON public.nectar_compliance_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_instances_req    ON public.nectar_compliance_instances(requirement_id);
CREATE INDEX IF NOT EXISTS idx_compliance_instances_status ON public.nectar_compliance_instances(status);
```

**What you'll see:** `CREATE TABLE`, two `GRANT`, `ALTER TABLE`, two
`CREATE POLICY`, three `CREATE INDEX`.

**Note on write access:** only admins/managers can write directly per
`nci_write`, matching every other org-data table's pattern in this repo.
If staff-initiated shift/incident triggers need to insert rows themselves
(not just Nectar backend code running as service_role), say so and we'll
add a narrower staff-insert policy scoped to `triggered_by_kind` values
they're allowed to originate.

---

### 3. `nectar_attestations` — link to instances + raw/expanded input

```sql
ALTER TABLE public.nectar_attestations
  ADD COLUMN IF NOT EXISTS covers_instance_id uuid REFERENCES public.nectar_compliance_instances(id),
  ADD COLUMN IF NOT EXISTS original_staff_input text,
  ADD COLUMN IF NOT EXISTS nectar_expanded_output text,
  ADD COLUMN IF NOT EXISTS input_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS covers_staff_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS covers_client_id uuid REFERENCES public.clients(id);
```

**What you'll see:** "Success. No rows returned." All six columns are
nullable, so existing rows are unaffected.

---

### 4. Shift documentation table — link to attestations

Confirmed from `src/hooks/use-general-shift.tsx` (reads/writes
`.from("general_shifts")`, with a `note` column staff type into at
clock-out) that **`general_shifts`** is the shift-documentation table —
no placeholder substitution needed.

```sql
ALTER TABLE public.general_shifts
  ADD COLUMN IF NOT EXISTS nectar_raw_input text,
  ADD COLUMN IF NOT EXISTS nectar_attestation_id uuid REFERENCES public.nectar_attestations(id);
```

**What you'll see:** "Success. No rows returned." Both columns are
nullable, so existing rows are unaffected.

---

### 5. Backfill `evidence_registered` for known requirements

One-time data backfill on production organizations only (`is_demo =
false`) — run this last, after step 1 has added the column.

```sql
UPDATE public.nectar_requirements
SET evidence_registered = true
WHERE requirement_key IN (
  'background_screening','oig_exclusion','medicaid_disclosure',
  'shift_note','quarterly_summary','pcsp','incident_report',
  'cpr_first_aid','thirty_day_training','annual_training','fraud_exclusion'
)
AND organization_id IN (
  SELECT id FROM public.organizations WHERE is_demo = false
);
```

**What you'll see:** "Success. N rows updated" where N is however many
matching requirement rows exist across non-demo orgs today (0 is a valid
answer if none of those `requirement_key` values exist yet for any org).

---

## ACTION — Add profiles.custom_attributes for org-defined staff intake fields (2026-08-10)

**What this is for:** The add-employee dialog now collects org-defined custom
fields (configured in Settings → Staff fields, stored in
`organizations.feature_config.staff_intake_fields.custom_fields`). Their
values need a home on the staff profile. Rather than the separate
`custom_field_definitions`/`custom_field_values` system (a different,
unrelated feature), these values are stored directly on `profiles` in a
`custom_attributes` jsonb column, keyed by the field's **name** (not a
definition-table id) so the two systems never need to reconcile ids.

**Run this:**

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
```

**What you'll see:** "Success. No rows returned." The column is additive and
defaults to `{}`, so existing rows are unaffected. This matches migration
`supabase/migrations/20260810120000_add_profiles_custom_attributes.sql` in
the repo — run it once against the live DB since migrations here don't
auto-apply there.

---

## DIAGNOSTIC — Staff missing hire_date (2026-08-09)

**What this is for:** Staff imported via Smart Import may have `null` hire_date,
causing "no_hire_date" status across all their compliance checklist requirements.
Run this diagnostic to find affected staff in production orgs (non-demo only).
Report back the row count before taking any action.

**Step 1 — Find staff with no hire_date or start_date:**

```sql
SELECT
  p.id,
  p.full_name,
  p.hire_date,
  p.start_date,
  string_agg(om.role, ', ') AS roles
FROM public.profiles p
JOIN public.organization_members om ON om.user_id = p.id
JOIN public.organizations org ON org.id = om.organization_id
WHERE org.is_demo = false
  AND p.hire_date IS NULL
  AND p.start_date IS NULL
  AND om.role IN ('staff', 'admin', 'manager')
GROUP BY p.id, p.full_name, p.hire_date, p.start_date
ORDER BY p.full_name;
```

**What you'll see:** One row per staff member with no hire_date and no start_date
in a non-demo org. If 0 rows → no action needed. If rows exist → run Step 2.

**Step 2 — Check Smart Import provenance for a hire_date/start_date field write
(only run if Step 1 returns rows):**

`import_subjects` does not store the raw parsed field values itself — provenance
of which imported document/subject wrote which field on which target record is
tracked separately in `import_field_provenance` (target_table, target_field,
target_record_id, source_document_id, source_snippet). Use it to find whether
an import ever attempted to set hire_date/start_date on these profiles (e.g. a
document had the value but it failed validation and was dropped, or the value
lives in a source document we can point the admin to).

```sql
SELECT
  p.id AS profile_id,
  p.full_name,
  ifp.target_field,
  ifp.source_snippet,
  ifp.provenance,
  ifp.created_at AS import_captured_at
FROM public.profiles p
JOIN public.organization_members om ON om.user_id = p.id
JOIN public.organizations org ON org.id = om.organization_id
JOIN public.import_field_provenance ifp
  ON ifp.target_table = 'profiles'
  AND ifp.target_record_id = p.id::text
  AND ifp.target_field IN ('hire_date', 'start_date')
WHERE org.is_demo = false
  AND p.hire_date IS NULL
  AND p.start_date IS NULL
  AND om.role IN ('staff', 'admin', 'manager')
ORDER BY p.full_name;
```

**What you'll see:** Rows only exist if an import actually tried to write
hire_date/start_date for one of these staff. `source_snippet` shows the raw
text the value came from (e.g. a scanned onboarding form), which the admin can
use to manually confirm and enter the correct date on the profile.

**If Step 2 returns 0 rows:** No import ever captured a hire date for these
staff — there is nothing to backfill programmatically. Do NOT auto-populate
with today's date, since that would incorrectly mark tenured staff as
pre-tenure. Instead, flag these staff for the admin to enter hire_date
manually. The list from Step 1 is the flag list — hand it to the admin as-is
(their compliance checklist already shows "No hire date set" for each one via
the annual_12h row, per item 6 of the compliance workflow build).

---

## -2. Provider policy / procedure acknowledgments (2026-07-23)

**What this is for:** Authoritative Sources gets a new document kind,
"Provider policy / procedure" — the agency's own internal policies (handbook
sections, procedures), as opposed to state/contract requirements. Unlike
other kinds, NECTAR doesn't mine state-compliance obligations out of these;
it summarizes "what staff must know/do" instead. Optionally, an admin can
require staff to read and **sign** a policy (typed-name e-signature, same
pattern as training completions), including gating app access at next login
until they sign. This block adds the four config columns on
`nectar_documents` and a new `policy_signatures` table that holds the real
signed attestation records — modeled exactly on `training_completions`.

Run this whole block in one paste (it's four statements: one `ALTER TABLE`,
one `CREATE TABLE`, grants, and RLS policies).

```sql
-- 1) Per-document policy config (only meaningful when
--    nectar_documents.authoritative_kind = 'provider_policy').
ALTER TABLE public.nectar_documents
  ADD COLUMN IF NOT EXISTS requires_acknowledgment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_assigned_groups  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_assigned_users    uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_ack_cadence       text    NOT NULL DEFAULT 'one_time'
    CHECK (policy_ack_cadence IN ('one_time', 'annual', 'every_2_years')),
  ADD COLUMN IF NOT EXISTS gate_app_access          boolean NOT NULL DEFAULT false;

-- 2) policy_signatures — one row per staff signature event. Never deleted;
--    a new policy version that requires re-acknowledgment archives old rows
--    (is_current = false, archived_at = now()) rather than removing them.
CREATE TABLE public.policy_signatures (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id)     ON DELETE CASCADE,
  document_id          uuid        NOT NULL REFERENCES public.nectar_documents(id)  ON DELETE CASCADE,
  document_version     int         NOT NULL,
  user_id              uuid        NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  signer_full_name     text,
  signer_email         text,
  typed_signature      text        NOT NULL,
  attestation_statement text,
  consent_statement    text,
  consent_accepted     boolean     NOT NULL DEFAULT true,
  content_version      text,
  content_hash         text,
  ip_address           text,
  user_agent           text,
  time_zone            text,
  signed_at            timestamptz NOT NULL DEFAULT now(),
  is_current           boolean     NOT NULL DEFAULT true,
  archived_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.policy_signatures TO authenticated;
GRANT ALL                    ON public.policy_signatures TO service_role;

ALTER TABLE public.policy_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy_signatures_select_own" ON public.policy_signatures
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "policy_signatures_select_admin" ON public.policy_signatures
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "policy_signatures_insert_own" ON public.policy_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "policy_signatures_update_admin" ON public.policy_signatures
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX idx_policy_signatures_org           ON public.policy_signatures(organization_id);
CREATE INDEX idx_policy_signatures_doc_current    ON public.policy_signatures(document_id, is_current);
CREATE INDEX idx_policy_signatures_user_current   ON public.policy_signatures(user_id, is_current);
```

**What you'll see:** `ALTER TABLE`, then `CREATE TABLE`, two `GRANT`, `ALTER
TABLE` (RLS enable), four `CREATE POLICY`, three `CREATE INDEX` — no rows
returned, no errors. Existing `nectar_documents` rows all get
`requires_acknowledgment = false` / `gate_app_access = false` / empty
assignment arrays / `policy_ack_cadence = 'one_time'`, so nothing starts
gating anyone until an admin explicitly turns it on for a specific policy
document.

**Verify:**

```sql
select string_agg(column_name, ', ' order by column_name)
from information_schema.columns
where table_schema = 'public' and table_name = 'nectar_documents'
  and column_name in ('requires_acknowledgment','policy_assigned_groups','policy_assigned_users','policy_ack_cadence','gate_app_access');
```

**What you'll see:** exactly `gate_app_access, policy_ack_cadence,
policy_assigned_groups, policy_assigned_users, requires_acknowledgment` (all
five, comma-separated, alphabetical).

**Note for the human:** `src/integrations/supabase/types.ts` was hand-edited
to add the `policy_signatures` table and the four new `nectar_documents`
columns ahead of this migration landing, so the app can build/type-check
before you run the SQL above. Once you run it and regenerate types from the
live DB, the two should match — diff them if you want to confirm, but no
action is required unless they've drifted.

---

## -1. De-escalation / ABI training now defaults to Required (2026-07-21)

De-escalation and ABI training requirements are no longer auto-detected from
a staffer's client caseload — they're now a plain, explicit Required / Exempt
setting the provider sets per staff member (onboarding + employee profile).
Every staffer must default to **Required** until an admin deliberately
reviews them and marks them Exempt. The `requires_deescalation` /
`requires_abi` columns already exist (added 2026-06-21) but defaulted to
`false` under the old "add an extra requirement on top of auto-detection"
model — that default no longer means anything now that auto-detection is
gone, so every existing row needs to be corrected to `true`.

```sql
ALTER TABLE public.profiles
  ALTER COLUMN requires_deescalation SET DEFAULT true,
  ALTER COLUMN requires_abi SET DEFAULT true;

UPDATE public.profiles
  SET requires_deescalation = true, requires_abi = true;
```

**What you'll see:** `ALTER TABLE`, then `UPDATE` with the total row count in
`profiles`. Every staffer is now flagged Required for both trainings; admins
revisit this per-staffer from the employee edit screen or new-hire form going
forward.

---

## 0. Add `phone` column to `profiles` (Employee Profile v2 — 2026-06-23)

Required for the contact card edit mode on the employee profile page.

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
```

**What you'll see:** `ALTER TABLE` — no rows changed. Column is nullable; existing rows are unaffected.

---

## 1. Locations cleanup — rebuild `locations` from `teams` (revised 2026-06-11)

`locations` was polluted with staff-role labels (DSP / House Manager / Lead /
Supervisor). Homes live in `teams`; this wipes `locations` only and rebuilds it
from real teams. **`home_designations` is NOT touched** — that table powers the
Homes & Teams care-team label picker, and its DSP / House Manager / Lead /
Supervisor rows are its legitimate data.

> **Note:** you may have already run an earlier cleanup. Run block **1b**
> (verify) first — if it already returns exactly `Maple House [residential]`,
> skip block 1a and go to section 2 (designation repair check).

### 1a. Cleanup + rebuild (locations only)

```sql
delete from public.locations;

insert into public.locations (organization_id, name, type, address, active)
select
  t.organization_id,
  t.team_name,
  case
    when lower(coalesce(t.setting, '') || ' ' || coalesce(t.team_type, '')) like '%host%'    then 'host_home'
    when lower(coalesce(t.setting, '') || ' ' || coalesce(t.team_type, '')) like '%day%'     then 'day_site'
    when lower(coalesce(t.setting, '') || ' ' || coalesce(t.team_type, '')) like '%communi%' then 'community'
    else 'residential'
  end,
  t.address,
  true
from public.teams t
where coalesce(t.active, true) = true;
```

**What you'll see:** "Success" with a few rows affected. Any coverage
requirements attached to the old (junk) locations are removed with them;
re-enter coverage rules against the real homes afterwards.

### 1b. Verify locations

```sql
select string_agg(name || ' [' || type || ']', ', ' order by name) from public.locations;
```

**What you'll see:** exactly `Maple House [residential]` (one row, one home).
If you add more homes in Homes & Teams, they'll appear here automatically —
the app mirrors every team into `locations` on create/edit.

---

## 2. Care-team designations repair (only if an earlier cleanup deleted them)

An earlier version of this handoff wrongly deleted `home_designations`. Check
whether the four care-team labels are still there:

### 2a. Check

```sql
select count(*) from public.home_designations;
```

**What you'll see:** a number. If it's **greater than 0**, the labels survived —
**skip 2b**. If it's **0**, run 2b to re-seed them.

### 2b. Re-seed the four care-team labels for every organization

```sql
insert into public.home_designations (organization_id, label, sort)
select o.id, v.label, v.sort
from public.organizations o
cross join (values ('House Manager', 10), ('Lead', 20), ('Supervisor', 30), ('DSP', 40)) as v(label, sort)
on conflict (organization_id, label) do nothing;
```

**What you'll see:** "Success" with 4 rows per organization inserted. The
Homes & Teams care-team picker will offer House Manager / Lead / Supervisor /
DSP again.

---

## 3. ELS display name fix in the live service catalog (one-line)

The repo's seed now says "Extended Living Supports", but your live
`service_codes` rows were seeded earlier with the old name. This renames them
so the Service Code Registry screen shows the right label:

```sql
update public.service_codes set name = 'Extended Living Supports' where code = 'ELS';
```

**What you'll see:** "Success" (one row per organization). Settings → Service
Code Registry → ELS now reads "Extended Living Supports".

---

## 4. One-time UI-hint dismissals (HHS clarity pass, 2026-06-11)

Per-user, localStorage-free dismissal of one-time hints (currently the HHS
host-home explainer banner). Mirrors the existing `user_celebration_mute`
pattern: a tiny table keyed off the auth user, user-owned RLS. The banner
self-hides in-session if this table is missing, so it is safe to run later —
but until it exists, a dismissal won't survive a page reload.

```sql
create table if not exists public.user_ui_dismissals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  pref_key    text not null,
  dismissed_at timestamptz not null default now(),
  unique (user_id, pref_key)
);

grant select, insert, update, delete on public.user_ui_dismissals to authenticated;
grant all on public.user_ui_dismissals to service_role;

alter table public.user_ui_dismissals enable row level security;

create policy "users read own ui dismissals"
  on public.user_ui_dismissals for select to authenticated
  using (user_id = auth.uid());

create policy "users write own ui dismissals"
  on public.user_ui_dismissals for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

**What you'll see:** "Success". After this runs, dismissing the amber "How host
homes (HHS) work" banner keeps it gone for that user across reloads/devices.

---

## 5. HHS monthly attendance certifications (HHS clarity pass, 2026-06-11)

Month-end sign-off for an HHS client's attendance roll-up. Org-scoped, stores
the signer + timestamp + a snapshot of the month's counts. Until this table
exists, the HHS hub's "Certify month" button is disabled with a "Pending
database update" tooltip and the Monthly Attendance tab still renders.

```sql
create table if not exists public.hhs_monthly_certifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  month           date not null,            -- first of the certified month (YYYY-MM-01)
  present_days    integer not null default 0,
  away_days       integer not null default 0,
  blocked_days    integer not null default 0,
  certified_by    uuid not null references auth.users(id),
  certified_at    timestamptz not null default now(),
  unique (organization_id, client_id, month)
);

grant select, insert, update, delete on public.hhs_monthly_certifications to authenticated;
grant all on public.hhs_monthly_certifications to service_role;

alter table public.hhs_monthly_certifications enable row level security;

-- Org members may read their org's certifications.
create policy "org members read hhs certifications"
  on public.hhs_monthly_certifications for select to authenticated
  using (public.is_org_member(organization_id, auth.uid()));

-- Only admins/managers may write (matches the in-app gate).
create policy "org managers write hhs certifications"
  on public.hhs_monthly_certifications for all to authenticated
  using (public.is_org_admin_or_manager(organization_id, auth.uid()))
  with check (public.is_org_admin_or_manager(organization_id, auth.uid()));
```

**What you'll see:** "Success". The HHS hub → Monthly Attendance → "Certify
month" button becomes enabled for admins/managers; certifying stores the
snapshot and the tab then shows "Certified by … on … · N present / N away /
N unbillable". Uncertified past months show an amber "Needs certification" chip.

---

## 6. Shift medication observation attestations (2026-06-16)

Before staff finalize clock-out (EVV punch-pad) and before host homes submit
the daily progress note, the app forces a Yes/No attestation that they
observed and supported the client with self-administration of their active
medications during the shift / day. This new table is the per-shift /
per-daily-note audit record.

Until this table exists, the in-app attestation card auto-renders an amber
"Pending database update — attestation will resume once the table is created"
banner and **does not block submit**, so existing clock-out and daily-note
flows keep working. After this SQL runs, the attestation becomes a hard
prerequisite for any client who has at least one active medication on file.

```sql
create table if not exists public.shift_medication_attestations (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  client_id              uuid not null references public.clients(id) on delete cascade,
  staff_id               uuid not null references auth.users(id) on delete restrict,

  -- Exactly one of these is set; the other stays NULL.
  shift_id               uuid references public.evv_timesheets(id) on delete set null,
  hhs_daily_record_id    uuid,  -- nullable, no FK (hhs_daily_records is via view in some tenants)

  observed               boolean not null,
  reason                 text,                 -- required when observed=false
  signature_data_url     text not null,        -- staff signature
  attested_at            timestamptz not null default now(),

  shift_window_start     timestamptz not null,
  shift_window_end       timestamptz not null,

  created_at             timestamptz not null default now()
);

-- One attestation per (client, shift) or per (client, hhs_daily_record_id).
create unique index if not exists shift_med_attest_per_shift
  on public.shift_medication_attestations (client_id, shift_id)
  where shift_id is not null;
create unique index if not exists shift_med_attest_per_daily_record
  on public.shift_medication_attestations (client_id, hhs_daily_record_id)
  where hhs_daily_record_id is not null;

grant select, insert ON public.shift_medication_attestations to authenticated;
grant all on public.shift_medication_attestations to service_role;

alter table public.shift_medication_attestations enable row level security;

-- Staff can insert their own attestations within an org they belong to.
create policy "staff insert own med attestations"
  on public.shift_medication_attestations
  for insert to authenticated
  with check (
    staff_id = auth.uid()
    and public.is_org_member(organization_id, auth.uid())
  );

-- Staff can read their own; org admins/managers (and Hive execs) can read all in org.
create policy "read own or org-admin med attestations"
  on public.shift_medication_attestations
  for select to authenticated
  using (
    staff_id = auth.uid()
    or public.is_org_admin_or_manager(organization_id, auth.uid())
    or public.is_hive_executive(auth.uid())
  );
```

**What you'll see:** "Success". The Clock-Out form (EVV) and the HHS Daily
Note form both gain a new "Medication observation" card. If the client has
active medications, the staff member must answer Yes/No, log any unlogged
scheduled passes (Yes path), or enter a reason (No path), then sign and
attest before submitting. Without active medications, the card stays hidden.

---

## Rename existing Person-Centered Profile section title → "Person-Centered Thinking"

New rows already use the new label; existing rows have stale `content.sections[].title = 'Person-Centered Profile'` and stale body wording. Run once:

```sql
UPDATE client_specific_trainings
SET content = jsonb_set(
  jsonb_set(
    content,
    '{sections,0,title}',
    '"Person-Centered Thinking"'::jsonb,
    false
  ),
  '{sections,0,items,0,value}',
  '"Complete this Person-Centered Thinking profile WITH the person (and/or those who know them best). Answer each question in their own words wherever possible."'::jsonb,
  false
)
WHERE training_type = 'person_centered'
  AND content #>> '{sections,0,title}' = 'Person-Centered Profile';
```

---

## MCP full-access support — `mcp_exec_read_sql` + catalog views (2026-07-05)

Powers the `sql_query` and `list_tables` MCP tools so Claude (and any other MCP
client connected to HIVE) can run ad-hoc read-only SQL and discover schema.
The RPC is `SECURITY INVOKER`, so row-level security still applies as the
signed-in HIVE user — no privilege escalation.

```sql
-- Read-only SQL executor: only SELECT / WITH, single statement, RLS enforced.
create or replace function public.mcp_exec_read_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  trimmed text := regexp_replace(query, ';+\s*$', '');
  result  jsonb;
begin
  if trimmed !~* '^\s*(select|with)\b' then
    raise exception 'Only SELECT or WITH queries are allowed';
  end if;
  if trimmed ~ ';\s*\S' then
    raise exception 'Multiple statements are not allowed';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', trimmed)
    into result;
  return result;
end;
$$;

revoke all on function public.mcp_exec_read_sql(text) from public;
grant execute on function public.mcp_exec_read_sql(text) to authenticated;

-- Schema discovery views for `list_tables`.
create or replace view public.mcp_table_catalog
with (security_invoker = on) as
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

create or replace view public.mcp_column_catalog
with (security_invoker = on) as
select table_name, column_name, data_type, is_nullable, ordinal_position
from information_schema.columns
where table_schema = 'public';

grant select on public.mcp_table_catalog  to authenticated;
grant select on public.mcp_column_catalog to authenticated;
```

**What you'll see:** `CREATE FUNCTION`, `REVOKE`, `GRANT`, two `CREATE VIEW`,
two more `GRANT`. After this, `sql_query` and `list_tables` in Claude work.

---

## 8. `client_target_behaviors` table (Target Behaviors feature — 2026-07-17)

Stores the per-client list of named target behaviors that admins define in the
Care Plan > Target Behaviors tab. Staff see this list in the clock-out behavior
observations form.

```sql
CREATE TABLE public.client_target_behaviors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  behavior_name   text        NOT NULL CHECK (char_length(behavior_name) BETWEEN 1 AND 200),
  description     text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_target_behaviors TO authenticated;
GRANT ALL                            ON public.client_target_behaviors TO service_role;

ALTER TABLE public.client_target_behaviors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctb_read" ON public.client_target_behaviors
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "ctb_write" ON public.client_target_behaviors
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_ctb_updated
  BEFORE UPDATE ON public.client_target_behaviors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ctb_client ON public.client_target_behaviors(client_id);
CREATE INDEX idx_ctb_org    ON public.client_target_behaviors(organization_id);
```

**What you'll see:** `CREATE TABLE`, two `GRANT`, `ALTER TABLE`, two
`CREATE POLICY`, `CREATE TRIGGER`, two `CREATE INDEX`.

---

## 9. GPS-bypass columns on `evv_timesheets` (EVV GPS-unavailable fallback — 2026-07-21)

Utah's UEVV rule accepts either GPS coordinates OR a street address + city for
both the begin and end of a visit — GPS is not mandatory. Today, when GPS
can't be captured on an EVV-locked code, staff can (clock-in) or previously
could NOT (clock-out) proceed by confirming a reason; the EVV record then
falls back to the client's on-file address for location evidence. These
columns let admins see, distinctly from a geofence out-of-bounds variance,
that a punch used this fallback.

```sql
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS gps_in_bypassed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_in_bypass_reason text,
  ADD COLUMN IF NOT EXISTS gps_out_bypassed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_out_bypass_reason text;
```

**What you'll see:** one `ALTER TABLE` adding four columns.

---

## 10. Manager notes, manual timesheet entries, and admin-on-behalf inserts on `evv_timesheets` (Records detail view — 2026-07-21)

Supports the Documentation > Records detail/edit view: (a) a manager/admin-only
note field kept fully separate from the caregiver's own `shift_note_text` —
never merged, never overwritten by one another; (b) a `Manual_Entry` marker on
`shift_entry_type` so a record entered by hand (missed clock-in/out, or an
admin adding one on a staff member's behalf) is never confused with a normal
EVV punch; (c) an INSERT policy letting an admin/manager create a timesheet
row for another staff member (today only `staff_id = auth.uid()` may insert —
see policy `"staff insert own evv"`). Editor/timestamp tracking for edits and
manual entries reuses the existing (previously unpopulated) `edited_by` /
`edited_at` / `edited_by_admin_name` / `is_edited_by_admin` columns — no new
columns needed for that part.

```sql
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS manager_note_text    text,
  ADD COLUMN IF NOT EXISTS manager_note_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_note_by_name text,
  ADD COLUMN IF NOT EXISTS manager_note_at      timestamptz;

ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_shift_entry_type_check;
ALTER TABLE public.evv_timesheets ADD CONSTRAINT evv_timesheets_shift_entry_type_check
  CHECK (shift_entry_type = ANY (ARRAY[
    'Client_Profile_Pass'::text,
    'General_Sidebar_Unscheduled'::text,
    'Day_Program_Attendance'::text,
    'Historical_Import'::text,
    'Manual_Entry'::text
  ]));

CREATE POLICY "admin insert evv for staff"
  ON public.evv_timesheets FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
```

**What you'll see:** one `ALTER TABLE` adding four columns, `DROP CONSTRAINT` /
`ADD CONSTRAINT` on the `shift_entry_type` check, and one `CREATE POLICY`. No
rows are changed by this block.

---

## 11. Simplify incident closing — single "Submit to UPI" action (2026-07-23)

Per SOW §1.27, closing an incident only requires: initiate the UPI entry
within 24 hours (UPI notifies the Support Coordinator automatically), notify
the guardian within 24 hours, and complete the detailed UPI report within 5
business days. The app previously tracked these as three separate signed
attestations plus a separate "Log SC update" attestation. All four are now
one signed "Submit to UPI" action, done once, that also asks a simple
guardian question (contacted vs. self-guardian/not applicable) instead of
depending on the client's `is_own_guardian` flag. "Log SC information
request" (with its own 5-business-day clock) is also gone — it's now a plain
optional `followup_notes` field that never blocks closing.

```sql
ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS upi_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS upi_submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS upi_submitted_attestation_text text,
  ADD COLUMN IF NOT EXISTS upi_submitted_signed_name text,
  ADD COLUMN IF NOT EXISTS upi_submitted_signed_title text,
  ADD COLUMN IF NOT EXISTS guardian_notified_details text;
```

**What you'll see:** one `ALTER TABLE` adding six columns. No rows changed.
The old per-duty columns (`upi_initiated_*`, `upi_completed_*`,
`guardian_attestation_text`, `guardian_signed_*`, `sc_update_*`) and the
`incident_sc_requests` table are left in place untouched — the app simply
stops reading/writing them going forward, so no existing data is lost.
Incidents that were already closed under the old three-timestamp rule keep
their `State_Confirmed` status; only new closes go through the combined
action.

---

## 12. Populate `profiles.first_name`/`last_name` at signup + backfill existing NULLs (2026-07-23)

`handle_new_user()` (the trigger that fires on every signup) has only ever
inserted `id, email, full_name, agency_name` into `profiles` — `first_name`/
`last_name` were added later as plain nullable columns and the trigger was
never updated to populate them. Every account created via signup therefore
has permanently NULL `first_name`/`last_name` unless an admin manually edited
the profile afterward. This is why some staff show up as a truncated user ID
(e.g. `a3f9c1b2`) instead of a name in displays like the incident "Discovered
by" line. No signup path in the app (main signup form, admin-invited exec
accounts, auditor provisioning) ever passes separate first/last-name fields
in `raw_user_meta_data` — only a single combined `full_name` — so this splits
`full_name` on the first space: everything before it becomes `first_name`,
everything after becomes `last_name` (NULL if there's no space at all). The
one exception, `createEmployeeManually` (manual-admin-created staff), already
writes correct `first_name`/`last_name` directly right after the trigger
fires, so it's unaffected either way.

**This is a best-effort split, not a guarantee of correctness** — a
`full_name` like "Mary Jane Smith" becomes first_name "Mary", last_name "Jane
Smith"; "Jean-Paul Martinez" splits cleanly (no space in "Jean-Paul") but a
single-token name like an email-local-part fallback (e.g. "jdoe123") becomes
first_name "jdoe123", last_name NULL. Block 12b below flags every row whose
`full_name` isn't exactly two words so you can hand-correct the ones that
matter.

### 12a. Update the trigger (fixes all future signups)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_space_pos INT;
BEGIN
  v_full_name := NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), '');
  IF v_full_name IS NOT NULL THEN
    v_space_pos := position(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := btrim(substring(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name := NULLIF(btrim(substring(v_full_name FROM v_space_pos + 1)), '');
    ELSE
      v_first_name := v_full_name;
      v_last_name := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, agency_name, first_name, last_name)
  VALUES (NEW.id, NEW.email, v_full_name, NEW.raw_user_meta_data->>'agency_name', v_first_name, v_last_name)
  ON CONFLICT (id) DO NOTHING;

  org_name := COALESCE(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 1) || '''s workspace');

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (org_name, lower(regexp_replace(org_name || '-' || substr(NEW.id::text, 1, 6), '[^a-z0-9]+', '-', 'g')), NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$;
```

**What you'll see:** `CREATE FUNCTION`. No rows change — this only affects
signups from this point forward.

### 12b. Backfill existing profiles where `first_name` is NULL

```sql
WITH split AS (
  SELECT
    id,
    btrim(full_name) AS fn,
    position(' ' IN btrim(full_name)) AS sp
  FROM public.profiles
  WHERE first_name IS NULL
    AND full_name IS NOT NULL
    AND btrim(full_name) <> ''
)
UPDATE public.profiles p
SET
  first_name = CASE WHEN s.sp > 0 THEN btrim(substring(s.fn FROM 1 FOR s.sp - 1)) ELSE s.fn END,
  last_name  = CASE WHEN s.sp > 0 THEN NULLIF(btrim(substring(s.fn FROM s.sp + 1)), '') ELSE NULL END
FROM split s
WHERE p.id = s.id;
```

**What you'll see:** `UPDATE` with the row count of previously-NULL profiles
that got a name split. Rows where `full_name` itself is NULL/blank are left
alone (still NULL — there's nothing to split).

### 12c. Flag ambiguous splits for manual review

Rows whose `full_name` isn't exactly two words (single-token names, or three
or more words/suffixes) got a best-effort split in 12b that may not be
right. Run this and eyeball it — fix any wrong ones directly on the
Employee Profile page.

```sql
SELECT string_agg(
  full_name || '  →  first: ' || COALESCE(first_name, '∅') || ' / last: ' || COALESCE(last_name, '∅'),
  E'\n' ORDER BY full_name
)
FROM public.profiles
WHERE full_name IS NOT NULL
  AND btrim(full_name) <> ''
  AND array_length(regexp_split_to_array(btrim(full_name), '\s+'), 1) <> 2;
```

**What you'll see:** one text blob, one line per ambiguous name, e.g.
`Mary Jane Smith  →  first: Mary / last: Jane Smith`. Anything that looks
wrong, fix by hand on that person's Employee Profile page.

### 12d. Verification sample — please paste this back

I don't have direct database access in this environment, so I can't confirm
12b's results myself. Please run this and paste the output back so I can
review real before/after splits (not just "the UPDATE ran"):

```sql
SELECT string_agg(
  full_name || '  →  first: ' || COALESCE(first_name, '∅') || ' / last: ' || COALESCE(last_name, '∅'),
  E'\n' ORDER BY full_name
)
FROM (
  SELECT full_name, first_name, last_name
  FROM public.profiles
  WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
  ORDER BY full_name
  LIMIT 20
) t;
```

**What you'll see:** up to 20 lines, each `full_name  →  first: … / last: …`.

---

## 13. Audit: `client_progress_summaries` rows generated before the client's actual service start (2026-07-23)

`ensureCurrentSummaryPeriods()` used to generate every quarterly/monthly
deadline in a fixed lookback window (last 4 quarters, last 6 months) for any
client with a currently-active billing code — regardless of when that code's
`service_start_date` actually was. That's now fixed to only generate a period
when `service_start_date <= period_end`. This is a **read-only audit** of how
many already-inserted rows violate that rule, so we can decide together
whether to delete them or mark them not-applicable — **do not run any
DELETE/UPDATE from this block**, it's SELECT-only.

A row counts as "generated too early" if *none* of its `service_codes` had
started (or the code has no `client_billing_codes` row at all) as of that
row's `period_end`.

### 13a. Count of affected rows

```sql
WITH summary_codes AS (
  SELECT s.id, s.organization_id, s.client_id, s.period_kind, s.period_label,
         s.period_end, s.completed_at, unnest(s.service_codes) AS service_code
  FROM public.client_progress_summaries s
),
matched AS (
  SELECT sc.id,
         bool_or(cbc.service_start_date IS NULL OR cbc.service_start_date <= sc.period_end) AS has_started_code
  FROM summary_codes sc
  LEFT JOIN public.client_billing_codes cbc
    ON cbc.client_id = sc.client_id
   AND upper(cbc.service_code) = upper(sc.service_code)
  GROUP BY sc.id
)
SELECT
  count(*) AS bad_row_count,
  count(*) FILTER (WHERE s.completed_at IS NOT NULL) AS bad_row_count_already_completed,
  count(DISTINCT s.client_id) AS distinct_clients_affected
FROM matched m
JOIN public.client_progress_summaries s ON s.id = m.id
WHERE m.has_started_code IS NOT TRUE;
```

**What you'll see:** one row — `bad_row_count`, how many of those were
already marked completed (matters for the delete-vs-mark-N/A decision, since
deleting a completed row loses real work), and how many distinct clients are
affected.

### 13b. Sample of affected rows (first 50, for a sanity check)

```sql
WITH summary_codes AS (
  SELECT s.id, s.organization_id, s.client_id, s.period_kind, s.period_label,
         s.period_end, s.status, s.completed_at, unnest(s.service_codes) AS service_code
  FROM public.client_progress_summaries s
),
matched AS (
  SELECT sc.id,
         bool_or(cbc.service_start_date IS NULL OR cbc.service_start_date <= sc.period_end) AS has_started_code
  FROM summary_codes sc
  LEFT JOIN public.client_billing_codes cbc
    ON cbc.client_id = sc.client_id
   AND upper(cbc.service_code) = upper(sc.service_code)
  GROUP BY sc.id
)
SELECT s.client_id, cl.first_name, cl.last_name, s.period_kind, s.period_label,
       s.period_end, s.service_codes, s.status, s.completed_at
FROM matched m
JOIN public.client_progress_summaries s ON s.id = m.id
LEFT JOIN public.clients cl ON cl.id = s.client_id
WHERE m.has_started_code IS NOT TRUE
ORDER BY s.client_id, s.period_end
LIMIT 50;
```

**What you'll see:** up to 50 rows naming the client, period, and codes so we
can eyeball whether these are the "onboarded mid-window" false-overdue rows
described above (expected) or something else. **Do not delete or update
anything based on this block alone** — report the counts back and we'll
decide the cleanup (delete vs. a `not_applicable` status) together before
touching existing data.

---

## 14. `go_live_date` — when did this org actually start on HIVE (2026-07-23)

There was no concept anywhere of when an org started using HIVE, so the
deadline generator, audit packets, and the HHS daily-note completeness view
couldn't tell "this never happened" from "this happened before we were on
HIVE" — producing false compliance gaps for any period before adoption.

Adds `organizations.go_live_date` (nullable — code treats NULL as
"defaults to `organizations.created_at`", never as "no floor at all"), plus
a snapshot disclosure column on `audit_packets` so a packet's pre-go-live
note doesn't silently change if `go_live_date` is edited after the packet
was built.

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS go_live_date date;

ALTER TABLE public.audit_packets
  ADD COLUMN IF NOT EXISTS predates_go_live_note text;
```

**What you'll see:** two `ALTER TABLE` statements, no rows changed. Both
columns are nullable so every existing org/packet is unaffected until an
admin sets `go_live_date` (Settings → Organization details) or a new packet
is generated.

---

## 15. `hrc_restriction_records` — 8-element rights-restriction documentation (2026-07-23)

The state audit tool (SOW §1.20, HCBS Settings Rule) requires eight specific,
individually-verifiable elements for every rights restriction in place for a
client — a single freeform note can't prove these. This adds a table with one
named column per element (informed consent, assessed need, prior positive
interventions, less-intrusive methods tried, condition description, data
review + last-review date, time limits + next-review date, no-harm
assurance) so the HRC page can show real per-element completion instead of a
paragraph of notes. Until this table exists, the HRC page's restriction
checklist UI and the client-profile completion badge both render an amber
"Pending database update" notice; the existing `hrc_reviews` freeform flow is
unaffected either way. The `next_review_date` from element (g) is picked up
by the Deadlines feed the same way PCSP/cert dates already are — no separate
deadlines table to insert into.

```sql
CREATE TABLE public.hrc_restriction_records (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                   uuid        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  restriction_title           text        NOT NULL CHECK (char_length(restriction_title) BETWEEN 1 AND 200),
  active                      boolean     NOT NULL DEFAULT true,

  consent_text                text,
  consent_signed_date         date,

  assessed_need_text          text,

  positive_interventions_text text,

  less_intrusive_methods_text text,

  condition_description_text  text,

  data_review_text            text,
  last_review_date            date,

  time_limits_text            text,
  next_review_date            date,

  no_harm_text                text,

  created_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrc_restriction_records TO authenticated;
GRANT ALL                            ON public.hrc_restriction_records TO service_role;

ALTER TABLE public.hrc_restriction_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hrr_read" ON public.hrc_restriction_records
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hrc_committee_member(organization_id, auth.uid())
  );

CREATE POLICY "hrr_write" ON public.hrc_restriction_records
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_hrr_updated
  BEFORE UPDATE ON public.hrc_restriction_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_hrr_org               ON public.hrc_restriction_records(organization_id);
CREATE INDEX idx_hrr_client            ON public.hrc_restriction_records(client_id);
CREATE INDEX idx_hrr_active_next_review ON public.hrc_restriction_records(next_review_date) WHERE active = true;
```

**What you'll see:** `CREATE TABLE`, two `GRANT`, `ALTER TABLE`, two
`CREATE POLICY`, `CREATE TRIGGER`, three `CREATE INDEX`. This relies on the
`is_org_member`, `is_hrc_committee_member`, `is_org_admin_or_manager`, and
`update_updated_at_column` helpers already created by earlier migrations
(the `hrc_meetings`/`hrc_reviews` migration and the general RLS setup) — if
this errors on an undefined function, those need to exist first.

---

## 16. Per-item audit periods + pinned pre-Hive disclosure item (2026-07-23)

Real state audit letters request different document types across
independently-random date windows (e.g. "shift notes from May through July"
and "incident reports from November through December" in the same letter) —
one shared packet-level timeline can't represent that. Adds `period_start`/
`period_end` on `audit_packet_items` so a checklist item can carry its own
range, falling back to the packet's `timeline_start`/`timeline_end` when
NULL (unchanged behavior for letters with one global range).

Also adds `is_disclosure`, so the existing pre-Hive-period note (block 14,
`audit_packets.predates_go_live_note`) is now additionally inserted as a
pinned, non-dismissable checklist item — the first item in the packet —
instead of only a summary banner.

```sql
ALTER TABLE public.audit_packet_items
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS is_disclosure boolean NOT NULL DEFAULT false;
```

**What you'll see:** one `ALTER TABLE` adding three columns, no rows
changed. Existing items all get `is_disclosure = false` / NULL periods, so
older packets keep behaving exactly as before until a new packet is
produced.

**Note for the human:** `src/integrations/supabase/types.ts` was not
hand-edited for this one — the app already reads/writes these three columns
through `as any` casts (matching how `go_live_date` /
`predates_go_live_note` from block 14 are handled), so nothing blocks the
build ahead of this SQL landing.

---

## 17. Data check: `hrc_restriction_records.organization_id` drift vs. the client's actual org (2026-07-23)

Bug: Justin Hesse's rights restrictions show up on his client profile page
(which queries `hrc_restriction_records` by `client_id` only) but were
missing from the HRC committee page (which queried by
`organization_id`). The app-side fix (`src/routes/dashboard.hrc.tsx`) now
scopes the HRC page's restrictions query by the org's client roster instead
of trusting `organization_id` on the restriction row, so this no longer
hides anything regardless of what's in the column. This query is optional
data hygiene to find (and, if you choose, correct) any restriction rows
whose stored `organization_id` doesn't match the org their own client
belongs to — worth running since other places (e.g. the deadlines/Sentinel
`next_review_date` reminder in `src/hooks/use-deadlines.tsx`) still filter
by this column directly.

```sql
-- 1. Find drifted rows (read-only — run this first and eyeball the output).
SELECT
  r.id,
  r.restriction_title,
  r.organization_id AS restriction_org_id,
  c.organization_id AS client_org_id,
  c.first_name,
  c.last_name
FROM public.hrc_restriction_records r
JOIN public.clients c ON c.id = r.client_id
WHERE r.organization_id IS DISTINCT FROM c.organization_id;

-- 2. Only if you're satisfied the drifted rows above should follow their
--    client's current org, backfill them:
UPDATE public.hrc_restriction_records r
SET organization_id = c.organization_id
FROM public.clients c
WHERE c.id = r.client_id
  AND r.organization_id IS DISTINCT FROM c.organization_id;
```

**What you'll see:** step 1 is read-only, just for eyeballing. Step 2, if
run, updates zero or more rows in place — no rows are deleted or created,
only the `organization_id` column is corrected to match the client's real
org.

---

## 18. Legacy `incident_reports.status` values orphaned by the UPI-flow simplification (2026-07-23)

Bug: Justin Hesse's incident shows up in the Incidents tab trends bar chart
(`incidentTrends`, which reads every row unconditionally) but not in either
the "Open queue" or "Log / filter" list views, under any status filter.
Cause: block 11 above (2026-07-23) replaced the old multi-step UPI closing
flow with a single "Submit to UPI" action, but `listIncidents`
(`src/lib/incidents.functions.ts`) still only recognizes two states —
`.eq("status","State_Confirmed")` for closed and `.neq("status",
"State_Confirmed")` for open. Any row whose `status` is a leftover
intermediary value from the old flow (e.g. `In_Progress`, `Pending_UPI`) is
neither equal to nor cleanly "not equal to" in the way the open filter's
callers expect — in practice such rows should always have matched
`.neq("status","State_Confirmed")`, so the actual gap here is `status IS
NULL`: Postgres's `<>` never matches `NULL`, so a null-status row fails
*both* `.eq(...)` and `.neq(...)` and falls through every list view while
still being read by the trends query. The app-side fix (this commit) changes
the open filter to `.or("status.neq.State_Confirmed,status.is.null")` so
null and any legacy value are caught. This block is the data-side half:
correct any stored legacy status values so they reflect reality instead of
a stale intermediate step.

### 18a. Find affected rows (read-only — run first and eyeball)

```sql
SELECT
  r.id,
  r.report_number,
  c.first_name,
  c.last_name,
  r.status AS current_status,
  r.upi_submitted_at,
  CASE WHEN r.upi_submitted_at IS NOT NULL THEN 'State_Confirmed' ELSE NULL END AS status_after_fix
FROM public.incident_reports r
LEFT JOIN public.clients c ON c.id = r.client_id
WHERE r.status IS NOT NULL
  AND r.status <> ''
  AND r.status <> 'State_Confirmed'
ORDER BY r.report_number;
```

**What you'll see:** zero or more rows — every incident whose `status` isn't
`State_Confirmed`, null, or empty. Justin Hesse's incident should be in
here. Confirm `status_after_fix` looks right for each row before running 18b.

### 18b. Correct the legacy values

```sql
UPDATE public.incident_reports
SET status = CASE WHEN upi_submitted_at IS NOT NULL THEN 'State_Confirmed' ELSE NULL END
WHERE status IS NOT NULL
  AND status <> ''
  AND status <> 'State_Confirmed';
```

**What you'll see:** `UPDATE` with the row count that changed (should match
18a's row count). Incidents that were actually submitted to UPI
(`upi_submitted_at` populated) become `State_Confirmed` and appear in the
closed/completed view; everything else becomes `status = NULL` and appears
in the open queue. No `discovered_at`/`created_at`/content columns are
touched — only `status`.

### 18c. Verify no rows remain in the gap

```sql
SELECT count(*) FROM public.incident_reports
WHERE status IS NOT NULL AND status <> '' AND status <> 'State_Confirmed';
```

**What you'll see:** `0`.

---

## 19. Incident trends aggregation RPCs (Incidents tab performance — 2026-07-27)

**What this is for:** The Documentation > Incidents tab was taking 10-30s to
load. Part of the fix was moving `incidentTrends`
(`src/lib/incidents.functions.ts`) off a client-side aggregation over up to
5,000 raw rows and onto two `GROUP BY` queries in the database. These are
`SECURITY DEFINER` functions (same admin/manager-only gate as the app-side
`isManager()` check) so they can run the aggregation without handing the
client raw row access.

```sql
CREATE OR REPLACE FUNCTION public.incident_monthly_category_counts(
  _org uuid,
  _since timestamptz
)
RETURNS TABLE (
  month_key text,
  category text,
  incident_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = auth.uid() AND active
      AND role IN ('admin', 'manager', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Admin or manager access required.';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('month', coalesce(r.discovered_at, r.created_at)), 'YYYY-MM') AS month_key,
    coalesce(r.category, 'Uncategorized') AS category,
    count(*) AS incident_count
  FROM public.incident_reports r
  WHERE r.organization_id = _org
    AND coalesce(r.discovered_at, r.created_at) >= _since
  GROUP BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.incident_client_counts(
  _org uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE (
  client_id uuid,
  first_name text,
  last_name text,
  incident_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = auth.uid() AND active
      AND role IN ('admin', 'manager', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Admin or manager access required.';
  END IF;

  RETURN QUERY
  SELECT
    r.client_id,
    c.first_name,
    c.last_name,
    count(*) AS incident_count
  FROM public.incident_reports r
  LEFT JOIN public.clients c ON c.id = r.client_id
  WHERE r.organization_id = _org
    AND coalesce(r.discovered_at, r.created_at) >= _from
    AND coalesce(r.discovered_at, r.created_at) <= _to
  GROUP BY r.client_id, c.first_name, c.last_name
  ORDER BY count(*) DESC
  LIMIT 12;
END;
$$;

GRANT EXECUTE ON FUNCTION public.incident_monthly_category_counts(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incident_client_counts(uuid, timestamptz, timestamptz) TO authenticated;
```

**What you'll see:** two `CREATE OR REPLACE FUNCTION` and two `GRANT
EXECUTE`. No tables, columns, or existing rows are touched. Until this runs,
the Incidents tab's trends strip (bar chart / category breakdown / per-client
table) will error — the app code calls these two functions by name.

---

## ACTION — Provider Licensing Hub: widen upi_attestations.kind (2026-08-13)

**What this is for:** New Settings > Licenses & Certifications page adds a
"USOR Approved Vendor — Job Development" card (for orgs running SJD),
mirroring the existing SEI "USOR Approved Vendor — Job Coaching" card. It
reuses the `upi_attestations` table with a new `kind` value,
`usor_vendor_job_development`. No new table — the license documents
themselves reuse `nectar_documents` with `owner_kind='company'` and two new
`document_type` values (`ol_day_treatment_license`,
`ol_day_support_certification`) plus a third
(`usor_approved_vendor_job_development`) for the Job Development USOR
upload slot — all free-text `document_type`, no schema change needed for
those.

Matches migration `supabase/migrations/20260813150000_usor_job_development_kind.sql`.

```sql
ALTER TABLE public.upi_attestations DROP CONSTRAINT IF EXISTS upi_attestations_kind_check;
ALTER TABLE public.upi_attestations ADD CONSTRAINT upi_attestations_kind_check
  CHECK (kind IN ('sei_employment_monthly', 'sei_support_strategies', 'usor_vendor', 'usor_vendor_job_development'));
```

**What you'll see:** two `ALTER TABLE` statements. No rows are touched —
this only widens which `kind` values are allowed going forward.

---

## ACTION — RP5 daily notes: add daily_logs.service_code (2026-08-13)

**What this is for:** RP5 (Exceptional Care Respite With Room and Board)
now reuses the HHS daily-summary-note flow (Daily Logs — narrative, PCSP
goals, signature). Every existing `daily_logs` row is HHS, but there was no
column recording which service code a note bills against, so a new RP5 row
would be indistinguishable from HHS. Adding a nullable `service_code`
column, backfilled to `'HHS'` for all existing rows, fixes that without
touching any other data. HHS behavior is unchanged — the app only starts
writing `'RP5'` for clients whose active service code is RP5 instead of HHS.

Matches migration `supabase/migrations/20260813220000_daily_logs_service_code.sql`.

```sql
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS service_code text;
UPDATE public.daily_logs SET service_code = 'HHS' WHERE service_code IS NULL;
ALTER TABLE public.daily_logs ALTER COLUMN service_code SET DEFAULT 'HHS';
```

**What you'll see:** one `ALTER TABLE` adding the column, one `UPDATE`
backfilling existing rows to `'HHS'`, and one `ALTER TABLE` setting the
default for future inserts. No rows are deleted; no existing HHS billing
attribution changes.

---

## ACTION — SJD product prompts 11–17 (2026-08-13)

**What this is for:** Seven product prompts extending SJD (Supported
Employment — Job Development) parity with SEI:
- Prompts 11/12/16 (ACRE gate for SED, Customized Employment Training for
  SEE/SJD, SJD 60-day ACRE) — new `BASELINE_STAFF_TRAININGS` entries in
  `src/lib/staff-training-requirements.ts`. No schema change — this list
  drives both the staff checklist and compliance matrix automatically.
- Prompt 13 (SJD → monthly summary cadence + UPI attestation flag) —
  code-only change in `src/lib/progress-summaries.ts` /
  `progress-summaries.functions.ts`. No schema change.
- Prompt 14 (SJD employment-data + support-strategies UPI attestations,
  mirroring SEI) — widens `upi_attestations.kind` to add
  `sjd_employment_monthly` and `sjd_support_strategies`.
- Prompt 17 (SJD monthly USOR Outreach Verification short text field) —
  reuses the same `upi_attestations` table rather than a new one: adds
  `kind = 'sjd_usor_outreach'` plus a new nullable `note_text` column that
  carries the outreach/funding-status note. Existing rows are unaffected
  (`note_text` defaults to NULL).
- Prompt 15 (SJD Assessment Documentation — Discovery Process vs Vocational
  Assessment) — new table `sjd_assessment_selections` holding the
  per-client toggle plus the admin-entered assessment start date used only
  by the Vocational Assessment deadline. The Discovery Process deadline
  (SJD service start + 60 days) needs no new column — it's derived from
  the existing `client_billing_codes.service_start_date`. The uploads
  themselves reuse `client_documents` with two new free-text
  `document_type` values (`sjd_discovery_assessment`,
  `sjd_vocational_assessment`) via the existing `NectarAsk` upload
  component — no schema change needed for those.

Matches migration `supabase/migrations/20260813230000_sjd_prompts_11_17.sql`.

```sql
ALTER TABLE public.upi_attestations DROP CONSTRAINT IF EXISTS upi_attestations_kind_check;
ALTER TABLE public.upi_attestations ADD CONSTRAINT upi_attestations_kind_check
  CHECK (kind IN (
    'sei_employment_monthly', 'sei_support_strategies',
    'usor_vendor', 'usor_vendor_job_development',
    'sjd_employment_monthly', 'sjd_support_strategies', 'sjd_usor_outreach'
  ));

ALTER TABLE public.upi_attestations ADD COLUMN IF NOT EXISTS note_text text;

CREATE TABLE IF NOT EXISTS public.sjd_assessment_selections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assessment_type        text NOT NULL DEFAULT 'discovery_process'
                            CHECK (assessment_type IN ('discovery_process', 'vocational_assessment')),
  assessment_start_date  date,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid,
  updated_by_name        text,
  UNIQUE (organization_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sjd_assessment_selections TO authenticated;
GRANT ALL ON public.sjd_assessment_selections TO service_role;

ALTER TABLE public.sjd_assessment_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read sjd assessment selections"
  ON public.sjd_assessment_selections FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage sjd assessment selections"
  ON public.sjd_assessment_selections FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sjd_assessment_selections_org_client
  ON public.sjd_assessment_selections (organization_id, client_id);
```

**What you'll see:** two `ALTER TABLE` statements widening the existing
`upi_attestations` table (no rows touched, `note_text` defaults to NULL on
every existing row), then one new table `sjd_assessment_selections` with
its RLS policies and index. Nothing existing is deleted or renamed.

---

## ACTION — Staff groups + company obligations tracker (2026-08-13)

**What this is for:** Foundation tables for a company-obligations tracker
(agency-level recurring compliance tasks — e.g. quarterly fire drill sign-off,
annual policy re-attestation — distinct from the existing client/staff
compliance requirements). Six new tables plus one new storage bucket:
- `staff_groups` / `staff_group_members` — reusable staff groupings (optionally
  linked to a `teams` row) so an obligation can be assigned to a subset of
  staff rather than the whole org.
- `company_obligations` — the obligation definition: cadence, evidence type
  required (attestation / upload / both / linked form), and who it's assigned
  to (`assigned_to_groups`, `assigned_to_users`, or role-based via
  `assignee_role`).
- `company_obligation_instances` — one row per due period (e.g. "2026 Q3"),
  tracking status/evidence/who completed it.
- `company_obligation_instance_assignees` — a snapshot of which staff were
  assigned to a given instance at the time it was generated (so later group
  membership changes don't rewrite history).
- `company_obligation_completions` — supports `requires_individual_completion`
  obligations where every assigned staff member (not just one) must complete
  their own copy of the same instance.

New storage bucket `obligation-evidence` (private, 20MB limit, PDF/Word/image/
text only) follows the same per-org-folder RLS pattern as `hrc-documents` and
`employee-docs`: path is `{organization_id}/{obligation_id}/{instance_id}/
{original_filename}`, admins/managers can read and manage everything under
their org's folder, any org member can upload, and a staff member can also
read files they uploaded themselves (`owner = auth.uid()`).

Matches migration
`supabase/migrations/20260813233000_company_obligations_and_staff_groups.sql`.

```sql
-- ── Staff groups (for targeting company obligations at a subset of staff) ──
CREATE TABLE IF NOT EXISTS public.staff_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  color            text,
  linked_team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_groups_org ON public.staff_groups(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_groups TO authenticated;
GRANT ALL ON public.staff_groups TO service_role;

ALTER TABLE public.staff_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read staff groups"
  ON public.staff_groups FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage staff groups"
  ON public.staff_groups FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS staff_groups_set_updated_at ON public.staff_groups;
CREATE TRIGGER staff_groups_set_updated_at
  BEFORE UPDATE ON public.staff_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Staff group membership ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.staff_groups(id) ON DELETE CASCADE,
  staff_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at  timestamptz DEFAULT now(),
  UNIQUE (group_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_group_members_group ON public.staff_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_staff_group_members_staff ON public.staff_group_members(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_group_members TO authenticated;
GRANT ALL ON public.staff_group_members TO service_role;

ALTER TABLE public.staff_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read staff group members"
  ON public.staff_group_members FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_member(g.organization_id, auth.uid())
    )
  );

CREATE POLICY "admins manage staff group members"
  ON public.staff_group_members FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_admin_or_manager(g.organization_id, auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_admin_or_manager(g.organization_id, auth.uid())
    )
  );

-- ── Company obligation definitions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title                     text NOT NULL,
  description               text,
  source_policy_section     text,
  cadence                   text NOT NULL CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'annually', 'per_event', 'one_time')),
  due_day_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  reminder_days_before      integer[] NOT NULL DEFAULT '{}',
  evidence_type             text NOT NULL CHECK (evidence_type IN ('attestation', 'upload', 'upload_and_attestation', 'form')),
  linked_form_id            uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  attestation_text          text,
  requires_individual_completion boolean NOT NULL DEFAULT false,
  assigned_to_groups        uuid[] NOT NULL DEFAULT '{}',
  assigned_to_users         uuid[] NOT NULL DEFAULT '{}',
  assignee_role             text NOT NULL DEFAULT 'any_assigned' CHECK (assignee_role IN ('any_assigned', 'managers_only', 'admin_only')),
  notify_manager_on_complete boolean NOT NULL DEFAULT true,
  notify_manager_on_overdue  boolean NOT NULL DEFAULT true,
  active                    boolean NOT NULL DEFAULT true,
  created_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_obligations_org ON public.company_obligations(organization_id);
CREATE INDEX IF NOT EXISTS idx_company_obligations_form ON public.company_obligations(linked_form_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligations TO authenticated;
GRANT ALL ON public.company_obligations TO service_role;

ALTER TABLE public.company_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read company obligations"
  ON public.company_obligations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage company obligations"
  ON public.company_obligations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS company_obligations_set_updated_at ON public.company_obligations;
CREATE TRIGGER company_obligations_set_updated_at
  BEFORE UPDATE ON public.company_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Company obligation instances (one per due period) ───────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligation_instances (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id               uuid NOT NULL REFERENCES public.company_obligations(id) ON DELETE CASCADE,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_key                  text NOT NULL,
  due_at                      timestamptz NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue', 'waived')),
  completed_at                timestamptz,
  completed_by_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by_name           text,
  evidence_type_used          text,
  upload_path                 text,
  upload_filename             text,
  attestation_signed_at       timestamptz,
  attestation_signed_by_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attestation_signed_by_name  text,
  attestation_text_snapshot   text,
  form_submission_id          uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  event_description           text,
  waive_reason                text,
  admin_notes                 text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE (obligation_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_org_status_due
  ON public.company_obligation_instances(organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_obligation
  ON public.company_obligation_instances(obligation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_instances TO authenticated;
GRANT ALL ON public.company_obligation_instances TO service_role;

ALTER TABLE public.company_obligation_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read company obligation instances"
  ON public.company_obligation_instances FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage company obligation instances"
  ON public.company_obligation_instances FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS company_obligation_instances_set_updated_at ON public.company_obligation_instances;
CREATE TRIGGER company_obligation_instances_set_updated_at
  BEFORE UPDATE ON public.company_obligation_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Per-instance assignee snapshot ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligation_instance_assignees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      uuid NOT NULL REFERENCES public.company_obligation_instances(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  staff_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name       text NOT NULL,
  staff_role       text,
  UNIQUE (instance_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_instance_assignees_instance
  ON public.company_obligation_instance_assignees(instance_id);
CREATE INDEX IF NOT EXISTS idx_company_obligation_instance_assignees_staff
  ON public.company_obligation_instance_assignees(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_instance_assignees TO authenticated;
GRANT ALL ON public.company_obligation_instance_assignees TO service_role;

ALTER TABLE public.company_obligation_instance_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read obligation instance assignees"
  ON public.company_obligation_instance_assignees FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage obligation instance assignees"
  ON public.company_obligation_instance_assignees FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ── Individual completions (for obligations requiring per-staff completion) ─
CREATE TABLE IF NOT EXISTS public.company_obligation_completions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                 uuid NOT NULL REFERENCES public.company_obligation_instances(id) ON DELETE CASCADE,
  organization_id             uuid NOT NULL,
  staff_id                    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name                  text NOT NULL,
  evidence_type_used          text NOT NULL,
  upload_path                 text,
  upload_filename             text,
  attestation_signed_at       timestamptz,
  attestation_text_snapshot   text,
  form_submission_id          uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  completed_at                timestamptz NOT NULL DEFAULT now(),
  is_manual_entry             boolean NOT NULL DEFAULT false,
  manual_entry_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manual_entry_by_name        text,
  notes                       text
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_completions_instance
  ON public.company_obligation_completions(instance_id);
CREATE INDEX IF NOT EXISTS idx_company_obligation_completions_staff
  ON public.company_obligation_completions(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_completions TO authenticated;
GRANT ALL ON public.company_obligation_completions TO service_role;

ALTER TABLE public.company_obligation_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read obligation completions"
  ON public.company_obligation_completions FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff insert own obligation completions"
  ON public.company_obligation_completions FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  );

CREATE POLICY "admins manage obligation completions"
  ON public.company_obligation_completions FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ── Storage bucket for obligation evidence uploads ──────────────────────────
-- Path structure: {organization_id}/{obligation_id}/{instance_id}/{original_filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'obligation-evidence',
  'obligation-evidence',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "obligation evidence select org members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
      OR owner = auth.uid()
    )
  );

CREATE POLICY "obligation evidence insert org members"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "obligation evidence update admins"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "obligation evidence delete admins"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );
```

**What you'll see:** six new `CREATE TABLE` statements (`staff_groups`,
`staff_group_members`, `company_obligations`, `company_obligation_instances`,
`company_obligation_instance_assignees`, `company_obligation_completions`)
each with their `GRANT`s, RLS enabled, and policies; two `updated_at`
triggers; and one new private storage bucket `obligation-evidence` with four
`storage.objects` policies scoped by the org-id folder prefix. Nothing
existing is altered, deleted, or renamed — this is purely additive.

## ACTION — Widen notifications.type for Company Obligations (2026-08-13)

**What this is for:** The Company Obligations server functions (Section 2)
send two new kinds of notification — a per-assignee due-date reminder
ladder (`company_obligation_reminder`) and an admin/manager update on
completion or overdue (`company_obligation_update`). The existing
`notifications_type_check` constraint is an explicit whitelist and does not
include these, so inserts would fail without this change. Purely additive —
drops and re-adds the same CHECK with two more allowed values; no existing
rows are touched.

Matches migration
`supabase/migrations/20260813234500_obligation_notification_types.sql`.

```sql
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'incident_report_filed','incident_deadline_warning','timesheet_exception','daily_log_exception',
  'open_shift_warning','medication_error','form_assigned','form_reminder','form_due',
  'staff_mandate_missing','smart_import_flag','smart_import_provisional_cert',
  'smart_import_unverified_cert','smart_import_cert_expiring','smart_import_question',
  'shift_published','shift_updated','time_off_requested','time_off_decided',
  'company_obligation_reminder','company_obligation_update'
]));
```

**What you'll see:** one `DROP CONSTRAINT` / `ADD CONSTRAINT` pair widening
the allowed `type` values on `public.notifications`. Nothing else changes.

## ACTION — company_obligations: source/is_locked columns (2026-08-13)

**What this is for:** Some obligations are mandated verbatim by the state
contract (DSPD SOW DHHS91172) rather than authored by the provider — e.g.
required postings or attestations the SOW spells out. Admins need to see
which is which, and state-mandated obligations shouldn't be editable,
pausable, or deletable from the UI (the app also rejects those mutations
server-side even if someone bypasses the UI). Purely additive — every
existing row defaults to `source = 'provider'`, `is_locked = false`, so
nothing existing changes behavior.

Matches migration
`supabase/migrations/20260813235500_company_obligations_source_lock.sql`.

```sql
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'provider'
    CHECK (source IN ('sow', 'provider')),
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
```

**What you'll see:** two new columns added to `public.company_obligations` —
`source` (text, checked to `'sow'` or `'provider'`) and `is_locked`
(boolean). No existing columns, rows, or constraints are touched.

---

## ACTION — Retire SOW training sub-topics from the HR checklist (2026-08-14)

**What this is for:** Company Obligations (30-day / annual training) is now
the tracker of record for recurring training compliance, so the per-topic
`hr_staff_checklist`-scoped rows on `nectar_requirements` are retired —
deleted where they were purely checklist items, or de-scoped (kept for
their reference content, just dropped from `hr_staff_checklist`) where
useful elsewhere. This prevents the same training being double-counted
once in the old checklist and again in Company Obligations. Run this
**after** the Company Obligations tables/seed below exist, so the tracker
of record is already live before the old checklist entries disappear.

Matches migration
`supabase/migrations/20260814000000_retire_sow_training_subtopics.sql`.

```sql
DELETE FROM public.nectar_requirements
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND requirement_key IN (
    'staff_train_hipaa',
    'staff_train_communicable_disease',
    'staff_train_seizure_orientation',
    'staff_train_choking_heimlich',
    'staff_train_emergency_escalation',
    'staff_train_incident_reporting',
    'staff_train_legal_rights_ada',
    'staff_train_abuse_neglect_exploitation',
    'staff_train_positive_behavior_supports_r539_4',
    'staff_train_dspd_philosophy',
    'staff_train_hcbs_settings_rule',
    'staff_train_crisis_deescalation',
    'staff_train_trauma_informed_care',
    'staff_train_suicide_prevention',
    'staff_train_oig_fwa_reporting',
    'staff_train_dnr_polst_palliative',
    'staff_train_person_specific'
  );

UPDATE public.nectar_requirements
SET metadata = metadata - 'scope'
WHERE id = '6840afd5-9cac-4453-aded-f65c43b8d9d8';

UPDATE public.nectar_requirements
SET metadata = metadata - 'scope'
WHERE id IN (
  'a2a68349-e98a-488d-a42e-b574ea7b4880',
  '860f403c-12ea-4b5a-b945-f7ae0475ee86',
  '7f23fd32-e5f9-4190-add5-2f8cf8587782',
  'e8ebc6df-adef-4e27-9c36-b0e8c4570bad',
  '180a9df2-99d2-4d91-b5d3-8c3ca35c19e4',
  '1404ebf5-40ac-46f9-99e5-eb9be29374d3',
  'dafca597-c245-459a-acd9-847eca181cbf',
  '57bfacb6-5c33-4b68-bd4c-d3dabcb37354',
  'a914c07e-e30f-45e4-bb07-583d1003ca92',
  'aacedee9-0914-46f0-aa5d-52e95356c5cb',
  '3cdb2270-54fd-48e4-8666-68ea6c6b138e',
  '0a5bcfc8-cd10-4f31-b476-707ca3c20c9a',
  '14f4cc7f-7e88-4a16-a4d0-e4510cd563c0',
  'ab933f19-4d8f-4fe5-a1e7-b3e7f7f0632f',
  '56942dbd-5d1c-4cb4-b07c-e398427730cc',
  'cf4cac6b-c2b1-4416-8d40-dc44f07bfaac',
  '076af0c0-1d13-41af-8413-141361b36158',
  '04b74162-9938-473e-86d3-2bfe563e26e5',
  '045a9a9c-22f7-4f3d-92d2-5106fccb3efe',
  'cce9a5f1-62fa-4891-ab87-1d6ff9bf00ca',
  '01a7e412-bd7e-4526-893c-4fd8aa5803b9'
);
```

**What you'll see:** one `DELETE` (17 rows, if all are still present — fewer
or "0 rows deleted" is fine if some were already removed) and two `UPDATE`
statements stripping the `scope` key from each listed row's `metadata`
(row counts should match how many of the listed ids exist — 0 for any
already-updated or missing id is not an error).

---

## ACTION — "All Staff" auto-group (2026-08-14)

**What this is for:** Company Obligations needs to target "every staff
member" without an admin manually keeping a group's roster in sync. This
replaces `accept_invitation()` so every new staffer is automatically added
to a system-managed "All Staff" `staff_groups` row the moment they accept
an invite, then backfills that group (creating it if needed) for True
North Supports with every currently-active member. **Run this before** the
seed-defaults block below, which assumes the All Staff group already
exists and raises an exception if it doesn't.

Matches migration `supabase/migrations/20260814010000_all_staff_auto_group.sql`.

```sql
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_email text;
  v_member_id uuid;
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (auth.jwt() ->> 'email') INTO v_email;

  SELECT * INTO v_inv FROM public.invitations WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation already used'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;
  IF lower(v_inv.email) <> lower(coalesce(v_email, '')) THEN
    RAISE EXCEPTION 'Invitation email does not match your account';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, active)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, active = true
  RETURNING id INTO v_member_id;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = v_inv.id;

  SELECT id INTO v_group_id
    FROM public.staff_groups
    WHERE organization_id = v_inv.organization_id AND name = 'All Staff'
    LIMIT 1;
  IF v_group_id IS NULL THEN
    INSERT INTO public.staff_groups (organization_id, name, description, color)
    VALUES (
      v_inv.organization_id,
      'All Staff',
      'System-managed group — every staff member in this organization',
      '#6B7280'
    )
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.staff_group_members (group_id, staff_id)
  VALUES (v_group_id, auth.uid())
  ON CONFLICT (group_id, staff_id) DO NOTHING;

  RETURN v_inv.organization_id;
END;
$$;

DO $$
DECLARE
  v_org_id uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
  v_group_id uuid;
BEGIN
  SELECT id INTO v_group_id
    FROM public.staff_groups
    WHERE organization_id = v_org_id AND name = 'All Staff'
    LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.staff_groups (organization_id, name, description, color)
    VALUES (
      v_org_id,
      'All Staff',
      'System-managed group — every staff member in this organization',
      '#6B7280'
    )
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.staff_group_members (group_id, staff_id)
  SELECT v_group_id, om.user_id
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND om.active = true
  ON CONFLICT (group_id, staff_id) DO NOTHING;
END $$;
```

**What you'll see:** `CREATE FUNCTION` (replacing `accept_invitation`),
then a `DO` block with no direct output — check afterward with
`SELECT * FROM public.staff_groups WHERE name = 'All Staff';` (one row)
and a member count against your active-staff count.

---

## ACTION — Seed the six SOW-mandated Company Obligations (2026-08-14)

**What this is for:** Adds the two NECTAR-matching columns Company
Obligations definitions need (`nectar_cert_type_label`,
`nectar_keyword_groups`), switches per-person cadence obligations (hire-
anniversary / days-after-hire) from one shared instance per obligation to
one instance per assignee — each with their own due date computed from
their own `hire_date` — via a new nullable `assignee_staff_id` column and
a partial-unique-index scheme replacing the old shared `(obligation_id,
period_key)` constraint, then seeds the six DHHS91172-mandated obligations
(30-day orientation, annual 12hr CE, CPR/First Aid initial + renewal,
annual background screening, annual Medicaid exclusion screening) for True
North Supports, each locked (`source = 'sow'`, `is_locked = true`) so
they can't be edited or deleted from the UI. **Run this after** the "All
Staff" auto-group block above — the seed block raises an exception if
that group doesn't exist yet.

Matches migration
`supabase/migrations/20260814020000_seed_company_obligations_defaults.sql`.

```sql
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS nectar_cert_type_label text,
  ADD COLUMN IF NOT EXISTS nectar_keyword_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.company_obligation_instances
  ADD COLUMN IF NOT EXISTS assignee_staff_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_assignee_staff
  ON public.company_obligation_instances(assignee_staff_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_obligation_instances_obligation_id_period_key_key'
  ) THEN
    ALTER TABLE public.company_obligation_instances
      DROP CONSTRAINT company_obligation_instances_obligation_id_period_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_shared_period
  ON public.company_obligation_instances(obligation_id, period_key)
  WHERE assignee_staff_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id)
  WHERE assignee_staff_id IS NOT NULL;

DO $$
DECLARE
  v_org_id uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
  v_all_staff_group_id uuid;
BEGIN
  SELECT id INTO v_all_staff_group_id
    FROM public.staff_groups
    WHERE organization_id = v_org_id AND name = 'All Staff'
    LIMIT 1;

  IF v_all_staff_group_id IS NULL THEN
    RAISE EXCEPTION 'All Staff group not found for org % — run the all_staff_auto_group migration first', v_org_id;
  END IF;

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    '30-Day New Hire Orientation Training',
    'DHHS91172 requires every new direct-service staff member to complete orientation training — HIPAA, abuse/neglect/exploitation reporting, person rights, HCBS settings rule, and emergency procedures — within 30 days of their hire date.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'one_time',
    '{"days_after_hire": 30}'::jsonb,
    ARRAY[14, 7, 3, 0],
    'upload_and_attestation',
    'I attest that I have completed the required 30-day new hire orientation training covering HIPAA, abuse/neglect/exploitation reporting, participant rights, the HCBS settings rule, and emergency procedures.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    '30-Day New Hire Training Certificate',
    '[{"label":"HIPAA","any_of":["hipaa","privacy","confidentiality"]},{"label":"Abuse/Neglect/Exploitation","any_of":["abuse","neglect","exploitation","mandatory reporter"]},{"label":"Participant Rights","any_of":["rights","person-centered","self-determination"]},{"label":"HCBS Settings Rule","any_of":["hcbs","settings rule"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = '30-Day New Hire Orientation Training'
  );

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Annual 12-Hour Continuing Education',
    'Direct-service staff must complete 12 hours of DSPD-approved continuing education each year, starting the year after hire.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'annually',
    '{"anniversary_based": true, "start_year": 2}'::jsonb,
    ARRAY[30, 14, 0],
    'upload_and_attestation',
    'I attest that I have completed at least 12 hours of DSPD-approved continuing education for this anniversary year.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'Annual Continuing Education Certificate (12 hours)',
    '[{"label":"Continuing Education","any_of":["continuing education","ce hours","training hours","annual training"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Annual 12-Hour Continuing Education'
  );

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'CPR/First Aid Certification — Initial',
    'Direct-service staff must hold a current CPR/First Aid certification within 30 days of hire.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'one_time',
    '{"days_after_hire": 30}'::jsonb,
    ARRAY[14, 7, 3, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'CPR/First Aid Certification',
    '[{"label":"CPR","any_of":["cpr","cardiopulmonary resuscitation"]},{"label":"First Aid","any_of":["first aid"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'CPR/First Aid Certification — Initial'
  );

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'CPR/First Aid Certification — Renewal',
    'CPR/First Aid certification must stay current — renew before it expires. A passing NECTAR-verified upload schedules the next renewal from the certificate''s own expiration date.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'CPR/First Aid Certification',
    '[{"label":"CPR","any_of":["cpr","cardiopulmonary resuscitation"]},{"label":"First Aid","any_of":["first aid"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'CPR/First Aid Certification — Renewal'
  );

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Background Screening — Annual',
    'Direct-service staff must have a current background screening clearance on file, re-verified annually from hire date.',
    'DHHS91172 SOW §1.10 — Background Screening',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'Background Screening Clearance',
    '[{"label":"Background Screening","any_of":["background check","background screening","criminal history","bci"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Background Screening — Annual'
  );

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Medicaid Fraud & Abuse Exclusion Screening — Annual',
    'Staff must be screened annually against the OIG/Medicaid exclusion lists per OIG FWA reporting requirements.',
    'DHHS91172 SOW §1.11 — Program Integrity',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload_and_attestation',
    'I attest that this staff member has been screened against the OIG and Medicaid exclusion lists for the current period with no exclusions found.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'OIG/Medicaid Exclusion Screening Confirmation',
    '[{"label":"Exclusion Screening","any_of":["exclusion","oig","leie","medicaid exclusion","sam.gov"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Medicaid Fraud & Abuse Exclusion Screening — Annual'
  );
END $$;
```

**What you'll see:** two `ALTER TABLE` (new columns), `CREATE INDEX`, a
`DO` block dropping the old shared-uniqueness constraint if present, two
more `CREATE INDEX` (the replacement partial-unique scheme), then a `DO`
block seeding six obligations — re-running this block is safe, each
`INSERT` is guarded by `WHERE NOT EXISTS` so it won't duplicate.

---

## ACTION — NECTAR document intelligence for Company Obligations (2026-08-14)

**What this is for:** Adds the columns `recordCompletion()` writes when it
runs NECTAR OCR against an uploaded evidence file — pass/fail status,
failure reasons, extracted cert type / name / completed / expiration
dates, name-match result, confidence — plus `admin_notes` for the
"confirm a failed validation" override flow. The first `ALTER TABLE` here
duplicates the one in the seed-defaults block above; it's written as a
defensive no-op (`IF NOT EXISTS`) in case this block is ever run against a
database that skipped that one.

Matches migration
`supabase/migrations/20260814030000_company_obligation_nectar_validation.sql`.

```sql
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS nectar_cert_type_label text,
  ADD COLUMN IF NOT EXISTS nectar_keyword_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.company_obligation_completions
  ADD COLUMN IF NOT EXISTS nectar_validation_status text CHECK (nectar_validation_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS nectar_validation_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nectar_extracted_cert_type text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_name text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_completed_date date,
  ADD COLUMN IF NOT EXISTS nectar_extracted_expires_date date,
  ADD COLUMN IF NOT EXISTS nectar_name_match text CHECK (nectar_name_match IN ('match', 'mismatch', 'unreadable')),
  ADD COLUMN IF NOT EXISTS nectar_confidence numeric;

ALTER TABLE public.company_obligation_completions
  ADD COLUMN IF NOT EXISTS admin_notes text;
```

**What you'll see:** one `ALTER TABLE` widening `company_obligations`
(harmless no-op if already applied above), then two more `ALTER TABLE`
statements adding eight columns total to
`public.company_obligation_completions`. No existing columns, rows, or
constraints are touched.

---

## ACTION — Obligation scope + client targeting, remaining SOW obligations seed (2026-08-14)

**What this is for:** Company Obligations currently only supports one
instance per staff member. This adds `scope` (`org` / `staff` /
`staff_per_client`) so an obligation can instead generate a single shared
org-wide instance (e.g. an OL license renewal), or one instance per active
staff+client assignment (e.g. client-specific training due 30 days after a
caseload assignment). Then seeds the ~29 remaining SOW-mandated obligations
from DHHS91172 that weren't part of the original six universal ones.

Run the two blocks below in order. **Clear the editor before each.**

Matches migration
`supabase/migrations/20260814050000_obligation_scope_and_client_targeting.sql`.

```sql
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'staff'
    CHECK (scope IN ('org', 'staff', 'staff_per_client')),
  ADD COLUMN IF NOT EXISTS target_service_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.company_obligation_instances
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_name text;

ALTER TABLE public.company_obligation_instance_assignees
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_name text;

UPDATE public.company_obligations
SET scope = 'staff'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND source = 'sow';

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_client
  ON public.company_obligation_instances(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_staff_client
  ON public.company_obligation_instances(assignee_staff_id, client_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NOT NULL;

DROP INDEX IF EXISTS idx_company_obligation_instances_person_period;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_client_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id, client_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NOT NULL;
```

**What you'll see:** two `ALTER TABLE` statements widening
`company_obligations` (new `scope`/`target_service_codes` columns), two more
adding `client_id`/`client_name` to the instances and assignees tables, one
`UPDATE` touching the six existing universal obligations (sets `scope =
'staff'`, a no-op since that's already the column default), two new
`CREATE INDEX`, then an index rebuild (`DROP INDEX` + two `CREATE UNIQUE
INDEX`) that splits the existing per-person uniqueness constraint so a
staff+client pairing is unique on its own dimension. No existing rows are
deleted or altered beyond that one `scope` backfill.

Second block seeds ~29 obligation definitions (org-level shared-instance
ones like OL licenses and UPI attestations, staff-level ones like ACRE/HSQ
training targeted by service code, and two staff_per_client ones —
Client-Specific Training and Support Strategies — that generate one
instance per active staff+client assignment). Every insert is guarded with
`WHERE NOT EXISTS`, so it's safe to re-run.

Matches migration
`supabase/migrations/20260814060000_seed_remaining_sow_obligations.sql`.
Paste the full contents of that file here (too long to duplicate in this
doc) — it's a single `DO $$ ... END $$;` block with ~29 guarded `INSERT`
statements.

**What you'll see:** up to 29 new rows in `public.company_obligations`
(fewer if some titles already exist from a prior partial run — the
`WHERE NOT EXISTS` guard skips those). No existing obligation rows are
touched.

---

## ACTION — NECTAR review service-code column (2026-08-17)

**What this is for:** the punch-pad clock-out NECTAR Documentation Coach
review now records which service-code context it evaluated the note under
(`nectar_review_service_code`). `evv_timesheets.attested_accurate`,
`attested_at`, `ai_compliance_status`, `ai_compliance_feedback`, and
`ai_coaching_iterations` already exist — only this one column is new.

```sql
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS nectar_review_service_code text;
```

Matches migration
`supabase/migrations/20260817120000_add_nectar_review_service_code.sql`.

**What you'll see:** one new nullable `text` column on `evv_timesheets`. No
existing rows are touched.

---

## ACTION — Role security audit: close role-escalation gaps + add audit trail (2026-08-17)

**What this is for:** a security audit found several places a caller could
reach `super_admin` or another elevated role without going through the
admin-controlled `setMemberGrants` path — a self-insert RLS policy with no
role check, no DB-level constraint on `invitations.role`, and no audit
trail for role changes. This block closes those gaps and adds a
`role_change_audit_log` table so every role change (manual, invitation,
staff creation, deactivation) is recorded and visible to admins in-app.

Paste the full contents of
`supabase/migrations/20260817130000_role_security_hardening.sql` here —
it's long (policy fix + constraint + new table/RLS + two function
replacements), so it isn't duplicated in this doc.

Before running: this block adds `CHECK (role IN ('admin','employee'))` to
`public.invitations`. If any row in `invitations` currently has a role
outside that set, the `ALTER TABLE ... ADD CONSTRAINT` will fail — run
`SELECT DISTINCT role FROM public.invitations;` first and tell me if you
see anything other than `admin`/`employee` so we can decide how to handle
those rows before retrying.

**What you'll see:**
- The `self insert member` policy on `organization_members` is replaced —
  self-inserts now require `role = 'employee'`.
- A new `invitations_role_check` constraint on `invitations`.
- A new empty table `public.role_change_audit_log` with RLS enabled (org
  admins/managers and super admins can read; no direct inserts are
  permitted — the app writes to it via the service role).
- `public.flag_member_deactivated()` is created.
- `public.accept_invitation()` is replaced (adds a role guard and
  auto-revokes duplicate pending invites on acceptance). No existing
  invitations or memberships are touched by the replacement itself.

---

## ACTION — Permission system rebuild: granular matrix + individual overrides + audit log + scope (2026-08-17)

**What this is for:** the permissions rebuild expands `role_permissions`
from ~29 coarse toggles to a full granular matrix (people/clients/
scheduling/timesheets/documentation/compliance/incidents/medications/hrc/
financial/organization), adds a per-user grant/deny override layer that
`usePermissions()` now actually reads, a `permission_audit_log` for every
change, and a `scope_assignments` table for restricting a supervisor's
visible data. It does **not** touch the separate `rbac_roles` /
`has_capability` capability system (pass 1) — that system already exists,
is unused by any current UI, and is out of scope here.

Paste the full contents of
`supabase/migrations/20260817140000_permission_system_rebuild.sql` here —
it's long (seed function + two new tables + policy changes + a check
constraint update), so it isn't duplicated in this doc.

Before running: this block does `DROP TABLE IF EXISTS
public.user_capability_overrides CASCADE`. That table has zero
application-code references (confirmed via repo-wide search — only
`src/integrations/supabase/types.ts` mentions it), so dropping it does not
remove any live functionality. If you have any manually-entered rows in
that table you want preserved, tell me before running this block and we'll
export them first.

**What you'll see:**
- `public.seed_org_role_permissions(_org uuid)` — new function. Backfills
  a complete `role_permissions` matrix (every permission × every role,
  `admin`/`super_admin` enabled, `manager`/`employee`/`committee_member`
  per the `DEFAULT_MATRIX` in `src/lib/rbac.ts`) for every existing org,
  using `ON CONFLICT DO NOTHING` so any permission your team has already
  customized is left untouched. A new trigger seeds new orgs the same way
  going forward.
- `public.user_capability_overrides` is dropped (see note above).
- New table `public.user_permission_overrides` — per-user permission
  grant/deny rows with reason, granter, and optional expiry. RLS: org
  owners (or platform admins) can read/write all rows for their org; a
  user can read their own rows.
- New table `public.permission_audit_log` — append-only history of every
  role-permission or override change. RLS: org owners can read; direct
  user inserts are blocked (the app writes via server functions).
- `public.role_permissions` policies are replaced with equivalent
  explicit-named ones (`org members read role permissions` / `owners
  write role permissions`) — same access, clearer names, no behavior
  change for existing rows.
- New table `public.scope_assignments` — per-user data-scope restriction
  (service code / staff group / client / all). RLS: org owners manage;
  a user can read their own scope row.
- `public.has_permission(_user_id, _org_id, _perm)` — the existing
  server-side authorization RPC used by `src/lib/require-permission.ts`
  across many server functions — is replaced to check
  `user_permission_overrides` first (respecting expiry), before falling
  back to `role_permissions` exactly as it did before. This makes granular
  server-enforced permission gates respect individual overrides the same
  way the client `usePermissions()` hook does.
- `public.notifications`'s `type` check constraint gains one new allowed
  value, `'permission_requested'`, for the staff "Request access" flow.
  No existing notification rows are touched.

---

## ACTION — Company Obligations follow-up fixes: urgency constraint, cadence data, instance regeneration (2026-08-19)

**What this is for:** TNS review of the Company Obligations tracker turned
up six issues: a stale `notifications.urgency` CHECK constraint rejecting
the `'high'` value the reminder/notify code already sends; a wrong
`cadence` value on CPR Renewal; stale obligation instances that need to
regenerate under corrected due-date logic (CPR Initial's 90-day window, a
new 30-day grace period for `days_after_hire: 0` obligations on existing
staff, and corrected anniversary configs for Annual 12-Hour Continuing
Education / Background Screening); and ACRE Training (and other
service-code-targeted staff obligations) generating instances for staff who
don't actually work with that service code.

Paste the full contents of
`supabase/migrations/20260819150921_obligations_followup_fixes.sql` here —
it's a sequence of six independent blocks (constraint fix, cadence
correction, three instance-regeneration deletes, two due_day_config
corrections), so it isn't duplicated in this doc.

Before running: this block assumes True North Supports FAKE's organization
id is `7fabcf5d-f826-487f-8730-8b0c3f1969bb` (used throughout the existing
obligations seed data). If that's changed, tell me before running.

**What you'll see:**
- `public.notifications_urgency_check` is replaced to allow
  `('low','normal','high','urgent','critical')` — was
  `('normal','urgent','critical')`. No existing notification rows are
  touched; this only affects new inserts, which immediately stop failing
  with "violates check constraint notifications_urgency_check".
- CPR Renewal's `cadence` is corrected to `'annually'` for TNS FAKE (only
  if it isn't already, and only if its `due_day_config` actually has
  `every_n_months` set — a data-only change, no schema change).
- CPR Initial's existing instances for TNS FAKE are deleted so
  `listCompanyObligations`'s bootstrap regenerates them with the corrected
  90-day `due_day_config` on next page load.
- Instances for any obligation with `due_day_config->>'days_after_hire' =
  '0'` are deleted for TNS FAKE, so they regenerate under the new 30-day
  grace-period logic (existing staff get 30 days from when the obligation
  was added to the platform, instead of being immediately overdue).
- Annual 12-Hour Continuing Education and Background Screening — Annual
  get their `due_day_config` corrected to include `anniversary_based: true`
  (12-Hour also gets `start_year: 2`) if either field was missing, then
  their instances are deleted so they regenerate correctly.
- Instances for staff-scoped obligations targeting SEI/SED/SJD/SEE/HSQ/
  PPS/CMP/CMS service codes (ACRE Training and similar) are deleted for TNS
  FAKE so they regenerate under the corrected assignee filter — only staff
  actually assigned to a client with a matching service code get an
  instance, instead of every member of the assigned group.

---

## ACTION — Diagnose + backfill `manage_users` in `role_permissions` (2026-08-19)

**What this is for:** admins are hitting the unauthorized page on the
employee profile, clients, and compliance-desk routes, which are all
gated by `perm="manage_users"` (`RequirePermission` in
`src/components/rbac-guard.tsx`). `usePermissions()` resolves permissions
**only** from `role_permissions` for the current org — there is no
runtime fallback to `DEFAULT_MATRIX` in `src/lib/rbac.ts` — so a missing
or `enabled=false` row denies access even to admins.

`manage_users` is already listed in the `_all_perms` array of
`seed_org_role_permissions()` (added in the 2026-08-17 permission-system
migration, which was supposed to backfill every existing org with
`admin`/`super_admin` set to `enabled=true`). The diagnostic block below
was run and confirmed the gap is real and platform-wide: **all 24 orgs**
came back with no `role_permissions` row at all for `manage_users` on
`admin` or `super_admin` — the 2026-08-17 backfill did not actually reach
this key, for reasons the live DB doesn't show us from here.

**Update:** this is now fixed two ways —
1. Data: `supabase/migrations/20260819190000_seed_manage_users_admin.sql`
   seeds `manage_users=true` for `admin` (and `super_admin`, for
   audit-trail consistency) across all orgs.
2. Code: `src/hooks/use-permissions.tsx`'s `can()` now short-circuits
   `super_admin` to `true` unconditionally, mirroring the `super_admin`
   shortcut that `public.has_permission()` (the server-side RPC used by
   `src/lib/require-permission.ts`) already has. `super_admin` is
   excluded from the editable matrix in `dashboard.permissions.tsx`, so
   it must never depend on a `role_permissions` row existing — the
   `admin` role still goes through the seeded matrix row.

**Diagnostic block (already run, kept here for reference):**

```sql
SELECT o.name AS organization_name, o.id AS organization_id,
       rp.role, rp.enabled
FROM public.organizations o
LEFT JOIN public.role_permissions rp
  ON rp.organization_id = o.id
 AND rp.permission = 'manage_users'
 AND rp.role IN ('admin', 'super_admin')
ORDER BY o.name, rp.role;
```

**To apply the fix:** paste the full contents of
`supabase/migrations/20260819190000_seed_manage_users_admin.sql` here and
run it.

**What you'll see:** a `manage_users` row with `enabled = true` for
`admin` and `super_admin` in every org — inserted where the row was
missing, flipped to `true` where it existed but was disabled. Rows that
were already `enabled = true` are left untouched (`DO UPDATE` only fires
`WHERE enabled = false`, so `updated_at` doesn't churn on rows that don't
need it). This does not touch `manager`, `employee`, or
`committee_member` rows, and does not touch any other permission key. The
`super_admin` code fix takes effect immediately on deploy and doesn't
depend on this SQL running at all — the SQL is belt-and-suspenders for
the `admin` role and for keeping the matrix table accurate.

---

## ACTION — Combine CPR Initial + Renewal into one obligation (2026-08-19, Fix 14)

**What this is for:** Two CPR obligations was wrong — it's one continuous
requirement (certify within 90 days of hire, renew every 2 years from the
cert's own expiration date). This deletes the separate "Renewal"
obligation, folds its renewal config onto the "Initial" obligation (now
retitled "CPR & First Aid Certification"), and clears existing instances
so they regenerate under the corrected combined config. The app code
(`generatePerPersonInstancesInternal` for the first instance,
`recordCompletion` for cert-expiration-driven renewals) already reads
both `days_after_hire` and `every_n_months`/`from: cert_expiration` off
the same `due_day_config` — no code change was needed there, only the
`cadenceLabel`/`cadenceDescription` display strings.

**To apply:** paste the full contents of
`supabase/migrations/20260819200000_combine_cpr_initial_renewal.sql`
here and run it.

**What you'll see:** only one CPR obligation ("CPR & First Aid
Certification") on the Company Obligations page, badge reading "Due 90
days after hire · renews every 2 years from cert expiration", one
instance per staff member due 90 days from their hire date. When an
admin uploads a CPR cert and NECTAR reads an expiration date, a new
instance is scheduled automatically from that date — no separate renewal
obligation involved. The old "CPR/First Aid Certification — Renewal"
obligation is gone.

---

## ACTION — Verify permission-system migration ran + retire 4 legacy permission keys (2026-08-19)

**What this is for:** Prompt 2 of the permissions migration closed out the
last routes/server-fns still gating on the four coarse legacy keys
(`manage_users`, `manage_schedule`, `invite_users`, `remove_users`) —
every one of those call sites now uses the matching granular key
(`edit_staff_records`, `create_shifts`, `invite_staff`,
`deactivate_staff`/n-a). `ALL_PERMISSIONS`/`DEFAULT_MATRIX` in
`src/lib/rbac.ts` no longer list the four legacy keys at all.

**Step 1 — confirm the 2026-08-17 permission-system migration actually
ran.** Paste and run:

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_permission'
) AS has_permission_exists,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'scope_assignments'
) AS scope_assignments_exists,
EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_permission_overrides'
) AS user_permission_overrides_exists;
```

If any column comes back `false`, the 2026-08-17 migration
(`supabase/migrations/20260817140000_permission_system_rebuild.sql`,
already documented above) has not been applied — paste and run its full
contents first, then come back to Step 2. If all three are `true`, skip
straight to Step 2.

**Step 2 — retire the 4 legacy keys.** Paste and run the full contents of
`supabase/migrations/20260819210000_retire_legacy_permission_keys.sql`.
It:
1. Redefines `seed_org_role_permissions()` to drop `manage_users`,
   `manage_schedule`, `invite_users`, `remove_users` from the arrays it
   seeds — new orgs stop getting rows for these keys.
2. Deletes existing `role_permissions` and `user_permission_overrides`
   rows for those 4 keys across every org — nothing in the codebase
   checks them anymore, so they're just dead rows in the matrix UI.
3. Redefines `has_permission()` to drop the same 4 keys from its
   dead-code fallback `CASE` (only reachable for a role/permission pair
   that predates `seed_org_role_permissions` — kept for safety, updated
   for consistency).

**What you'll see:** `SELECT DISTINCT permission FROM role_permissions
WHERE permission IN ('manage_users','manage_schedule','invite_users','remove_users')`
returns zero rows afterward. The permissions matrix UI
(`dashboard.permissions.tsx`) no longer shows the 4 legacy toggles.
Existing behavior for staff invites, shift creation, and staff-record
editing is unchanged because every caller already moved to the granular
equivalent key, which was already enabled for the same roles.

**After this runs:** regenerate `src/integrations/supabase/types.ts` from
the live schema (Lovable's type sync, or the Supabase CLI) so any new
columns/tables are reflected — this migration doesn't add new tables, so
a type regen isn't strictly required here, but do it if Step 1 above
triggered running the 2026-08-17 migration for the first time (that one
adds `scope_assignments`, `user_permission_overrides`,
`permission_audit_log`).

---

## ACTION — Database cleanup batch 1 (revised): drop verified-dead tables (2026-08-19)

**What this is for:** A cleanup pass asked to drop ~40 tables in three
batches to get the schema under 150 tables. Before running anything, a
full-codebase grep audit was run against every table in the proposed
Batch 1 (`.from("...")` / `.rpc("...")` call sites in `src/**/*.{ts,tsx}`,
not just a keyword search) and against all of Batch 2. Almost everything in
the original list turned out to be **actively read/written by live code** —
`celebration_events`/`celebration_acknowledgements`/`org_celebration_settings`/
`user_celebration_mute` (`src/lib/celebrations.functions.ts`), `whiteboard_notes`
(`src/lib/whiteboard-notes.functions.ts`), `user_ui_dismissals`
(`src/lib/ui-dismissals.functions.ts`), the whole state-onboarding subsystem
(`state_derived_requirements`, `state_structural_gaps`,
`state_requirement_sources`, `state_templates`, `state_onboarding_sessions`,
`hive_base_template_versions`, `provisioning_plan`, `provisioning_rules`,
`platform_states` — used by `state-*.functions.ts`,
`state-onboarding.functions.ts`, `state-base-versions.functions.ts`, and
queried directly in `dashboard.tsx`), `agreement_requirements`
(`src/lib/agreements.functions.ts`), the NECTAR compliance-flag/deadline
engine (`nectar_compliance_flags`, `nectar_compliance_rules`,
`nectar_compliance_rule_history`, `nectar_compliance_instances` — used in
`nectar-compliance.functions.ts`, `compliance-resolution.ts`,
`use-deadlines.tsx`, `authoritative-sources.functions.ts`), `general_shifts`
(staff mobile clock, `use-general-shift.tsx` /
`active-shift-bar.tsx`), `external_certifications`
(`staff-qualifications.functions.ts`), and `functionality_reports` /
`mcp_column_catalog` / `mcp_table_catalog` (MCP tooling). All of proposed
Batch 2 (scheduling V2, training tracks, gmail ingestion, financial
distributions) is likewise live and backs reachable `/dashboard/*` routes —
none of it was dropped. `home_designations` was excluded outright per
CLAUDE.md (Homes & Teams care-team role labels — never delete).

Only 12 tables came back with **zero** query references anywhere in `src/`:
the old Hive Training commerce tables, `master_attestations`,
`referral_purge_tombstones`, `staff_nudges`, `user_capability_overrides`,
`rbac_roles` (superseded by `role_permissions` — its only `src/` hit was a
stale FK name in generated `types.ts`), `unfiled_items`, and
`hhs_emar_logs_deprecated`. Row counts were **not** independently
re-verified from this pass (no live DB access) — the migration only checked
code references; the four boxes below still assume the original
Batch-1 claim that they hold zero rows, so please confirm that before
running if you have any doubt.

**To apply:** paste the full contents of
`supabase/migrations/20260819203000_drop_verified_dead_tables.sql`
here and run it.

**What you'll see:** twelve `DROP TABLE IF EXISTS ... CASCADE` statements,
no errors. Table count drops by 12 (339 → 327), not the ~40 originally
targeted — the remainder needs a real code-removal pass (removing the live
call sites first) before it can be dropped safely, which is out of scope
for this batch.

---

## ACTION — Database cleanup batch 3: fold staff_training_hours_entries into ce_ledger (2026-08-19)

**What this is for:** `staff_training_hours_entries` (admin-logged manual
training hours, one narrow feature) and `ce_ledger` (the CE record store)
overlapped enough to consolidate. The migration adds `note`,
`requirement_id`, `created_by`, `entry_date` columns to `ce_ledger`, copies
every row from `staff_training_hours_entries` in as
`source = 'manual_entry'` (title falls back to `'Manually logged training
hours'` when `note` is blank), then drops the old table.

**RLS note:** `ce_ledger` was designed as a self-attestation ledger — staff
insert their own rows and nothing is ever updated/deleted. But
`staff_training_hours_entries` is the opposite shape: admins/team-managers
log hours ON BEHALF OF staff, and can edit/delete their own entries. Rather
than weaken the self-attestation policies, the migration adds a *second*,
`source = 'manual_entry'`-scoped INSERT policy and a DELETE policy (plus
the `DELETE` grant, which `ce_ledger` didn't have before) so admin-logged
rows keep working exactly like they did on the old table. Real CE
self-attestation rows (`source <> 'manual_entry'`) stay fully immutable —
no policy covers UPDATE/DELETE for them.

`src/lib/hr-training-hours.functions.ts` and the rollup query in
`src/lib/hr-staff.functions.ts` were updated in the same commit to read
`ce_ledger` filtered by `source = 'manual_entry'` instead of
`staff_training_hours_entries`.

**To apply:** paste the full contents of
`supabase/migrations/20260819203500_consolidate_training_hours_into_ce_ledger.sql`
here and run it.

**What you'll see:** an `ALTER TABLE` adding 4 columns, an `INSERT ...
SELECT` copying every existing manual-hours row, two `CREATE POLICY`
statements, one `GRANT DELETE`, then `DROP TABLE ... CASCADE`. The HR
staff "annual training hours" tab and rollup are unaffected — same admin
add/delete UI, same numbers, just backed by `ce_ledger` now.

**After this runs:** regenerate `src/integrations/supabase/types.ts` from
the live schema — `ce_ledger` has 4 new columns and
`staff_training_hours_entries` is gone.
