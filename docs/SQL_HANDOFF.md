# SQL Handoff — run these in Lovable's SQL editor

Each block is copy-paste ready. **Clear the editor before pasting each block.**
Run blocks top to bottom; each has a "what you'll see" note so you can confirm
it worked before moving on.

---

## 1. Locations cleanup — rebuild `locations` from `teams` (2026-06-11)

`locations` and `home_designations` were polluted with staff-role labels
(DSP / House Manager / Lead / Supervisor). Homes live in `teams`; this wipes
both tables and rebuilds `locations` from real teams only.

> **Note:** you may have already run this cleanup. Run block **1b** (verify)
> first — if it already returns `Maple House [residential]`, skip block 1a.

### 1a. Cleanup + rebuild

```sql
delete from public.locations;
delete from public.home_designations;

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
re-enter coverage rules against the real homes afterwards. Care-team
designation labels (House Manager / Lead / etc.) are intentionally wiped —
`home_designations` is legacy and stays empty.

### 1b. Verify

```sql
select string_agg(name || ' [' || type || ']', ', ' order by name) from public.locations;
```

**What you'll see:** `Maple House [residential]` (one row, one home). If you
add more homes in Homes & Teams, they'll appear here automatically — the app
now mirrors every team into `locations` on create/edit.
