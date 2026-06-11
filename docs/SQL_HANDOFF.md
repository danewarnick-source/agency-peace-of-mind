# SQL Handoff — run these in Lovable's SQL editor

Each block is copy-paste ready. **Clear the editor before pasting each block.**
Run blocks top to bottom; each has a "what you'll see" note so you can confirm
it worked before moving on.

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
