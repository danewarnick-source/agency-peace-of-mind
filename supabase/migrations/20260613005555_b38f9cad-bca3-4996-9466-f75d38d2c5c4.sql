alter table public.organizations
  add column if not exists dhhs_provider_id text,
  add column if not exists evv_vendor_name text not null default 'Hive';

create table if not exists public.evv_export_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_number integer not null,
  range_start date not null,
  range_end date not null,
  row_count integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.evv_export_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id uuid not null references public.evv_export_batches(id),
  timesheet_id uuid not null references public.evv_timesheets(id),
  record_id integer not null,
  is_correction boolean not null default false,
  orig_record uuid references public.evv_export_records(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_evv_export_batches_org on public.evv_export_batches(organization_id, batch_number desc);
create index if not exists idx_evv_export_records_batch on public.evv_export_records(batch_id);
create index if not exists idx_evv_export_records_timesheet on public.evv_export_records(timesheet_id);

grant select, insert on public.evv_export_batches to authenticated;
grant all on public.evv_export_batches to service_role;
grant select, insert on public.evv_export_records to authenticated;
grant all on public.evv_export_records to service_role;

alter table public.evv_export_batches enable row level security;
alter table public.evv_export_records enable row level security;

create policy "org managers read batches" on public.evv_export_batches
  for select using (public.is_org_admin_or_manager(organization_id, auth.uid()));
create policy "org managers write batches" on public.evv_export_batches
  for insert with check (public.is_org_admin_or_manager(organization_id, auth.uid()));

create policy "org managers read export records" on public.evv_export_records
  for select using (public.is_org_admin_or_manager(organization_id, auth.uid()));
create policy "org managers write export records" on public.evv_export_records
  for insert with check (public.is_org_admin_or_manager(organization_id, auth.uid()));
