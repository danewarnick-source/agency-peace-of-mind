# Deadlines page

## 1. Routing & navigation

- New route `src/routes/dashboard.deadlines.tsx` → `/dashboard/deadlines`.
- Add to `ADMIN_NAV` in `src/routes/dashboard.tsx`, sitting between **Documentation** and **Finances**:
  - `{ to: "/dashboard/deadlines", label: "Deadlines", icon: AlarmClock }`.
- Add a small **Deadlines** card to `src/routes/dashboard.index.tsx` (admin view) — two numbers (Overdue / Due this week) + a link to the page. Counts come from the same hook the page uses.

## 2. Data sources (all 5, real, org-scoped)

A single hook `useDeadlines()` (`src/hooks/use-deadlines.tsx`) fans out to existing sources and returns a normalized `DeadlineItem[]`:

```
type DeadlineItem = {
  key: string;                 // stable id for list keying
  source: "summary" | "hhs_cert" | "staff_cert" | "incident" | "billing_code";
  title: string;               // e.g. "Q2 quarterly summary"
  subject: string;             // "Marcus B" / "Jane D"
  subjectKind: "client" | "staff" | "agency";
  dueAt: Date;
  status: "overdue" | "due_soon" | "upcoming";
  href?: string;               // deep link to act
  meta?: Record<string, unknown>;
};
```

Wiring per source (all org-scoped via existing patterns):

1. **Client progress summaries** — new (§3 below). Reads `client_progress_summaries` rows where `completed_at IS NULL`.
2. **HHS monthly certifications** — query `hhs_monthly_certifications` for the agency's HHS clients for the current + previous month; a row missing for a past month = overdue, current month = due_soon as we cross its 15th. Uses the same table `getMonthCertification` already reads.
3. **Staff certification expirations** — `public.certifications` rows where `expires_at` is within 30 days or already past, scoped by `organization_id`. Subject = staff full_name from profiles (separate lookup; no FK embed per project rules).
4. **Open incident clocks** — call existing `listIncidents` and reuse `addBusinessDays` from `admin-incidents-section.tsx` (extract it into `src/lib/incident-deadlines.ts` so both this page and the existing admin section share one implementation — no reinvented logic). 24h UPI clock = `discovered_at + 24h` while `upi_initiated_at IS NULL`; 5-business-day completion = `addBusinessDays(discovered_at, 5)` while `upi_completed_at IS NULL`.
5. **Billing-code deadlines** — reuse `computeDeadlines()` from `src/lib/bc-deadlines.ts` over each client's BC docs. (Behavior support / SOW deliverable rows.)

Hook returns `{ items, overdue, dueSoon, upcoming, isLoading }`. The Home card just reads `overdue.length` and `dueSoon.length`.

## 3. Client progress summaries (new tracking — the only new schema)

### Rules

- A client owes a **quarterly** summary for any active `client_billing_codes.service_code` in {HHS, RHS, DSI, SLH, SLN}. Due 15 days after the quarter end (Q2 2026 → due **2026-07-15**).
- A client owes a **monthly** summary for any active code in {SEI}. Due the 15th of the following month (June 2026 → due **2026-07-15**).
- A client can owe both. We generate one row per (client, period_kind, period_label).
- SEI rows are flagged `requires_upi_attestation = true`. Completion UI is **"Entered into UPI"** (records attesting user + timestamp) instead of plain "Mark complete".

### Schema (single migration, SQL handoff)

`public.client_progress_summaries`:
- `id uuid pk`, `organization_id uuid`, `client_id uuid`
- `period_kind text check in ('quarterly','monthly')`
- `period_label text` (e.g. `'2026-Q2'`, `'2026-06'`) — unique with org/client/kind
- `period_start date`, `period_end date`, `due_date date`
- `service_codes text[]` (codes that triggered this row, for display)
- `requires_upi_attestation boolean default false`
- `completed_at timestamptz`, `completed_by uuid`
- `upi_entered_at timestamptz`, `upi_entered_by uuid` (SEI only)
- `created_at`, `updated_at` + trigger

Migration includes the standard GRANTs (`authenticated`, `service_role`), `ENABLE RLS`, and policies scoped via `is_org_member` (read) / `is_org_admin_or_manager` (write). Unique index `(organization_id, client_id, period_kind, period_label)`.

### Auto-generation (no manual creation)

Server function `ensureCurrentSummaryPeriods({ organizationId })` called on page load (and by the Home card). It:

1. Reads each client's active `client_billing_codes` for the org.
2. For each quarter that has ended and is not yet completed (current quarter once past its end + grace, plus any unfilled prior quarters back to org's earliest active code or 4 quarters max), upserts a quarterly row for clients carrying HHS/RHS/DSI/SLH/SLN.
3. Same for monthly periods for SEI clients (every closed month back to a sensible bound).
4. Idempotent via the unique key.

This guarantees that on July 1, 2026 the page already shows the Q2 quarterly + the June SEI monthly rows due July 15.

### Completion actions

Two server fns: `markSummaryCompleted` (non-SEI) and `attestSummaryUpiEntered` (SEI). Both require `manager` role via `requireOrgMembership`. The latter sets both `upi_entered_at/_by` and `completed_at/_by`.

## 4. Page layout

`/dashboard/deadlines` — matches existing hub/card styling (no restyle):

- Page header (`StaffPageHeader`-equivalent) + short caption.
- **Overdue strip** — red-bordered card at top, list of items with `status === 'overdue'`, sorted by how late.
- **Due soon (next 7 days)** — amber card.
- **Upcoming (8-30 days)** — neutral card, collapsed by default.
- Each row: icon for source, title, subject, due date (`Jul 15` / `in 3 days` / `2d overdue`), and either a deep link (`href`) or — for summary rows — an inline "Mark complete" / "Entered into UPI" button. SEI rows show a small **UPI** badge.

Source-specific deep links:
- Summary → no link (action is inline).
- HHS cert → `/dashboard/workspace/$clientId` (HHS monthly tab).
- Staff cert → `/dashboard/employees/$staffId`.
- Incident → `/dashboard/inbox` (or the incidents section anchor).
- Billing-code → `/dashboard/client-billing-codes`.

## 5. Done-criteria self-check (reply contents)

Before claiming complete, the build response will confirm each of:
1. Sidebar shows **Deadlines** for admins.
2. Page renders Overdue + Due soon sections (even when empty, with empty-state copy).
3. Each of the five sources is wired to its real table/function (named in the reply: `client_progress_summaries`, `hhs_monthly_certifications`, `certifications`, `listIncidents` + shared deadline helper, `bc-deadlines.computeDeadlines`).
4. Summary auto-generation creates Q2-2026 rows (due Jul 15) for HHS/RHS/DSI/SLH/SLN clients and June-2026 monthly rows (due Jul 15) for SEI clients, with the SEI "Entered into UPI" attestation button.
5. Home dashboard card shows overdue + due-this-week counts and links to `/dashboard/deadlines`.

## Technical notes

- All Supabase reads use the browser `supabase` client with `useQuery`, gated by `useCurrentOrg`.
- Writes go through `createServerFn` + `requireSupabaseAuth` + `requireOrgMembership`; client invokes via `useServerFn` + `useMutation`, invalidating `["deadlines", orgId]`.
- No edits to billing math, EVV code lists, HHS daily logic, or existing incident workflow — only extracting `addBusinessDays` + 24h/5BD math into `src/lib/incident-deadlines.ts` and re-importing it in `admin-incidents-section.tsx` (no behavior change).
- Migration runs via `supabase--migration` tool, awaiting user approval before any code that depends on the new table is written.

Order of build:
1. Migration (await approval).
2. Shared `incident-deadlines.ts` extraction.
3. `client-progress-summaries.functions.ts` (ensure + complete + attest + list).
4. `use-deadlines.tsx` hook.
5. Page + nav entry + Home card.
6. Self-check reply.
