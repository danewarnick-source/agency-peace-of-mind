
-- Shared enums for effective dating across all three doc tables
do $$ begin
  create type public.doc_effective_to_mode as enum ('fixed_date','ongoing','until_replaced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_status as enum ('current','outdated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_date_source as enum ('from_document','provider_entered');
exception when duplicate_object then null; end $$;

-- Helper to add the seven columns uniformly
create or replace function public._add_effective_dating_cols(tbl regclass) returns void
language plpgsql as $$
declare
  t text := tbl::text;
begin
  execute format('alter table %s add column if not exists effective_from date', t);
  execute format('alter table %s add column if not exists effective_to date', t);
  execute format('alter table %s add column if not exists effective_to_mode public.doc_effective_to_mode', t);
  execute format('alter table %s add column if not exists status public.doc_status not null default ''current''', t);
  execute format('alter table %s add column if not exists superseded_by uuid', t);
  execute format('alter table %s add column if not exists superseded_at timestamptz', t);
  execute format('alter table %s add column if not exists date_source public.doc_date_source', t);
end $$;

select public._add_effective_dating_cols('public.client_documents');
select public._add_effective_dating_cols('public.employee_documents');
select public._add_effective_dating_cols('public.nectar_documents');

-- Self-referencing FKs for superseded_by (guarded)
do $$ begin
  alter table public.client_documents
    add constraint client_documents_superseded_by_fkey
    foreign key (superseded_by) references public.client_documents(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.employee_documents
    add constraint employee_documents_superseded_by_fkey
    foreign key (superseded_by) references public.employee_documents(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.nectar_documents
    add constraint nectar_documents_superseded_by_fkey
    foreign key (superseded_by) references public.nectar_documents(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Indexes to find current docs quickly
create index if not exists client_documents_status_idx
  on public.client_documents (organization_id, client_id, document_type, status);
create index if not exists employee_documents_status_idx
  on public.employee_documents (organization_id, staff_id, kind, status);
create index if not exists nectar_documents_status_idx
  on public.nectar_documents (organization_id, owner_kind, document_type, status);

drop function public._add_effective_dating_cols(regclass);
