# Give Claude full access to HIVE via MCP

Since there's no PHI concern, we can expose the whole platform. Rather than hand-writing 200+ per-table tools, the fastest and most flexible path is a small set of **powerful generic tools** that run as the signed-in HIVE user (RLS still applies as that user, so Claude inherits exactly the permissions of whoever connected), plus a handful of **curated high-value domain tools** for the workflows you'll ask Claude about most often.

## Tools to add

### Generic (cover everything)
1. **`sql_query`** — Run any `SELECT` against the database as the signed-in user. Input: `sql` (string), optional `params` (array). Rejects non-SELECT statements. Returns rows as JSON. Lets Claude answer *any* question about clients, shifts, timesheets, incidents, billing, certifications, etc. without us pre-defining a tool per question.
2. **`table_read`** — Structured Supabase read: `table`, optional `select`, `filters` (array of `{column, op, value}`), `order`, `limit`. Safer/typed alternative to raw SQL for common list/detail views.
3. **`table_write`** — `insert` / `update` / `delete` on a table with filters + values. Respects RLS. Marked `destructiveHint: true`.
4. **`list_tables`** — Returns the list of tables + columns Claude can see, so it can self-discover the schema instead of us describing it.

### Curated domain tools (nicer UX for common asks)
5. **`list_clients`** — already exists; keep.
6. **`get_client`** — full client record + active billing codes + emergency contacts + current home.
7. **`list_shifts`** — filter by date range, staff, client, home, status.
8. **`list_timesheets`** — EVV timesheets with filters (date range, staff, client, code, status).
9. **`list_incidents`** — incident reports with filters.
10. **`list_certifications`** — staff certifications with expiry filters (useful for "who's expiring in 30 days").
11. **`list_billing_submissions`** — recent submissions + warnings.
12. **`coverage_status`** — for a given date + home, compare `location_coverage_requirements` vs scheduled_shifts.
13. **`nectar_flags`** — open BC flags, shift completeness flags, billing warnings in one call.
14. **`whoami`** — already exists; keep.

All tools use `requireSupabaseAuth` semantics: they act as the connected HIVE user, so admins see everything, staff see only what their RLS allows. No service-role bypass.

## Files touched

- `src/lib/mcp/tools/sql-query.ts` (new)
- `src/lib/mcp/tools/table-read.ts` (new)
- `src/lib/mcp/tools/table-write.ts` (new)
- `src/lib/mcp/tools/list-tables.ts` (new)
- `src/lib/mcp/tools/get-client.ts` (new)
- `src/lib/mcp/tools/list-shifts.ts` (new)
- `src/lib/mcp/tools/list-timesheets.ts` (new)
- `src/lib/mcp/tools/list-incidents.ts` (new)
- `src/lib/mcp/tools/list-certifications.ts` (new)
- `src/lib/mcp/tools/list-billing-submissions.ts` (new)
- `src/lib/mcp/tools/coverage-status.ts` (new)
- `src/lib/mcp/tools/nectar-flags.ts` (new)
- `src/lib/mcp/index.ts` (register new tools; update `instructions` to describe the toolkit)
- Run `app_mcp_server--extract_mcp_manifest` after edits so the manifest reflects the new toolset

## After deploy

You'll need to **Publish** again so Claude sees the new tools (MCP tool list is captured at build time). Then in Claude, disconnect + reconnect the HIVE connector (or it'll auto-refresh) and the 14 tools appear.

## Safety notes (given "no PHI" stance)

- Everything still runs under the connected user's RLS — so if an org member connects, Claude only sees that org's data, not other tenants.
- `sql_query` is SELECT-only (parser check). Writes go through `table_write` so they're logged distinctly and annotated destructive.
- Neither raw tokens nor service-role keys are ever exposed to Claude.

Confirm and I'll build it.