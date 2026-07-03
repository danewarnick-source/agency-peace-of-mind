
alter table public.nectar_draft_jobs
  add column if not exists processed_indices int[] not null default '{}',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists chunk_durations_ms int[] not null default '{}';

-- Backfill started_at for existing rows so ETA math has a floor when a job
-- was created before this column existed.
update public.nectar_draft_jobs
  set started_at = created_at
  where started_at > created_at;
