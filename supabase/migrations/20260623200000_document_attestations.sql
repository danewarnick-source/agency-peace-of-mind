create table if not exists public.document_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null,
  -- what is being attested: a baseline training key, a state_base requirement_id, or an hours-entry id
  subject_kind text not null check (subject_kind in ('baseline_cert','checklist_doc','training_hours')),
  subject_ref text not null,            -- e.g. baseline training_key, requirement_id uuid, or hours entry id
  hr_document_id uuid,                  -- nullable: hours attestations have no document
  attestation_text text not null,
  attested_by uuid not null,
  attested_by_name text,
  attested_at timestamptz not null default now()
);

alter table public.document_attestations enable row level security;

-- Read: org members can read their org's attestations
create policy doc_attest_select on public.document_attestations
  for select using (
    exists (select 1 from public.organization_members om
            where om.organization_id = document_attestations.organization_id
              and om.user_id = auth.uid())
  );

-- Insert: only admins/managers of the org (enforced again in the server fn)
create policy doc_attest_insert on public.document_attestations
  for insert with check (
    exists (select 1 from public.organization_members om
            where om.organization_id = document_attestations.organization_id
              and om.user_id = auth.uid()
              and om.role in ('admin','manager'))
  );

create index if not exists idx_doc_attest_lookup
  on public.document_attestations (organization_id, staff_id, subject_kind, subject_ref);
