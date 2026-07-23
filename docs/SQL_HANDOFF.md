# SQL Handoff — run these in Lovable's SQL editor

Each block is copy-paste ready. **Clear the editor before pasting each block.**
Run blocks top to bottom; each has a "what you'll see" note so you can confirm
it worked before moving on.

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
