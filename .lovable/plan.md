# Plan — HIVE Executive view + NECTAR escalation & saved reports

Two independent blocks. Both ship in this turn.

---

## Block 1 — HIVE Executive (platform-owner) view

A new top-level surface for HIVE staff to oversee customer companies as **accounts**, never as clinical tenants. Hard-walled from PHI.

### Permission model

- New permission `view_platform_executive` (separate from `manage_all_orgs`).
- Granted only to specific accounts via a new `hive_executives` table (user_id + granted_by + active). Membership in this table — not just `super_admin` role — is the gate.
- Server-side helper `is_hive_executive(uuid)` (SECURITY DEFINER) used in RLS + server fns.
- Every read goes through a `createServerFn` that:
  1. Calls `requireSupabaseAuth`
  2. Verifies `is_hive_executive(userId)` server-side
  3. Logs the access to `hive_executive_audit_log` (actor, action, target_org, payload_summary, at)
  4. Returns ONLY aggregate/account columns — never joins clients/daily_logs/PHI tables.

### Database (one migration)

```text
hive_executives(id, user_id UNIQUE, active, granted_by, granted_at, notes)
hive_executive_audit_log(id, actor_user_id, action, target_org_id, summary, created_at)
org_subscriptions(id, organization_id UNIQUE, plan tier_enum,
                  status sub_status_enum, mrr_cents, renewal_date,
                  trial_ends_at, started_at, canceled_at, notes)
org_support_tickets(id, organization_id, opened_by, subject, body,
                    status ticket_status_enum, severity, assignee_user_id,
                    created_at, updated_at, resolved_at, conversation jsonb)
```

GRANTs + RLS: only `is_hive_executive(auth.uid())` can SELECT these admin tables; org admins may INSERT into `org_support_tickets` for their own org.

### Server functions (src/lib/hive-exec.functions.ts)

- `listCompanies()` → per-org row: name, plan, status, mrr, renewal, staff_count, client_count, open_tickets, health_score. Counts via `count: 'exact', head: true` — never returns row data.
- `getCompanyDetail(orgId)` → subscription history, ticket list, aggregate usage (hours logged last 30d, active staff last 7d). NO client identifiers.
- `getExecKpis()` → active companies, MRR sum, trials, past_due count.
- `updateSubscription(orgId, patch)` for HIVE-exec edits.

Every handler: audit-log the call.

### Routes

- `src/routes/dashboard.hive-exec.tsx` — layout with RequireHiveExecutive guard + persistent banner "Account & billing only — no client records or PHI".
- `…/dashboard.hive-exec.index.tsx` — KPI strip + companies table (search, sort, status filter).
- `…/dashboard.hive-exec.$orgId.tsx` — company detail (subscription, billing history, usage aggregates, tickets).
- `…/dashboard.hive-exec.tickets.tsx` — all support tickets queue.
- New `RequireHiveExecutive` guard component (calls a `checkHiveExecutive` server fn).

### Nav

Add "HIVE Executive" entry in `dashboard.tsx` sidebar, visible only when `useIsHiveExecutive()` returns true. Navy/amber styled with Sparkles/Shield icon.

---

## Block 2 — NECTAR escalation + saved/scheduled reports

### 2a. Help-chat escalation

- Reuse `org_support_tickets` from Block 1. (Source = `'nectar_help'`.)
- New server fn `escalateHelpToHive(question, context, conversation)` in `nectar-help.functions.ts`. Inserts a ticket; returns ticket id + status.
- Update `dashboard.help.tsx`:
  - Detect "talk to a human" intent or add explicit "Ask the HIVE team" button at the bottom of every NECTAR reply.
  - Render in-chat ticket card with live status (submitted → in_progress → resolved), polled via `useQuery` refetchInterval.
  - Friendly copy: "I'll connect you with the HIVE team — they'll follow up here."

### 2b. Saved + scheduled reports

New tables:

```text
nectar_saved_reports(id, organization_id, owner_user_id, name, prompt,
                     plan jsonb, pinned bool, created_at, updated_at)
nectar_report_schedules(id, saved_report_id, cadence weekly|monthly,
                        day_of_week int, day_of_month int, hour int,
                        deliver_email bool, recipients text[],
                        deliver_save bool, last_run_at, next_run_at, active)
nectar_report_runs(id, saved_report_id, ran_at, row_count, csv_url, error)
```

RLS scoped to `organization_id` + `is_org_admin_or_manager`.

Hook `useSavedReports()` + UI additions in `dashboard.billing.nectar.tsx`:
- "Save report" button next to results (name + pin toggle).
- "Saved reports" panel listing pinned/all reports — one-tap re-run, edit, schedule, delete.
- "Schedule" dialog: cadence, recipients, email-and-or-save options.

Server fns in `nectar-reports.functions.ts`:
- `saveNectarReport`, `listSavedReports`, `runSavedReport(id)`, `deleteSavedReport`, `upsertSchedule`, `removeSchedule`.
- `runDueSchedules()` — invoked by a `/api/public/hooks/nectar-schedules` cron endpoint (pg_cron hourly). Re-runs each due saved report via the existing `askNectarReport` plan executor, stores row count + CSV, emails recipients when configured. Respects original owner's permissions.

Cron wiring: `pg_cron` job hitting the public hook hourly with apikey.

---

## Technical notes (non-user-facing)

- PHI wall is enforced by: (a) executive routes use only `hive-exec.functions.ts` — no imports from clients/daily-logs/billing-code modules; (b) `is_hive_executive` gate is checked server-side on every call; (c) audit log writes happen inside each handler before returning.
- Counts use Supabase `count: 'exact', head: true` so no row payloads are sent to executives.
- Saved-report executor reuses existing `askNectarReport` plan; we do NOT widen permissions for the cron — the run is attributed to the saving admin and re-validated against current org membership.
- All money is stored in cents; rendered as USD client-side. Round hours 1 decimal, units whole.
- No edits to generated files (`types.ts`, `client.ts`, `routeTree.gen.ts` apart from autogen).

### Files to create/edit (high level)

Create: 1 migration; `src/lib/hive-exec.functions.ts`; `src/hooks/use-hive-executive.tsx`; `src/hooks/use-saved-reports.tsx`; `src/components/hive-executive-guard.tsx`; routes `dashboard.hive-exec.tsx`, `…index.tsx`, `…$orgId.tsx`, `…tickets.tsx`; `src/routes/api/public/hooks/nectar-schedules.ts`; extend `nectar-reports.functions.ts` and `nectar-help.functions.ts`; update `dashboard.help.tsx`, `dashboard.billing.nectar.tsx`, `dashboard.tsx` (sidebar).

Ready to implement on approval.
