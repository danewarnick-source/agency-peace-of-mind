alter table public.incident_reports
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists witnessed_directly boolean,
  add column if not exists reported_to_reporter_by text,
  add column if not exists restraint_used boolean not null default false,
  add column if not exists aps_notified_at timestamptz,
  add column if not exists aps_notified_by text,
  add column if not exists aps_reference text;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'org members upload incident photos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "org members upload incident photos"
      on storage.objects for insert
      with check (bucket_id = 'incident-photos' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'org members read incident photos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "org members read incident photos"
      on storage.objects for select
      using (bucket_id = 'incident-photos' and auth.role() = 'authenticated');
  end if;
end$$;