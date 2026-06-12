alter table public.clients add column if not exists hhs_monthly_support_hours numeric;

create table if not exists public.host_supervision_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null references public.clients(id),
  contact_date date not null,
  contact_type text not null default 'home_visit',
  summary text,
  conducted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.host_supervision_contacts to authenticated;
grant all on public.host_supervision_contacts to service_role;

alter table public.host_supervision_contacts enable row level security;

create policy "org members read supervision"
  on public.host_supervision_contacts for select
  using (public.is_org_member(organization_id, auth.uid()));

create policy "org managers write supervision"
  on public.host_supervision_contacts for insert
  with check (public.is_org_admin_or_manager(organization_id, auth.uid()));

create policy "org managers update supervision"
  on public.host_supervision_contacts for update
  using (public.is_org_admin_or_manager(organization_id, auth.uid()));