-- 1) Add a training_type to client_specific_trainings so a client can have TWO:
--    'person_specific' (SOW §1.8(4)(O)) and 'support_strategies' (SOW §1.24(6)).
alter table public.client_specific_trainings
  add column if not exists training_type text not null default 'person_specific'
    check (training_type in ('person_specific','support_strategies'));

-- 2) Replace the one-per-client unique index with one-per-(client, type).
drop index if exists public.cst_unique_client;
create unique index if not exists cst_unique_client_type
  on public.client_specific_trainings(client_id, training_type);

-- 3) Training-local in-depth PCSP goals — stored ON the training, NOT on clients.
--    Each goal: { id, goal, supports, details, job_codes[] } — all verbatim from
--    the PCSP, admin-reviewed. This is separate from clients.pcsp_goals (untouched).
alter table public.client_specific_trainings
  add column if not exists goals jsonb not null default '[]'::jsonb;

-- 4) Staff written answers to applied-reasoning questions, captured per completion.
--    Array of { question, answer, tab } objects — frozen as part of the audit record.
alter table public.training_completions
  add column if not exists question_answers jsonb not null default '[]'::jsonb;

-- 5) Per-tab review questions live on the training (admin-editable, NECTAR-drafted later).
--    Array of { id, tab, prompt } — the applied-reasoning prompts shown to staff.
alter table public.client_specific_trainings
  add column if not exists review_questions jsonb not null default '[]'::jsonb;
