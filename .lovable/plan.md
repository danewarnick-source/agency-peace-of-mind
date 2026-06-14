## Summary Automator — Plan

Builds on the existing `client_progress_summaries` table + cadence logic (already feeding the Deadlines page). Adds: extended cadence (PN1/PN2, PBA), a Nectar drafter modeled on `draftIncidentNarrative`, and a full Summaries admin area with source-bundle review, edit, finalize, and PDF download.

### 1. Cadence extension (`src/lib/progress-summaries.ts`)
- `QUARTERLY_SUMMARY_CODES`: unchanged (HHS, RHS, DSI, SLH, SLN).
- `MONTHLY_SUMMARY_CODES`: add `SEI, PN1, PN2`.
- New `FINANCIAL_STATEMENT_CODES`: `PBA` (monthly, summary_kind = `financial_statement`, no narrative draft).
- New `GOAL_PROGRESS_EXCLUDED_CODES`: `ELS, MTP, PBA, PM1, PM2, RP2, RP3, RP4, RP5, RL6` (controls whether goal-progress section is rendered).
- Helper `clientNeedsGoalProgress(serviceCodes)`: true if any code is NOT in the excluded set.

### 2. Migration — extend `client_progress_summaries`
Add columns (no destructive changes to existing rows):
- `summary_kind text not null default 'narrative'` check in (`narrative`, `financial_statement`)
- `status text not null default 'pending'` check in (`pending`, `draft`, `in_review`, `finalized`, `no_source`)
- `draft_content text`, `final_content text`
- `draft_source jsonb` (snapshot of note IDs / incident IDs / goal list used for the draft — for the side-by-side viewer and audit)
- `drafted_at timestamptz`, `drafted_by uuid`, `finalized_at timestamptz`, `finalized_by uuid`, `finalized_by_name text`
- Update `ensureCurrentSummaryPeriods` to set `summary_kind` and include PN1/PN2/PBA buckets.

Existing `completed_at` stays as the deadline-clearing field; `finalizeSummary` writes both `completed_at` and `finalized_*`. Deadlines page already keys off `completed_at`, so finalize clears the deadline with no change there.

### 3. Nectar drafter — `src/lib/progress-summary-draft.functions.ts`
- `draftProgressSummary({ summaryId })` server fn, admin/manager-gated.
- Pulls REAL data scoped to the client + period_start..period_end:
  - `clients` (name, `pcsp_goals[]`)
  - `client_billing_codes` active in window → service list
  - `daily_logs` where `status = 'approved'` (narrative + `pcsp_goals_addressed[]`)
  - `shift_reports` approved in window
  - `incident_reports` in window
- If zero approved notes AND zero incidents → set `status = 'no_source'`, do NOT call AI, return empty draft. UI then shows the blank manual editor.
- Otherwise calls existing `callAI(system, user)` (same Bedrock gateway path the incident drafter uses — no new model wiring).
- System prompt mirrors `draftIncidentNarrative` honesty contract:
  - "Write ONLY what the source notes support. Never invent progress, dates, events, medications, staff actions."
  - "For any goal with sparse/no supporting note text, state plainly: 'No documentation in this period supports progress on this goal.' — do NOT fabricate."
  - "Output the six required sections in order: (1) Person's name (2) Services provided this period (3) Date range (4) General summary of services / status / response / notable events (5) Goal-by-goal progress — INCLUDE THIS SECTION ONLY IF `includeGoalProgress = true` — one heading per PCSP goal (6) Prepared by: <blank — admin fills on finalize>."
- Goal-progress section is omitted when `clientNeedsGoalProgress(codes) === false`.
- PBA rows are never drafted — the row exists only as a "Monthly financial statement due" marker that admin manually finalizes after they generate the statement elsewhere.

### 4. Server fns (`src/lib/progress-summaries.functions.ts` — extend)
- `getSummaryWithSource(summaryId)` → returns row + bundled source: client, goals, services in period, approved daily_logs (id/date/staff_name/narrative/goals_addressed), shift_reports, incident_reports. Powers the side-by-side review pane.
- `saveSummaryDraft({ summaryId, content })` (status → `in_review`)
- `finalizeSummary({ summaryId, content, finalizedByName })` → sets `final_content`, `finalized_*`, `completed_at = now()`, `status = 'finalized'`. Clears matching Deadlines row automatically.
- `regenerateDraft({ summaryId })` → re-runs `draftProgressSummary`, overwrites `draft_content` only if status ∈ {pending, draft, no_source}.

### 5. UI — `src/routes/dashboard.summaries.tsx`
Admin/manager gated (reuse `is_org_admin_or_manager` pattern). On mount: call `ensureCurrentSummaryPeriods` then `listOpenSummaries`.

- Header: period filter (Current / Last quarter / All open), status filter.
- Table grouped by due date: client name • period label • services • status pill • due date.
- Row click → `SummaryReviewDialog`:
  - **Left pane**: source bundle (PCSP goals list, approved daily logs with date/staff/narrative, shift reports, incidents) — read-only, scrollable. Each item has its own card so the admin can verify the draft against the source.
  - **Right pane**: editable textarea pre-filled with `draft_content` (or blank for `no_source` / PBA). Buttons: "Re-draft with Nectar" (hidden for PBA / no_source initial state but available after dismissal), "Save draft", "Finalize" (prompts for finalizer name → defaults to current user's display name).
  - PBA shows banner: "Monthly financial statement — generate via PBA tools, then mark complete here. Nectar does not draft financial statements."
  - `no_source` shows banner: "No approved documentation found for this period. Write the summary manually below — Nectar will not draft from missing data."
- After finalize: dialog offers **Download PDF** (client-side `jsPDF`, same pattern as `host-home-certificate-pdf.ts`), renders the six sections cleanly with finalizer name + date in the footer. PDF is generated on demand — no storage bucket needed.

### 6. Navigation
- Add "Summaries" item to admin sidebar in `src/routes/dashboard.tsx` (icon: `FileText`).
- Deadlines page already lists `client_progress_summaries`; row label updates to show status pill (`drafted`, `in review`, etc.) and links to `/dashboard/summaries?open={id}`.

### 7. Trigger model
Lazy generation on page load + on-demand draft. Reasoning:
- `ensureCurrentSummaryPeriods` already runs on every Summaries / Deadlines page load (idempotent upsert) — that satisfies the "1st of each period rows appear" requirement without a cron.
- AI drafting is the expensive step, so we run it only when the admin opens a specific summary (`status = 'pending'` → auto-trigger `draftProgressSummary` on first open; subsequent opens just load the stored draft). This avoids spending tokens on summaries the admin hasn't gotten to and keeps the experience snappy. The admin can also click "Re-draft" any time.

### 8. Guardrails honored
- No edits to billing math, EVV logic, or HHS daily/billing logic.
- Reuses `callAI` + Bedrock path that the incident reviewer already uses — no new AI infra.
- Org-scoped via `is_org_admin_or_manager` on all writes, `is_org_member` on reads.
- Deadlines page stays the single source of truth for "what's due"; finalize writes `completed_at` to clear it.
- No service-role usage; everything via `requireSupabaseAuth` + RLS.

### Build order
1. Migration (extend table).
2. Extend `progress-summaries.ts` cadence + helpers; update `ensureCurrentSummaryPeriods`.
3. `progress-summary-draft.functions.ts` (Nectar drafter, honest prompt).
4. Extend `progress-summaries.functions.ts` (source bundle, save, finalize, regenerate).
5. `progress-summary-pdf.ts` (jsPDF renderer).
6. `dashboard.summaries.tsx` + `SummaryReviewDialog`.
7. Sidebar + Deadlines link wiring.
8. Self-check pass against the seven confirmations in the request.
