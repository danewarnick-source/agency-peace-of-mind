# Run the MCP SQL block for you

You don't need to open a SQL editor — I can push it as a migration you approve inline.

## What I'll do

Call the migration tool with the exact SQL from the bottom of `docs/SQL_HANDOFF.md`:

- `public.mcp_exec_read_sql(query text)` — SECURITY INVOKER function that runs a single SELECT/WITH statement and returns JSON. Rejects anything else. Grants EXECUTE to `authenticated` only.
- `public.mcp_table_catalog` — view listing public-schema tables (security invoker).
- `public.mcp_column_catalog` — view listing public-schema columns (security invoker).
- Grants SELECT on both views to `authenticated`.

Because the function and views are `security invoker`, everything Claude runs through them still obeys RLS as the connected HIVE user — no privilege escalation.

## After you approve

Migration runs, `sql_query` and `list_tables` start working immediately. No publish needed for this step (backend change deploys instantly). Claude picks them up on the next tool call.

Approve and I'll fire the migration.