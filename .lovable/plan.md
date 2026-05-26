## Host Home Supports (HHS) Module

A comprehensive new module isolated from the EVV hourly timesheet pipeline. Built for residential 24-hour Host Home providers in Utah DSPD.

### Scope

**Admin side** — new sidebar entry "🏡 Host Home Control" → `/dashboard/host-home-control` with 4 tabs (Daily Notes, eMAR, Monthly Attendance, Compliance Audits).

**Caregiver side** — when logged-in user has HHS service-code clients, the `/dashboard/workspace` landing renders resident cards. Clicking "Open Client Hub" loads a 4-tab specialized workspace (Daily Note, eMAR, Monthly Attendance, PRN Forms) anchored by a persistent Clinical Profile Banner.

**Critical isolation** — all HHS data lives in dedicated tables prefixed `hhs_*`. The existing `evv_timesheets` engine, the "EVV & Timesheet Control" screen, eMAR Pass, DSPD Controls, and Daily Logs modules are NOT modified.

### Database (new migration)

Create tables with RLS scoped to organization members (read) and managers (write):
- `hhs_daily_records` — narrative note + AI feedback per (client, provider, date)
- `hhs_emar_logs` — med pass events (status, route, pill-count attest, PRN reason, signature, timestamp)
- `hhs_monthly_attendance` — daily presence flag (Present / Away) per client/date for billing
- `hhs_medical_logs` — appointment / specialist visits
- `hhs_monthly_summaries` — monthly PCSP narrative + outings
- `hhs_incident_reports` — Form C internal intake (guardian contact, protective actions, abuse-trigger expansion, UPI filing state)
- `hhs_client_inventories` — $50+ valuables grid
- `hhs_evacuation_drills` — quarterly drill log
- `hhs_transfer_logs` — cross-agency communication log

Each table FK-keyed to `client_id` (clients), `provider_id` (auth user), `organization_id`, with `record_date` indexed. No FKs into `evv_timesheets`.

### Files

**Server functions** (new):
- `src/lib/hhs.functions.ts` — CRUD for all HHS tables, gated by `requireSupabaseAuth`
- `src/lib/hhs-coach.functions.ts` — thin wrapper reusing `evaluateShiftNote` shape for the daily progress note AI coach

**Routes** (new):
- `src/routes/dashboard.host-home-control.tsx` — admin 4-tab oversight desk
- `src/routes/dashboard.workspace.tsx` — landing that resolves to either standard view OR HHS resident card grid; for HHS users, lists assigned HHS clients with "Open Client Hub" cards
- `src/routes/dashboard.workspace.$clientId.hhs.tsx` — client hub 4-tab workspace + clinical banner

**Components** (new under `src/components/hhs/`):
- `clinical-banner.tsx` — persistent header (allergies, choking risk, emergency doc links)
- `daily-note-tab.tsx` — narrative textarea + inline AI coach
- `emar-tab.tsx` — med checklist, Pass/Refuse/Miss, PRN reason gate, Schedule II–IV pill-count modal, error report button
- `attendance-tab.tsx` — today's Present/Away radio
- `prn-forms-tab.tsx` — index opening five modals (medical, monthly summary, valuables, drill, transfer)
- `incident-form-c.tsx` — Form C with guardian contact block + abuse-trigger expansion
- `resident-card.tsx` — caregiver landing card

**Admin tabs** (under same directory):
- `admin-daily-summaries.tsx`, `admin-emar-matrix.tsx`, `admin-attendance-grid.tsx`, `admin-compliance-audits.tsx` (with 24h / 5-day countdowns + UPI mark-filed toggle)

**Sidebar** — `src/routes/dashboard.tsx`: add one nav item to `ADMIN_NAV`.

### Detection of HHS providers

A caregiver is HHS if any client assigned to them carries service code `HHS` in `clients.job_code[]` or `authorized_dspd_codes[]`. Server fn returns the list; if non-empty, workspace renders resident cards.

### Out of scope / preserved

- `evv_timesheets`, punch-pad, EVV & Timesheet Control page, vector search — untouched
- eMAR Pass, eMAR Audit, DSPD Controls, Daily Logs routes — untouched
- Sidebar order for everything else — unchanged
- Existing styles tokens reused; no new color tokens needed

### Technical notes

- AI coach reuses the existing `evaluateShiftNote` server fn (same shape works for the daily progress note)
- All HHS tables get `(organization_id, client_id, record_date)` btree indexes for fast tab queries
- Incident report countdowns computed client-side from `created_at` + status enum (`pending_admin_review`, `upi_filed`)
- Files for PRN attachments (emergency directive, drill PDFs) deferred — out of scope for first cut; use text/URL fields

### Result

A self-contained HHS module that gives Host Home providers their residential workflow without polluting the hourly EVV billing stream, plus an admin oversight desk to satisfy DSPD state licensing audits.
