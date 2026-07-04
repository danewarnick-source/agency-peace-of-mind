create or replace function public.nectar_bump_draft_attempt(p_job uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.nectar_draft_jobs
    set attempts_started = attempts_started + 1,
        last_attempt_at = now()
    where id = p_job;
$$;

create or replace function public.nectar_bump_draft_transient(p_job uuid, p_msg text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.nectar_draft_jobs
    set transient_errors = transient_errors + 1,
        last_transient_at = now(),
        last_transient_message = left(coalesce(p_msg, ''), 300)
    where id = p_job;
$$;

revoke all on function public.nectar_bump_draft_attempt(uuid) from public;
revoke all on function public.nectar_bump_draft_transient(uuid, text) from public;
grant execute on function public.nectar_bump_draft_attempt(uuid) to authenticated, service_role;
grant execute on function public.nectar_bump_draft_transient(uuid, text) to authenticated, service_role;