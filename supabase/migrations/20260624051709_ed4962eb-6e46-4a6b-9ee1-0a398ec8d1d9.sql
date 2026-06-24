alter table public.training_completions
  add column if not exists content_snapshot jsonb;