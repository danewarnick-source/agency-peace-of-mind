create table if not exists public.incident_sc_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  incident_id uuid not null references public.incident_reports(id),
  requested_at timestamptz not null,
  request_summary text not null,
  responded_at timestamptz,
  responded_by uuid references auth.users(id),
  response_summary text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.incident_sc_requests to authenticated;
grant all on public.incident_sc_requests to service_role;

alter table public.incident_sc_requests enable row level security;

create policy "org members read sc requests"
  on public.incident_sc_requests for select
  using (public.is_org_member(organization_id, auth.uid()));

create policy "org managers write sc requests"
  on public.incident_sc_requests for insert
  with check (public.is_org_admin_or_manager(organization_id, auth.uid()));

create policy "org managers update sc requests"
  on public.incident_sc_requests for update
  using (public.is_org_admin_or_manager(organization_id, auth.uid()));