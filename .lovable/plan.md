# Executive Command Center — build plan

This is a **regroup + additive** pass. Every existing HIVE Executive tab keeps its route, component, and behavior. New surfaces layer on top. Steve is a UI shell only; no model wiring.

## 1. Tab mapping (nothing removed)

| Existing tab | Route (unchanged) | New domain |
|---|---|---|
| Companies | `/dashboard/hive-exec` (index) | Growth & Accounts |
| Add Company | `/dashboard/hive-exec/new-company` | Growth & Accounts |
| Company Migration | `/dashboard/hive-exec/company-migration` | Growth & Accounts |
| Plans & Billing | `/dashboard/hive-exec/plans` | Growth & Accounts |
| Upgrade Requests | `/dashboard/hive-exec/upgrade-requests` | Growth & Accounts |
| Extraction Approvals | `/dashboard/hive-exec/approvals` | Compliance & Approvals |
| Billing Approvals | `/dashboard/hive-exec/billing-approvals` | Compliance & Approvals |
| States | `/dashboard/hive-exec/states` | Configuration |
| Permissions & Roles | `/dashboard/hive-exec/permissions` | Configuration |
| Account Health | `/dashboard/hive-exec/health` | Operations & Support |
| Support Queue | `/dashboard/hive-exec/tickets` | Operations & Support |
| Message Center | `/dashboard/hive-exec/messages` | Operations & Support |
| NECTAR (exec) | `/dashboard/hive-exec/nectar` | Operations & Support |

**New routes added:**
- `/dashboard/hive-exec/command` — landing (Command Center home, default redirect target)
- `/dashboard/hive-exec/agreements` — Agreements Matrix (portfolio + per-org)
- `/dashboard/hive-exec/agreements/requirements` — Master checklist admin
- `/dashboard/hive-exec/agreements/$orgId` — Per-org view
- `/dashboard/hive-exec/features` — Feature Registry management
- `/dashboard/hive-exec/functionality` — IT/Functionality channel

## 2. Capability layer

New file `src/lib/exec-capabilities.ts`:
- Type `ExecCapability` union of all 12 keys.
- `EXECUTIVE_ROLE_CAPABILITIES: Record<'executive', ExecCapability[]>` — single role holds all.
- `capabilitiesFor(role)` → array.

New hook `src/hooks/use-exec-capability.tsx`:
- `useExecCapabilities()` → wraps existing `useIsHiveExecutive`; if executive, returns all caps.
- `useCapability(key)` → `{ allowed, isLoading }`.
- `<RequireCapability cap="…">` guard component mirroring `RequireHiveExecutive`.

All new surfaces and reworked nav call `useCapability`. Existing routes keep `RequireHiveExecutive` — capability check layered by wrapping route components in `RequireCapability` inline (no removal of existing guard).

## 3. Nav reorganization

Rewrite `src/lib/exec-nav.ts` to `EXEC_DOMAINS: ExecDomain[]` with `{ id, label, capability, items: ExecNavItem[] }`. Old flat `EXEC_NAV` export stays as a derived flat list for any consumer that needs it.

`src/routes/dashboard.hive-exec.tsx`:
- Rename header to "HIVE Platform · Executive Command Center" with subtitle "Platform operations".
- Replace the flat `<nav>` tab strip with a two-column layout: left **sidebar** listing 4 domains (each collapsible, only rendered if user has ≥1 cap in it, active-branch auto-open), right `<Outlet />`.
- Domain sidebar uses shadcn `Sidebar` primitives already available.
- Preserve the PHI-safety badge.

Update index route so `/dashboard/hive-exec` renders the new **Command Center landing** (keeps existing Companies list moved to `/dashboard/hive-exec/companies` — OR keep Companies at index and add landing at `/command`). **Decision: landing at `/dashboard/hive-exec/command`; index redirects there. Move Companies list to `/dashboard/hive-exec/companies`** and add a redirect from any old callers. Actually — safer: **keep Companies at index** (no route churn), add landing at `/command` and mark it as the domain-nav default surface / "Command Center" home link. Every domain card on landing links to first sub-item. Update portal-view switcher label to "Executive Command Center".

## 4. Landing (`/dashboard/hive-exec/command`)

Components (new, under `src/components/hive-exec/command/`):
- `CommandHeader` — title, subtitle, PHI badge.
- `MetricRow` — MRR + MoM, Active companies + trial count, Past due. Backed by new server fn `getCommandMetrics` reading `org_subscriptions` (no PHI).
- `NeedsYouQueue` — server fn `getNeedsYouSummary` returning counts + first-page items for: pending upgrades, pending extraction approvals, pending billing approvals, open functionality reports, agreements overdue/expiring ≤30d. Upgrade-requests row rendered in amber emphasis.
- `DomainEntryCards` — 4 cards, capability-gated, deep-link into each domain's first surface.
- `SteveDockPanel` — right rail, `steve.use` gated.

## 5. Steve shell

`src/components/hive-exec/command/steve-panel.tsx`:
- Label "Steve — Exec assistant · no PHI".
- 4 suggested-prompt chips (static strings from spec).
- Input + Send button, both **disabled with "Coming soon"** tooltip. onClick no-op.
- No API calls, no model imports.
- Note in JSDoc: exec-plane only; must never reach org PHI tables.

Existing NECTAR route (`/dashboard/hive-exec/nectar`) untouched — Steve is landing-embedded, not a route replacement.

## 6. Agreements Matrix

**Migration** (`supabase--migration`):

```sql
create table public.agreement_requirements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  required boolean not null default true,
  renewal_period_months int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.agreement_requirements to authenticated;
grant all on public.agreement_requirements to service_role;
alter table public.agreement_requirements enable row level security;
create policy "exec read reqs" on public.agreement_requirements for select to authenticated using (public.is_hive_executive(auth.uid()));
create policy "exec write reqs" on public.agreement_requirements for all to authenticated using (public.is_hive_executive(auth.uid())) with check (public.is_hive_executive(auth.uid()));

create type agreement_status as enum ('not_started','sent','signed','expired');

create table public.organization_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.agreement_requirements(id) on delete restrict,
  status agreement_status not null default 'not_started',
  file_path text,
  signed_date date,
  expiration_date date,
  renewal_due_date date,
  notes text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, requirement_id)
);
grant select, insert, update, delete on public.organization_agreements to authenticated;
grant all on public.organization_agreements to service_role;
alter table public.organization_agreements enable row level security;
create policy "exec read agreements" on public.organization_agreements for select to authenticated using (public.is_hive_executive(auth.uid()));
create policy "exec write agreements" on public.organization_agreements for all to authenticated using (public.is_hive_executive(auth.uid())) with check (public.is_hive_executive(auth.uid()));

-- update triggers using existing update_updated_at_column()
```

(Uses existing `is_hive_executive` helper if present; otherwise a `public.has_hive_exec()` variant — will confirm before writing migration.)

**Server functions** (`src/lib/agreements.functions.ts`):
- `listAgreementRequirements`
- `upsertAgreementRequirement` (gate `agreements.manage`)
- `deleteAgreementRequirement`
- `getOrgAgreements(orgId)` — checklist with joined requirement metadata
- `upsertOrgAgreement`
- `listAgreementsMatrix` — all orgs × all requirements with status
- `listAgreementsAttention` — overdue + expiring ≤30d (feeds Needs You)

**Routes/components:**
- `/dashboard/hive-exec/agreements` — matrix grid, sortable, status-chip cells, filter "overdue/expiring first".
- `/dashboard/hive-exec/agreements/requirements` — CRUD table for master checklist.
- `/dashboard/hive-exec/agreements/$orgId` — per-org panel.
- Reusable `AgreementsPanel` also embeddable from existing Companies detail (drop into org drawer if trivial; otherwise defer — spec allows "open any org → panel", achieved via per-org route linked from Companies list).

No file storage wired to Supabase Storage in this pass — `file_path` accepts a URL/string; upload dialog captures a plain URL field with note "TODO: bucket upload". This keeps scope contained; add bucket in follow-up.

## 7. Feature Registry management

Reuses existing `feature_registry` table.
- Route `/dashboard/hive-exec/features` — list, add, edit rows (name, key, description, default state, category).
- Server fns `listFeatureRegistry`, `upsertFeatureRegistryEntry` (gate `features.manage`).

## 8. IT/Functionality channel

**Migration:**

```sql
create type functionality_report_source as enum ('self_report','auto_detect');
create type functionality_report_status as enum ('open','triaged','resolved','dismissed');

create table public.functionality_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  reported_by uuid references auth.users(id) on delete set null,
  source functionality_report_source not null default 'self_report',
  screen text,
  description text not null,
  technical_context jsonb not null default '{}'::jsonb,
  status functionality_report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.functionality_reports to authenticated;
grant all on public.functionality_reports to service_role;
alter table public.functionality_reports enable row level security;
-- org members can insert their own reports
create policy "org insert own report" on public.functionality_reports for insert to authenticated
  with check (reported_by = auth.uid() and public.is_org_member(auth.uid(), organization_id));
-- exec reads all
create policy "exec read reports" on public.functionality_reports for select to authenticated
  using (public.is_hive_executive(auth.uid()));
create policy "exec update reports" on public.functionality_reports for update to authenticated
  using (public.is_hive_executive(auth.uid())) with check (public.is_hive_executive(auth.uid()));
```

Trigger: on insert, verify `technical_context` has no fields named like `client_*`, `phi_*`, `patient_*` (soft check via trigger raising notice; hard PHI stripping is caller responsibility per spec).

**Route** `/dashboard/hive-exec/functionality`:
- List of open reports, filter by status, drill-in dialog showing description + `technical_context` JSON pretty-printed.
- Actions: triage → resolved / dismissed.
- Counted into Needs You queue.

Exec-side intake only this pass; org-side "Alert HIVE Admin" button deferred (noted in code comment).

## 9. Naming sweep

Find/replace `"HIVE Executive"` user-facing strings with `"Executive Command Center"` in:
- Header/breadcrumb in `dashboard.hive-exec.tsx`
- Route `head()` meta titles across all `dashboard.hive-exec.*.tsx` (bulk: keep sub-page titles but prefix `— Executive Command Center` instead of `— HIVE`)
- Portal-view switcher label (search `hive-executive` / `HIVE Executive` in switcher components)
- `RequireHiveExecutive` fallback text
- Landing/operations banner heading

Internal identifiers (`hive-executives` table, `is_hive_executive` fn, `useIsHiveExecutive`, route path `hive-exec`) stay as-is — renaming DB/routes would break links and grants.

## 10. Verification

- `bun run build` green (regenerates `routeTree.gen.ts`).
- Manual: every old exec tab URL still loads its original component.
- Landing renders with metrics + Needs You + 4 domain cards + Steve panel.
- Steve input disabled.
- Agreements CRUD roundtrip via SQL check.
- Functionality report insert from org role visible in exec list.

## Technical notes / risks

- `is_hive_executive` SQL helper existence: verify via `supabase--read_query` before migration; fall back to `EXISTS (SELECT 1 FROM hive_executives WHERE user_id = auth.uid())` inline.
- Sidebar layout inside an already-nested dashboard shell needs `overflow` care on mobile — collapse to accordion under `md`.
- MRR calc: sum `org_subscriptions.monthly_amount` where status='active'; MoM from a stored snapshot or 30-day delta — if no historical table, show current MRR only with a "trend coming soon" muted note (avoids fabricating data).
- No PHI reaches exec plane: all new server fns restricted to org-metadata tables (`organizations`, `org_subscriptions`, `agreement_*`, `functionality_reports`, `feature_registry`).

Scope: ~2 migrations, ~4 new server-fn files, ~8 new routes/components, edits to `exec-nav.ts` + `dashboard.hive-exec.tsx` + portal-view switcher. Sizable but self-contained; no changes to org-side surfaces.
