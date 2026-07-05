# SQL Handoff — run these in Lovable's SQL editor

Each block is copy-paste ready. **Clear the editor before pasting each block.**
Run blocks top to bottom; each has a "what you'll see" note so you can confirm
it worked before moving on.

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
