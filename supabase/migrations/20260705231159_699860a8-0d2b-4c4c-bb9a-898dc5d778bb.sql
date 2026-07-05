
create or replace function public.mcp_exec_read_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  trimmed text := regexp_replace(query, ';+\s*$', '');
  result  jsonb;
begin
  if trimmed !~* '^\s*(select|with)\b' then
    raise exception 'Only SELECT or WITH queries are allowed';
  end if;
  if trimmed ~ ';\s*\S' then
    raise exception 'Multiple statements are not allowed';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', trimmed)
    into result;
  return result;
end;
$$;

revoke all on function public.mcp_exec_read_sql(text) from public;
grant execute on function public.mcp_exec_read_sql(text) to authenticated;

create or replace view public.mcp_table_catalog
with (security_invoker = on) as
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

create or replace view public.mcp_column_catalog
with (security_invoker = on) as
select table_name, column_name, data_type, is_nullable, ordinal_position
from information_schema.columns
where table_schema = 'public';

grant select on public.mcp_table_catalog  to authenticated;
grant select on public.mcp_column_catalog to authenticated;
