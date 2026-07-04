alter table public.nectar_draft_jobs
  add column if not exists attempts_started integer not null default 0,
  add column if not exists transient_errors integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_transient_at timestamptz,
  add column if not exists last_transient_message text;