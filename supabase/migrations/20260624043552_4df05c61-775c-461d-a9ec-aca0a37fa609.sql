-- Ensure two-training-type columns exist on the live DB (re-apply; the original
-- 20260623180000 migration did not reach the live database).

alter table public.client_specific_trainings
  add column if not exists goals jsonb not null default '[]'::jsonb;

alter table public.client_specific_trainings
  add column if not exists review_questions jsonb not null default '[]'::jsonb;

alter table public.client_specific_trainings
  add column if not exists training_type text not null default 'person_specific';

alter table public.training_completions
  add column if not exists question_answers jsonb not null default '[]'::jsonb;