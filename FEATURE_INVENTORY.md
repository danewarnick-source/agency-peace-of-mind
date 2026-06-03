# HIVE Feature Inventory — Part 1
> Generated from live codebase read (read-only). All citations anchored to file:line.

---

## 1. Routes & Pages

### Public / Auth routes

- **`/`** — `src/routes/index.tsx:34` — `createFileRoute("/")` — Landing page (marketing site: hero, features, pricing, testimonials). Component: inline JSX (landing sections). confirmed-from-code.
- **`/login`** — `src/routes/login.tsx:14` — `createFileRoute("/login")` — Email/password login form + OAuth entry. Also exports `AuthShell` (line 300). confirmed-from-code.
- **`/signup`** — `src/routes/signup.tsx:15` — `createFileRoute("/signup")` — Org sign-up / invitation acceptance (search params include invite token). confirmed-from-code.
- **`/forgot-password`** — `src/routes/forgot-password.tsx:10` — `createFileRoute("/forgot-password")` — Email field for password-reset link. confirmed-from-code.
- **`/reset-password`** — `src/routes/reset-password.tsx:10` — `createFileRoute("/reset-password")` — New-password form, redirected to automatically when `must_change_password = true`. confirmed-from-code.
- **`/unauthorized`** — `src/routes/unauthorized.tsx:5` — `createFileRoute("/unauthorized")` — "Not authorized" message with link back. confirmed-from-code.
- **`/auditor`** — `src/routes/auditor.tsx:38` — `createFileRoute("/auditor")` — External auditor portal (token-gated read-only audit packet view). confirmed-from-code.
- **`/certificate.$code`** — `src/routes/certificate.$code.tsx` — Public certificate verification page keyed by verification code. confirmed-from-code.
- **`/contact`** — `src/routes/contact.tsx` — Marketing contact form. confirmed-from-code.
- **`/pricing`** — `src/routes/pricing.tsx` — Marketing pricing page. confirmed-from-code.
- **`/verify.$code`** — `src/routes/verify.$code.tsx` — Email verification handler. confirmed-from-code.
- **`/fix-admin`** — `src/routes/fix-admin.tsx` — Internal utility for fixing admin access. confirmed-from-code.

### Redirect-only legacy routes (no component)

- **`/admin`** — `src/routes/admin.tsx:4` — `createFileRoute("/admin")` — No component; legacy redirect stub. confirmed-from-code.
- **`/employee`** — `src/routes/employee.tsx:4` — Same pattern — legacy redirect stub. confirmed-from-code.
- **`/manager`** — `src/routes/manager.tsx:4` — Same pattern. confirmed-from-code.
- **`/super-admin`** — `src/routes/super-admin.tsx:4` — Same pattern. confirmed-from-code.

### Dashboard shell

- **`/dashboard`** — `src/routes/dashboard.tsx:28` — `createFileRoute("/dashboard")` — Component: `DashboardLayout`. Wraps all dashboard children in a sidebar + top-bar shell. Sidebar renders `STAFF_NAV`, `ADMIN_NAV`, or `execNav` depending on `view` state. Redirects to `/login` if unauthenticated; to `/reset-password` if `must_change_password`. confirmed-from-code.

### Dashboard pages

- **`/dashboard/`** — `src/routes/dashboard.index.tsx:15` — Component: `Overview` (inline). Redirects to company-overview or staff caseload based on role. confirmed-from-code.
- **`/dashboard/employees/`** — `src/routes/dashboard.employees.index.tsx:34` — Component: `EmployeesPage`. Wrapped in `RequirePermission perm="manage_users"`. Active employee roster with invite, manual-create, caseload, edit, activate/deactivate, password-reset. confirmed-from-code.
- **`/dashboard/employees/$staffId`** — `src/routes/dashboard.employees.$staffId.tsx:13` — Component: `StaffProfilePage`. Wrapped in `RequirePermission perm="manage_users"`. Read-only staff profile with two tabs: Overview, HR. confirmed-from-code.
- **`/dashboard/clients`** — `src/routes/dashboard.clients.tsx:184` — Component: `ClientsPage`. Wrapped in `RequirePermission perm="manage_users"`. Client directory with 7-tab workspace per client. confirmed-from-code.
- **`/dashboard/hr-admin`** — `src/routes/dashboard.hr-admin.tsx:27` — Component: `HrAdminPage`. Wrapped in `RequirePermission perm="manage_users"`. NECTAR HR rollup table with filters. confirmed-from-code.
- **`/dashboard/scheduling`** — `src/routes/dashboard.scheduling.tsx:52` — Component: `SchedulingPage`. Week-based scheduling calendar with shift CRUD. confirmed-from-code.
- **`/dashboard/schedule`** — `src/routes/dashboard.schedule.tsx` — Component: `SchedulePage`. Staff-facing personal schedule view (day/week/month). confirmed-from-code.
- **`/dashboard/emar`** — `src/routes/dashboard.emar.tsx:18` — Component: `EmarPage`. Today's med-pass queue. Staff taps card to open `PassDialog`. confirmed-from-code.
- **`/dashboard/daily-logs`** — `src/routes/dashboard.daily-logs.tsx` — Component: `DailyLogsPage`. Role-split: staff sees `StaffDailyJournal`, admin sees `AdminAuditQueue`. confirmed-from-code.
- **`/dashboard/records-desk`** — `src/routes/dashboard.records-desk.tsx` — Component: `RecordsDesk`. 4-tab shell embedding Command Center, EVV & Timesheets, Host Home, Audit Zone. confirmed-from-code.
- **`/dashboard/command-center`** — `src/routes/dashboard.command-center.tsx` — Component: `CommandCenter`. Standalone and embedded via Records Desk. 5-tab triage: NECTAR Infusion, Urgent, Pending Review, Approved Archive, Analytics. confirmed-from-code.
- **`/dashboard/compliance-desk`** — `src/routes/dashboard.compliance-desk.tsx` — Component: `ComplianceDeskPage` (also exported as `ComplianceDeskWrapped`). Wrapped in `RequirePermission perm="manage_users"`. EVV/timesheet ledger with Pending Approvals and Approved Archive sections. confirmed-from-code.
- **`/dashboard/audit`** — `src/routes/dashboard.audit.tsx` — Component: `AuditPage`. Audit packet list + `PacketDetail` sub-view (no child route, rendered inline). Buttons: New audit folder, Upload, AI parse. confirmed-from-code.
- **`/dashboard/billing`** — `src/routes/dashboard.billing.tsx` — Component: `BillingLayout`. Wrapped in `RequireRole roles=["admin","manager","super_admin"]`. 5-tab nav shell (Overview, NECTAR, 520 Form, Imports/Authorizations, HIVE Subscription). confirmed-from-code.
- **`/dashboard/billing/`** — `src/routes/dashboard.billing.index.tsx` — Component: `BillingOverviewPage`. Client-level billing summary table. confirmed-from-code.
- **`/dashboard/billing/$clientId`** — `src/routes/dashboard.billing.$clientId.tsx` — Per-client billing codes management page with authorization tracking. confirmed-from-code.
- **`/dashboard/billing/form520`** — `src/routes/dashboard.billing.form520.tsx` — 520 form generator. confirmed-from-code.
- **`/dashboard/billing/imports`** — `src/routes/dashboard.billing.imports.tsx` — Import/authorization file upload. confirmed-from-code.
- **`/dashboard/billing/nectar`** — `src/routes/dashboard.billing.nectar.tsx` — NECTAR billing readiness panel. confirmed-from-code.
- **`/dashboard/billing-520`** — `src/routes/dashboard.billing-520.tsx` — Standalone 520 form (possibly legacy/duplicate). **⚠ Not in `ADMIN_NAV` or `BillingLayout` tabs — may be orphaned.** confirmed-from-code.
- **`/dashboard/financial`** — `src/routes/dashboard.financial.tsx` — Financial layout shell. Wrapped in `perm="manage_billing"` via ADMIN_NAV gate. confirmed-from-code.
- **`/dashboard/financial/`** — `src/routes/dashboard.financial.index.tsx` — Immediately redirects to `/dashboard/financial/revenue`. confirmed-from-code.
- **`/dashboard/financial/revenue`** — `src/routes/dashboard.financial.revenue.tsx` — Component: `RevenuePage`. Billed revenue table with year select and monthly/quarterly/YTD toggle. confirmed-from-code.
- **`/dashboard/pba-ledger`** — `src/routes/dashboard.pba-ledger.tsx` — Component: `PbaLedgerPage`. Wrapped in `RequirePermission perm="manage_users"`. PBA trust account management. confirmed-from-code.
- **`/dashboard/teams`** — `src/routes/dashboard.teams.tsx` — Component: `TeamsPage`. Wrapped in `RequirePermission perm="manage_users"`. Drag-and-drop team/group-home organizer. confirmed-from-code.
- **`/dashboard/settings`** — `src/routes/dashboard.settings.tsx` — Component: `SettingsPage`. Profile, org name, sub-pages (team access, bank mapping). confirmed-from-code.
- **`/dashboard/settings/team-access`** — `src/routes/dashboard.settings.team-access.tsx` — Team access / invitation sub-settings. Gated: `role === "admin" || "super_admin"`. confirmed-from-code.
- **`/dashboard/settings/bank-mapping`** — `src/routes/dashboard.settings.bank-mapping.tsx` — Institutional banking / Plaid mapping. Gated: `role === "admin"`. confirmed-from-code.
- **`/dashboard/permissions`** — `src/routes/dashboard.permissions.tsx` — Component: `PermissionsPage`. Wrapped in `RequirePermission perm="manage_roles"`. Permission matrix editor. confirmed-from-code.
- **`/dashboard/roles`** — `src/routes/dashboard.roles.tsx` — Component: `RolesPage`. Wrapped in `RequirePermission perm="manage_roles"`. Role assignment table per member. confirmed-from-code.
- **`/dashboard/programs`** — `src/routes/dashboard.programs.tsx` — Component: `ProgramsPage`. Training programs library (staff-facing). confirmed-from-code.
- **`/dashboard/programs/$programId`** — `src/routes/dashboard.programs.$programId.tsx` — Component: `ProgramPlayer`. Program course player with sequenced modules. confirmed-from-code.
- **`/dashboard/programs-admin`** — `src/routes/dashboard.programs-admin.tsx` — Component: `ProgramsAdminPage`. Wrapped in `RequirePermission perm="manage_programs"`. Admin CRUD for training programs. confirmed-from-code.
- **`/dashboard/tracks`** — `src/routes/dashboard.tracks.tsx` — Component: `TracksPage`. Compliance training tracks list. confirmed-from-code.
- **`/dashboard/tracks/$trackSlug`** — `src/routes/dashboard.tracks.$trackSlug.tsx` — Component: `TrackDetailPage`. Individual track detail with programs and cert types. confirmed-from-code.
- **`/dashboard/courses/`** — `src/routes/dashboard.courses.index.tsx` — Component: `ComplianceRoadmap`. Staff training roadmap (sequential modules). confirmed-from-code.
- **`/dashboard/courses/$courseId`** — `src/routes/dashboard.courses.$courseId.tsx` — Course player/viewer. confirmed-from-code.
- **`/dashboard/courses/$courseId/edit`** — `src/routes/dashboard.courses.$courseId.edit.tsx` — Course editor (admin). confirmed-from-code.
- **`/dashboard/courses/mindsmith`** — `src/routes/dashboard.courses.mindsmith.tsx` — Mindsmith external course embed. confirmed-from-code.
- **`/dashboard/training/`** — `src/routes/dashboard.training.index.tsx` — Component: `CourseLibrary`. Training module list with admin bulk-assign. confirmed-from-code.
- **`/dashboard/training/$id`** — `src/routes/dashboard.training.$id.tsx` — Training module player. confirmed-from-code.
- **`/dashboard/ask-nectar`** — `src/routes/dashboard.ask-nectar.tsx` — Component: `AskNectarStaffPage`. Staff AI chat (embeds `AskNectarStaff` component). Search param: `clientId`. confirmed-from-code.
- **`/dashboard/help`** — `src/routes/dashboard.help.tsx` — Component: `HelpPage`. Admin/staff NECTAR help chatbot with escalation to HIVE ticket. confirmed-from-code.
- **`/dashboard/authoritative-sources`** — `src/routes/dashboard.authoritative-sources.tsx` — NECTAR authoritative sources upload + requirements extraction (admin). confirmed-from-code.
- **`/dashboard/nectar-docs`** — `src/routes/dashboard.nectar-docs.tsx` — Company documents upload/search with NECTAR parsing. confirmed-from-code.
- **`/dashboard/external-compliance`** — `src/routes/dashboard.external-compliance.tsx` — External compliance tracking. confirmed-from-code.
- **`/dashboard/internal-audit`** — `src/routes/dashboard.internal-audit.tsx` — Internal audit sample picker. confirmed-from-code.
- **`/dashboard/certifications`** — `src/routes/dashboard.certifications.tsx` — Component: `CertificationsPage`. Staff see own certs; managers see org certs. confirmed-from-code.
- **`/dashboard/external-certifications`** — `src/routes/dashboard.external-certifications.tsx` — Component: `ExternalCertsPage`. Upload CPR/First Aid/MANDT/etc; manager approval tab. confirmed-from-code.
- **`/dashboard/reports`** — `src/routes/dashboard.reports.tsx` — Component: `ReportsPage`. Wrapped in `RequirePermission perm="export_reports"`. CSV export of training/compliance reports. confirmed-from-code.
- **`/dashboard/reimbursements`** — `src/routes/dashboard.reimbursements.tsx` — Component: `ReimbursementApprovalsPage`. Wrapped in `RequirePermission perm="manage_users"`. Activity reimbursement request approvals. confirmed-from-code.
- **`/dashboard/timeclock`** — `src/routes/dashboard.timeclock.tsx` — Component: `TimeClockPage`. General (non-client) time clock for training/admin/travel. confirmed-from-code.
- **`/dashboard/invitations`** — `src/routes/dashboard.invitations.tsx` — Component: `InvitationsPage`. Wrapped in `RequirePermission perm="invite_users"`. Invitation management. confirmed-from-code.
- **`/dashboard/client-billing-codes`** — `src/routes/dashboard.client-billing-codes.tsx` — Component: `ClientBillingCodesPage`. Wrapped in `RequireRole roles=["admin","manager","super_admin"]`. Per-client billing code CRUD. confirmed-from-code.
- **`/dashboard/assignments`** — `src/routes/dashboard.assignments.tsx` — Staff course assignment management. confirmed-from-code.
- **`/dashboard/workspace/$clientId`** — `src/routes/dashboard.workspace.$clientId.tsx` — Component: `ClientWorkspace`. Staff EVV punch-pad + client tabs (About, Clock In, MAR, Forms). Search params: `tab`, `code`. confirmed-from-code.
- **`/dashboard/hhs-hub/$clientId`** — `src/routes/dashboard.hhs-hub.$clientId.tsx` — Component: `HhsClientHub`. Host Home client hub — tabs: Daily Note, MAR, Attendance, PRN Forms + incident report. Search param: `tab`. confirmed-from-code.
- **`/dashboard/host-home-control`** — `src/routes/dashboard.host-home-control.tsx` — Component: `HostHomeControl` (also exported). Admin oversight desk for HHS — tabs: Daily Notes, eMAR, Attendance, Audits. confirmed-from-code.
- **`/dashboard/hhs-hub.$clientId`** — embedded in Records Desk Host Home tab. confirmed-from-code.
- **`/dashboard/super-admin`** — `src/routes/dashboard.super-admin.tsx` — Component: `SuperAdminConsole`. Wrapped in `RequirePermission perm="view_platform_metrics"`. Platform-level tenant + personnel console. confirmed-from-code.
- **`/dashboard/admin/emar-audit`** — `src/routes/dashboard.admin.emar-audit.tsx` — Component: `AuditPage`. Wrapped in `RequirePermission perm="manage_users"`. MAR/eMAR log audit table. confirmed-from-code.
- **`/dashboard/programs.$programId`** — confirmed-from-code (see above).
- **`/dashboard/pba-ledger`** — confirmed-from-code.
- **`/dashboard/reports`** — confirmed-from-code.

### HIVE Executive routes (gated by `RequireHiveExecutive`)

- **`/dashboard/hive-exec`** — `src/routes/dashboard.hive-exec.tsx` — Component: `HiveExecLayout`. 8-tab nav shell. confirmed-from-code.
- **`/dashboard/hive-exec/`** — `src/routes/dashboard.hive-exec.index.tsx` — Component: `CompaniesPage`. KPI cards + company table with search and status filter. confirmed-from-code.
- **`/dashboard/hive-exec/$orgId`** — `src/routes/dashboard.hive-exec.$orgId.tsx` — Component: `CompanyDetailPage`. Subscription editor for a single company. confirmed-from-code.
- **`/dashboard/hive-exec/new-company`** — `src/routes/dashboard.hive-exec.new-company.tsx` — New company creation form. confirmed-from-code.
- **`/dashboard/hive-exec/states`** — `src/routes/dashboard.hive-exec.states.tsx` — Platform state management list. confirmed-from-code.
- **`/dashboard/hive-exec/states/$stateCode`** — `src/routes/dashboard.hive-exec.states.$stateCode.tsx` — State detail page. confirmed-from-code.
- **`/dashboard/hive-exec/states/$stateCode/onboarding`** — `src/routes/dashboard.hive-exec.states.$stateCode.onboarding.tsx` — State onboarding checklist. confirmed-from-code.
- **`/dashboard/hive-exec/approvals`** — `src/routes/dashboard.hive-exec.approvals.tsx` — Extraction/data approvals queue. confirmed-from-code.
- **`/dashboard/hive-exec/permissions`** — `src/routes/dashboard.hive-exec.permissions.tsx` — Platform-level permissions & roles. confirmed-from-code.
- **`/dashboard/hive-exec/plans`** — `src/routes/dashboard.hive-exec.plans.tsx` — Plans & billing management. confirmed-from-code.
- **`/dashboard/hive-exec/health`** — `src/routes/dashboard.hive-exec.health.tsx` — Account health dashboard. confirmed-from-code.
- **`/dashboard/hive-exec/tickets`** — `src/routes/dashboard.hive-exec.tickets.tsx` — Support queue. confirmed-from-code.
- **`/dashboard/hive-exec/company-migration`** — `src/routes/dashboard.hive-exec.company-migration.tsx` — Component: `CompanyMigrationPage`. Wrapped in `RequireHiveExecutive`. Migration intake form. confirmed-from-code.
- **`/dashboard/hive-exec/nectar`** — `src/routes/dashboard.hive-exec.nectar.tsx` — NECTAR platform config (exec-only). confirmed-from-code.
- **`/dashboard/hive-exec/base-template`** — `src/routes/dashboard.hive-exec.base-template.tsx` — Base template editor. confirmed-from-code.

### API route

- **`/api/public/hooks/nectar-schedules`** — `src/routes/api/public/hooks/nectar-schedules.ts` — Webhook handler for NECTAR schedule events. confirmed-from-code.

### ⚠ Broken/orphan wiring notes

- **`/dashboard/billing/subscription`** appears in `BillingLayout` TABS array (`src/routes/dashboard.billing.tsx:22` — `{ to: "/dashboard/billing/subscription", label: "HIVE Subscription" }`) but **no route file exists** for that path. Clicking the tab navigates to a 404. **broken-wiring**.
- **`/dashboard/billing-520`** has a route file but is **not linked from any nav or billing tab**. orphaned.
- **`/dashboard/team`** — `src/routes/dashboard.team.tsx` exists but is **not in any nav array**. orphaned.
- **`/dashboard/workspace-admin-xxxxxxxx`** — no route file discovered; links from staff-profile to `/dashboard/workspace/$clientId` use the correct path. OK.

---

## 2. Navigation

### STAFF_NAV (`src/routes/dashboard.tsx:44-50`)

Rendered for `role === "employee"` or when `view === "staff"`. No per-item permission gate beyond view-level.

| # | Label | Target route | Icon | Gate |
|---|-------|-------------|------|------|
| 1 | My Caseload | `/dashboard` | `LayoutDashboard` | `view === "staff"` |
| 2 | Schedule | `/dashboard/schedule` | `CalendarDays` | same |
| 3 | Daily Logs | `/dashboard/daily-logs` | `ClipboardCheck` | same |
| 4 | Ask NECTAR | `/dashboard/ask-nectar` | `Sparkles` | same |
| 5 | My Trainings | `/dashboard/courses` | `GraduationCap` | same |

### ADMIN_NAV (`src/routes/dashboard.tsx:52-65`)

Rendered for `view === "admin"`. Per-item permission gates noted below.

| # | Label | Target route | Icon | Gate |
|---|-------|-------------|------|------|
| 1 | Company Overview | `/dashboard` | `LayoutDashboard` | — |
| 2 | Records Desk | `/dashboard/records-desk` | `ClipboardCheck` | — |
| 3 | PBA Trust Ledger | `/dashboard/pba-ledger` | `Wallet` | — |
| 4 | Scheduling | `/dashboard/scheduling` | `CalendarDays` | — |
| 5 | Employees | `/dashboard/employees` | `Users` | — |
| 6 | HR Admin | `/dashboard/hr-admin` | `ShieldCheck` | `perm="manage_users"` (or admin/super_admin role) |
| 7 | Clients | `/dashboard/clients` | `Contact2` | — |
| 8 | Teams & Homes | `/dashboard/teams` | `Building2` | — |
| 9 | Billing | `/dashboard/billing` | `Receipt` | `perm="view_billing"` (or admin/super_admin) |
| 10 | Financial | `/dashboard/financial` | `TrendingUp` | `perm="manage_billing"` (or admin/super_admin) |
| 11 | Audit | `/dashboard/audit` | `FolderArchive` | — |
| 12 | Settings | `/dashboard/settings` | `Settings` | — |

### NECTAR_NAV (`src/routes/dashboard.tsx:67-73`)

Appended after `ADMIN_NAV` when `effectiveView === "admin"`. No per-item gates.

| # | Label | Target route | Icon | Gate |
|---|-------|-------------|------|------|
| 1 | Ask NECTAR | `/dashboard/help` | `HelpCircle` | admin view only |
| 2 | Authoritative Sources | `/dashboard/authoritative-sources` | `ShieldCheck` | admin view only |
| 3 | Company Docs | `/dashboard/nectar-docs` | `Database` | admin view only |
| 4 | External Compliance | `/dashboard/external-compliance` | `ExternalLink` | admin view only |
| 5 | Internal Audit | `/dashboard/internal-audit` | `ClipboardCheck` | admin view only |

### HIVE Executive nav — `execNav` (`src/routes/dashboard.tsx:120-133`)

Rendered when `view === "hive_exec"`. Gated by `isExecutive` (from `useIsHiveExecutive`).

| # | Label | Target route | Icon | Gate |
|---|-------|-------------|------|------|
| 1 | HIVE Overview | `/dashboard/hive-exec` | `LayoutDashboard` | HIVE Executive only |
| 2 | Add Company | `/dashboard/hive-exec/new-company` | `Plus` | same |
| 3 | States | `/dashboard/hive-exec/states` | `MapPin` | same |
| 4 | Extraction Approvals | `/dashboard/hive-exec/approvals` | `ShieldCheck` | same |
| 5 | Permissions & Roles | `/dashboard/hive-exec/permissions` | `UserCog` | same |
| 6 | Plans & Billing | `/dashboard/hive-exec/plans` | `CreditCard` | same |
| 7 | Account Health | `/dashboard/hive-exec/health` | `Activity` | same |
| 8 | Support Queue | `/dashboard/hive-exec/tickets` | `LifeBuoy` | same |
| 9 | Company Migration | `/dashboard/hive-exec/company-migration` | `ArrowRightLeft` | same |
| 10 | NECTAR | `/dashboard/hive-exec/nectar` | `Hexagon` | same |

### Billing layout sub-nav (`src/routes/dashboard.billing.tsx:16-23`)

| # | Label | Target | Icon | ⚠ |
|---|-------|--------|------|---|
| 1 | Overview | `/dashboard/billing` (exact) | `Users` | — |
| 2 | NECTAR | `/dashboard/billing/nectar` | `Sparkles` | — |
| 3 | 520 Form | `/dashboard/billing/form520` | `FileSpreadsheet` | — |
| 4 | Imports / Authorizations | `/dashboard/billing/imports` | `Upload` | — |
| 5 | HIVE Subscription | `/dashboard/billing/subscription` | `CreditCard` | **⚠ No route file exists for this path** |

### HIVE Exec layout sub-nav (`src/routes/dashboard.hive-exec.tsx:14-24`)

Same as `execNav` above (Companies, Add Company, States, Permissions & Roles, Plans & Billing, Account Health, Support Queue, Company Migration). No NECTAR tab in layout nav (it appears only in sidebar execNav).

---

## 3. Per-Page Controls

### `/dashboard/employees/` — `EmployeesPage` (`src/routes/dashboard.employees.index.tsx`)

**Buttons:**
- `Invite by email` — opens `inviteOpen` dialog — `confirmed-from-code` (line ~68)
- `Create manually` — opens `manualOpen` dialog — `confirmed-from-code`
- `Import (CSV)` — opens `BulkImporter` component — `confirmed-from-code`
- Per-row: `Reset Password` icon button → opens `resetUser` dialog — `confirmed-from-code`
- Per-row: `Activate` / `Deactivate` icon toggle (`UserCheck`/`UserX`) — `confirmed-from-code`
- Per-row: `Edit` pencil icon → opens `editingMember` drawer — `confirmed-from-code`
- Per-row: `Assign course` (`BookOpen` icon) → opens `assignOpen` dialog — `confirmed-from-code`
- Per-row: `Manage caseload` → opens `CaseloadDrawer` — `confirmed-from-code`
- Per-row: View profile link → navigates to `/dashboard/employees/$staffId` — `confirmed-from-code`

**Filters/Search:**
- Search input — filters by name/email — `confirmed-from-code`

**Invite dialog fields:**
- Email (text input)
- Role (Select: `admin`, `manager`, `employee`) — `confirmed-from-code` (ROLE_LABEL)
- Submit: `Send invitation`

**Create manually dialog fields:**
- First name, Last name, Username, Email, Password (auto-generated, copyable)
- Role (Select: admin/manager/employee)
- Department, Hire date
- Training tracks (multi-checkbox)

**Edit member drawer fields:**
- Full name, Email, Employee ID
- Role (Select: admin/manager/employee)
- Position (Select: Direct Care / Host Staff / Office Staff / Admin)
- Worker type (Select: w2 / 1099)
- Hourly rate, Daily rate
- Active toggle
- Save / Cancel buttons

**Assign course dialog:**
- Course (Select from published courses)
- Due date (date input, optional)
- Assign button

**Reset password dialog:**
- Shows auto-generated temp password
- Copy button
- Confirm button

---

### `/dashboard/employees/$staffId` — `StaffProfilePage` (`src/routes/dashboard.employees.$staffId.tsx`)

**Tabs** (values): `overview`, `hr` — `confirmed-from-code` (line 206)

**Overview tab:**
- Read-only info cards: Contact & position, Team, Caseload (list with workspace links), Schedule card
- `← Employees` back button (line 172)
- `Back to list (quick edit)` button (line 180)
- `Manage team membership →` link (line 225)
- `Manage caseload →` link (line 238)
- `Open schedule →` button → `/dashboard/schedule` (line 248+)

**HR tab:**
- Renders `StaffHrChecklistCard` component — `confirmed-from-code` (line 258)

---

### `/dashboard/clients` — `ClientsPage` + `ClientWorkspace` (`src/routes/dashboard.clients.tsx`)

**Client list:**
- Search input (filters by name) — `confirmed-from-code` (line 195+)
- `+ Add client` button → opens `AddClientDialog` — `confirmed-from-code` (line 203)
- `Import clients (CSV)` via `BulkImporter` — `confirmed-from-code`
- Per-row: click to open `ClientWorkspace` — `confirmed-from-code`

**Add client dialog fields:**
- First name, Last name, Phone number
- Physical address, Date of birth
- Medicaid ID
- Service codes (DSPD multi-select via `DspdCodesMultiSelect`)
- Geofence radius (Select options: 250 ft Strict In-Home / 500 ft Standard Suburban / 1,000 ft Medicaid Baseline / 2,500 ft Community Outing / 5,000 ft Rural / Open Campus)
- Special directions (textarea)
- Emergency contact name, Emergency contact phone
- Submit: `Add client`

**Client workspace tabs** (values/labels from line 492-498):
- `profile` → Client Profile
- `intake` → Intake
- `pcsp` → PCSP & Directives
- `staff` → Staff Assignment
- `medications` → Medications & MAR (conditional: only shown if `emar` feature enabled for client)
- `documents` → Documents
- `settings` → Settings

**Profile tab controls:**
- Edit client form (all Add fields + photo upload via `ClientPhoto`)
- Client photo upload/change button
- `Save changes` / `Archive client` buttons
- Approved locations editor (`ApprovedLocationsEditor`)

**PCSP tab controls:**
- PCSP goals (add/remove text goals)
- Textarea per goal
- `+ Add goal` button

**Staff Assignment tab controls:**
- Staff search/select
- Service code assignment per staff member
- Group home assignment toggle
- `Assign` / `Remove` buttons

**Medications & MAR tab controls:**
- `MedicationsManager` component (add/edit/deactivate medications)
- `MarCalendar` component (view past administrations)

**Documents tab controls:**
- Upload button (opens file picker)
- Document type (Select: Physician Order / State PCSP / Guardianship Papers / Emergency Authorization / Insurance Card / Behavior Support Plan / Medical History / Consent Form / Incident Report / Other)
- Download / Delete per document

**Settings tab controls:**
- Feature toggles (Switch per feature):
  - MAR / eMAR
  - Daily Notes
  - Attendance
  - Trust Ledger
  - Incident Forms
  - Scheduling
- `Archive client` (destructive) button

---

### `/dashboard/hr-admin` — `HrAdminPage` (`src/routes/dashboard.hr-admin.tsx`)

**NECTAR summary stat cards** (clickable, set filter):
- Staff in scope (count)
- Open gaps → sets filter `open_gaps`
- Renewals ≤30d → sets filter `renewals`
- Overdue → sets filter `renewals`
- Onboarding in progress → sets filter `onboarding`

**Filters:**
- Search input — `placeholder="Search staff…"` — `confirmed-from-code` (line 106)
- Team Select (dynamic, from rollup data): `All teams` + team names
- Status Select: `All staff` / `With open gaps` / `Renewals ≤30d / overdue` / `Onboarding in progress`

**Table columns:** Staff (link to `/dashboard/employees/$staffId`), Team, Completion (bar), Open gaps (badge), Next renewal, Status, →

---

### `/dashboard/scheduling` — `SchedulingPage` / `SchedulerInner` (`src/routes/dashboard.scheduling.tsx`)

**View toggle:**
- `By Staff` / `By Client` buttons (ViewMode: `staff` | `client`) — `confirmed-from-code` (line 499+)

**Week navigation:**
- `◀` / `▶` chevron buttons (prev/next week) — `confirmed-from-code`
- Current week label

**Filter:**
- Shift filter Select: `All` / `Published` / `Unpublished` / `Accepted` / `Pending` / `Declined`

**Buttons:**
- `+ New shift` → opens `ShiftFormDialog` — `confirmed-from-code`
- `NECTAR Auto-Assign` → opens `NectarAutoAssignDialog` — `confirmed-from-code`
- `Publish all draft` button — publishes all drafts for week
- Per-shift: `Copy`, `Delete` (Trash2), click to edit

**ShiftFormDialog fields:**
- Staff (Select from members)
- Client (Select from clients)
- Shift type (Select: Hourly / EVV / Host Home Daily / Community Integration / Respite / Transportation)
- Service code (Select from client's authorized codes)
- Start date/time, End date/time (datetime-local inputs)
- Notes (textarea)
- Recurrence (Select: Does not repeat / Every day / Every week / Every 2 weeks / Every month)
- Recurrence end date (conditional)
- Actions: `Save as draft` / `Save & publish`

---

### `/dashboard/emar` — `EmarPage` (`src/routes/dashboard.emar.tsx`)

**List:** Today's medication schedule cards. Each card shows: time badge, client name, medication name, dosage, route.
- If not logged: `Record pass` button → opens `PassDialog`
- If logged: `Logged` badge (read-only)

**PassDialog fields:**
- Status (Select): `administered` / `refused` / `omitted` / `missed`
- Exception reason (Select, conditional on non-administered): Client refused / Client unavailable / sleeping / Held per physician order / NPO (medical hold) / Medication unavailable / Adverse reaction / withheld / Self-administered (witnessed) / Other (see notes)
- Notes (textarea, required if exception, min 10 chars)
- Attestation checkbox (5-Rights certification statement, required)
- `Submit` button (disabled unless attested + validation passes)

---

### `/dashboard/records-desk` — `RecordsDesk` (`src/routes/dashboard.records-desk.tsx`)

**Tabs** (values):
- `command-center` → Command Center
- `evv-timesheets` → EVV & Timesheets
- `host-home` → Host Home
- `audit-zone` → Audit Zone

Tab value stored in URL search param `?tab=`. Inner Command Center tab forwarded via `?cc=`.

---

### `/dashboard/command-center` — `CommandCenter` (`src/routes/dashboard.command-center.tsx`)

**Custom tab bar** (not Tabs component — rendered as `<button>` elements):
- `🍯 NECTAR Infusion` (id: `nectar`) — shows `NectarTaskCenter` + NECTAR infusion panel
- `🚨 Urgent` (id: `urgent`) — open shifts, exception timesheets, incident reports awaiting review
- `📋 Pending Review` (id: `pending`) — pending timesheets, daily logs, incidents
- `✅ Approved Archive` (id: `approved`) — approved timesheets and logs
- `📊 Analytics` (id: `analytics`) — `AgencyHealthSnapshot` component

URL search param: `?cc=urgent|pending|approved|analytics|nectar`

**Urgent tab controls:**
- Per-timesheet: `Approve` button, `Edit` button (opens `EditShiftDialog`), `View GPS` button (opens `GpsMatchDialog`)
- Per-incident: `Review` button (opens incident detail dialog with `State Ref #` input and `Mark state-submitted` action)

**Pending tab controls:**
- Filter: `All` / `Timesheets` / `Daily logs` / `Incidents` (Select)
- Search input (staff/client name)
- Date from / Date to (date inputs)
- Per-timesheet row: `Approve` / `Deny` / `Edit` / `GPS` buttons
- Per-daily-log row: `Approve` / `Return for correction` buttons (with denial reason input)

**Approved tab controls:**
- Search input
- Date from / Date to
- Export to Utah Medicaid (button: `Export Utah Medicaid CSV`)
- Export master (button: `Export master CSV`)
- AI vector search input + `Search` button + `Clear` (X) button
- Per-row: `View GPS` button, `Edit` button

**EditShiftDialog fields:**
- Clock in (datetime-local), Clock out (datetime-local)
- Service code (Select from EVV_SERVICE_CODES)
- GPS in latitude, GPS in longitude
- GPS out latitude, GPS out longitude
- Reason for edit (textarea)

**GpsMatchDialog:** Read-only GPS coordinates + OSM map links.

---

### `/dashboard/compliance-desk` — `ComplianceDeskPage` (`src/routes/dashboard.compliance-desk.tsx`)

Two sections rendered inline (not tabs — separate stacked cards):

**Pending Approvals Ledger:**
- Search input `placeholder="Search staff, client, member ID…"` — `confirmed-from-code` (line 1138)
- Service code Select (dynamic from org codes + `All service codes`)
- From date / To date (date inputs)
- `Export` button (CSV)
- Per-row: `View reason` button (opens `ReasonDialog`), `Approve` button (`Check` icon), `Edit` button (opens `EditShiftDialog`), geofence badge tooltip

**Approved Archive:**
- Same search/filter controls
- Per-row: `View GPS` (opens `GpsMatchDialog`), `Edit` button
- Review reconciliation: `Accept` / `Flag` buttons (opens `ReviewReconciliationDialog`)

**ReviewReconciliationDialog fields:**
- Reconciliation decision (Select: Accept / Flag)
- Attestation (textarea)
- Review notes (textarea)

---

### `/dashboard/audit` — `AuditPage` (`src/routes/dashboard.audit.tsx`)

**List view:**
- `+ New audit folder` button (variant `cta`) → opens `NewPacketDialog` — `confirmed-from-code` (line 95)
- `AttestationBanner` strip (compact nudge mode)
- Audit folder cards (clickable → opens `PacketDetail` inline)

**NewPacketDialog fields:**
- Packet name (text input)
- Fiscal year (text input)
- Provider name (text input)
- Timeline start / end (date inputs)
- Expectations summary (textarea)
- Upload audit letter (file input)
- `Parse with NECTAR` button (calls `parseAndProduceAuditPacket`)
- `Create folder` button

**PacketDetail view:**
- `← Back` button
- `AuditorShareManager` component (manage external auditor access)
- Per-item status badges: Auto-filled / Confirmed / Needs review / Missing / N/A
- Per-item: `Confirm` button, `Mark N/A` button, evidence upload, notes textarea
- Upload evidence files button
- Item sub-folder filter: staff / client / admin / other

---

### `/dashboard/billing` (layout) — `BillingLayout` (`src/routes/dashboard.billing.tsx`)

**Sub-nav tabs:** Overview, NECTAR, 520 Form, Imports / Authorizations, HIVE Subscription (**⚠ Subscription tab leads to non-existent route**)
**`NectarBillingReadinessBar`** component rendered in header.

---

### `/dashboard/billing/` — `BillingOverviewPage` (`src/routes/dashboard.billing.index.tsx`)

**Table columns:** Client, Medicaid ID, Codes, Annual units, Used, Remaining (units · hrs), Renewal, → (link to `/dashboard/billing/$clientId`)
- No add/edit controls — read-only summary. `confirmed-from-code`

---

### `/dashboard/billing/$clientId` — per-client billing detail

**Controls:**
- `+ Add authorization` button (opens inline form)
- Per-code: Delete (Trash2) button
- Fields: service code (text), start date, end date, annual unit authorization (number)
- `Save` button per row

---

### `/dashboard/financial/revenue` — `RevenuePage` (`src/routes/dashboard.financial.revenue.tsx`)

**Controls:**
- Year Select (current year back 5 years)
- Granularity toggle buttons: `Monthly` / `Quarterly` / `YTD`
- Month Select for inputs (conditional on granularity)
- `YourInputsSection` component (manual billed revenue entry for base-plan orgs)
- `+ Add entry` button → opens dialog with: month, amount, label, notes fields
- Per-entry: `Edit` (pencil), `Delete` (trash) buttons
- Lock icon on HIVE-Verified subtotal (read-only for verified orgs)

---

### `/dashboard/pba-ledger` — `PbaLedgerPage` (`src/routes/dashboard.pba-ledger.tsx`)

**Controls:**
- `+ Open account` button → opens `AddAccountDialog` — `confirmed-from-code`
- Per-account: click → opens account detail panel
- Pending audit samples list with `Verify` button per sample

**AddAccountDialog fields:**
- Client (Select from org clients)
- Medicaid threshold (number input)
- Notes (textarea)
- `Open account` button

**Account detail panel:**
- `+ Log transaction` → opens transaction dialog
- Transaction dialog fields: type (Select: Deposit/Withdrawal/Transfer/Adjustment), amount, description, receipt upload (ImageIcon)
- Per-transaction: details row
- Quarterly audit sample verification

---

### `/dashboard/teams` — `TeamsPage` (`src/routes/dashboard.teams.tsx`)

**Controls:**
- `Create team` button (via `CreateTeamDialog`) — `confirmed-from-code`
- Unassigned Roster drawer (toggleable with `◀` / `▶` chevrons)
- Drag-and-drop staff/client cards between team columns
- Team header: manager name (Popover with manager select)
- Per-team: `+ Add staff` Popover, `+ Add client` Popover

**CreateTeamDialog fields:**
- Team name (text input)
- Manager (Select from staff list)
- `Create` button

---

### `/dashboard/settings` — `SettingsPage` (`src/routes/dashboard.settings.tsx`)

**Profile form:**
- Email (disabled input)
- Full name (text input)
- `Save profile` button

**Organization form** (admin only):
- Organization name (text input)
- `Save organization` button

**`CompanyOverviewSettings`** component (managers+)
**`CelebrationSettings`** component
**Links (cards with `→` arrow):**
- `Team access` → `/dashboard/settings/team-access` (admin/super_admin only)
- `🏦 Institutional Client Banking Registry` → `/dashboard/settings/bank-mapping` (admin only)

---

### `/dashboard/permissions` — `PermissionsPage` (`src/routes/dashboard.permissions.tsx`)

**Controls:**
- Permission matrix table: rows = ALL_PERMISSIONS, columns = Editable roles (admin / manager / employee)
- Per-cell: `Switch` toggle — `confirmed-from-code`
- `Reset to defaults` button (RotateCcw icon)
- `Save permissions` button (disabled if not dirty)

---

### `/dashboard/roles` — `RolesPage` (`src/routes/dashboard.roles.tsx`)

**Controls:**
- Search input (filter by name/email/role) — `confirmed-from-code`
- Per-member row: Role Select (admin/manager/employee; super_admin can also set super_admin)
- Role count summary badges

---

### `/dashboard/hr-admin` — (see above §3)

### `/dashboard/daily-logs` — `DailyLogsPage` (`src/routes/dashboard.daily-logs.tsx`)

**Staff view (`StaffDailyJournal`):**
- Client card list (HHS clients from caseload) — click to open log form
- Missing entries list (last 30 days) — click to open backdate dialog
- Rejected logs section — `Resubmit` button per rejected log

**Log form (sheet/dialog):**
- Client selector (pre-filled from card click)
- Log date (pre-filled to today or backdate)
- Narrative textarea (min 50 words enforced)
- PCSP goals checkboxes (from client's goals)
- Word count indicator
- AI coaching: `Evaluate with NECTAR` button (calls `evaluateShiftNote`)
- Signature pad (`FileSignature`)
- `Submit daily log` button

**Admin view (`AdminAuditQueue`):**
- Pending / returned log list
- Approve / Reject per log
- Date filter, search input

---

### `/dashboard/programs` — `ProgramsPage` (`src/routes/dashboard.programs.tsx`)

**Controls:**
- Per program card: `View` button (unenrolled) → `/dashboard/programs/$programId`
- Per program card: `Enroll` button (unenrolled, triggers mutation)
- Per enrolled program: `Start` / `Resume` / `Review` button → `/dashboard/programs/$programId`
- Progress bar (read-only)

---

### `/dashboard/ask-nectar` — `AskNectarStaffPage` (`src/routes/dashboard.ask-nectar.tsx`)

- Renders `AskNectarStaff` component (full-height chat UI)
- Search param `clientId` pre-scopes context
- Controls within component (inferred from component file): message input, send button, client context selector

---

### `/dashboard/hive-exec/` — `CompaniesPage` (`src/routes/dashboard.hive-exec.index.tsx`)

**KPI cards (read-only):** Active companies, MRR, Trials, Past due

**Table filters:**
- Search input `placeholder="Search company…"` — `confirmed-from-code` (line 40)
- Status filter (native `<select>`): All statuses / Active / Trial / Past due / Canceled / Paused

**Table columns:** Company (link → `/$orgId`), Plan, Status, MRR, Renewal, Staff count, Client count, Tickets, Health

---

### `/dashboard/hive-exec/$orgId` — `CompanyDetailPage` (`src/routes/dashboard.hive-exec.$orgId.tsx`)

**Controls:**
- `← Back` link
- KPI cards: Staff, Clients, Timesheets (last 30d), Activity score
- Subscription editor fields: Plan (text/select), Status (text/select), MRR (number), Renewal date, Trial ends, Notes (textarea)
- `Save subscription` button
- Impersonate button (if available)

---

### `/dashboard/hive-exec/company-migration` — `CompanyMigrationPage` (`src/routes/dashboard.hive-exec.company-migration.tsx`)

**Controls:**
- Target company Select (from `listCompanies`)
- Engagement status Select: `quoted` / `in_progress` / `review` / `complete`
- File upload (prior-platform export)
- `Parse with NECTAR` button
- Per-module progress indicator (Staff, Clients, Billing, Documents sections)
- `NectarGuidanceStrip` component

---

### `/dashboard/host-home-control` — `HostHomeControl` (`src/routes/dashboard.host-home-control.tsx`)

**Tabs:**
- `Daily Notes` (value: `notes`)
- `eMAR` (value: `emar`)
- `Attendance` (value: `attendance`)
- `Audits` (value: `audits`)

Each tab is a read-only admin review grid. `markIncidentFiled` action button in audits tab.

---

### `/dashboard/hhs-hub/$clientId` — `HhsClientHub` (`src/routes/dashboard.hhs-hub.$clientId.tsx`)

**Tabs (staff-facing, per client):**
- `Daily Note` (value: `note`)
- `MAR` (value: `emar`) — conditional on client `emar` feature
- `Attendance` (value: `att`)
- `PRN Forms` (value: `prn`)

**Daily Note tab:**
- Narrative textarea (AI coached with `evaluateShiftNote`)
- PCSP goals checkboxes
- Signature pad + initials input
- `Submit` button

**MAR tab:**
- Per-medication: Status Select (Passed / Refused / Missed / Held), PRN reason textarea, pill count input, variance textarea
- `Log pass` button

**Attendance tab:**
- RadioGroup: `Present Overnight (billable)` / `Away / Leave (unbillable)`
- If Away: Away category Select (Hospitalization / Family Leave / Unapproved Absence), initials input
- `Save attendance` button

**PRN Forms tab:**
- PRN reason, dosage, outcome fields
- `Submit PRN` button

**Incident report** (accessible via button):
- Incident type checkboxes (Fire, Earthquake, Severe Weather, etc.)
- Full incident narrative fields (before/during/after)
- Supervisor/family notification toggles
- Medical attention fields

---

### `/dashboard/workspace/$clientId` — `ClientWorkspace` (`src/routes/dashboard.workspace.$clientId.tsx`)

**Tabs:**
- `About` (value: `about`) — renders `AboutTab` (client info sheet + quick-info)
- `Clock In` (value: `clock-in`) — renders `PunchPad` (EVV clock in/out) + `ActiveShiftReimbursementSlot`
- `MAR` (value: `emar`) — conditional on client `emar` feature — renders `MarEmarTab`
- `Forms` (value: `forms`) — renders `FormsHubTab`

**Clock In tab (PunchPad):**
- Service code selector (from staff's authorized codes for this client)
- `Clock in` / `Clock out` buttons with GPS capture
- Shift note textarea (on clock-out)

---

### `/dashboard/super-admin` — `SuperAdminConsole` (`src/routes/dashboard.super-admin.tsx`)

**Tabs:**
- `🛰️ Tenant Console` (value: `tenants`)
- `👥 Cross-Tenant Personnel Registry` (value: `personnel`)

**Tenant Console:**
- Search input — `confirmed-from-code` (line ~150)
- `+ Create tenant` button → opens `createOpen` dialog
- Per-tenant row: `View` (Eye) → opens tenant sheet
- Tenant sheet: `is_active` Switch toggle, `client_tier_limit` number input, `Save` button
- Impersonate button (`startImpersonation`)

---

### `/dashboard/admin/emar-audit` — `AuditPage` (`src/routes/dashboard.admin.emar-audit.tsx`)

**Filters:**
- Status filter (native button group): `All` / `Refused/Omitted` / `Missed`
- Staff filter input — `confirmed-from-code` (line 56)

**Table columns:** Client, Medication, Dose, Team, Scheduled time, Administered at, Status, Staff, Exception reason, Attestation
- `Download CSV` button — `confirmed-from-code` (line ~90)

---

### `/dashboard/reimbursements` — `ReimbursementApprovalsPage` (`src/routes/dashboard.reimbursements.tsx`)

**Tabs:**
- `Pending` (value: `pending`)
- `Approved` (value: `approved`)
- `Denied` (value: `denied`)

Per-pending-row: `Approve` / `Deny` buttons → opens `decisioning` dialog with reason textarea.

---

### `/dashboard/external-certifications` — `ExternalCertsPage` (`src/routes/dashboard.external-certifications.tsx`)

**Tabs:**
- `My certifications` (value: `mine`)
- `Pending review` (value: `review`) — shown only if `canApprove` (`perm="approve_external_certs"`)
- `All org certifications` (value: `org`) — same gate

**Upload dialog fields:**
- Cert type (Select): CPR/First Aid / SOAR / MANDT / PART / CPI/Safety Care / Other
- Cert name, Issuer, Issued date, Expiry date (inputs)
- File upload (PDF/image)
- `Submit` button

**Review tab:** `Approve` / `Reject` per cert, reviewer notes textarea.

---

### `/dashboard/reports` — `ReportsPage` (`src/routes/dashboard.reports.tsx`)

**Report buttons (each triggers CSV download):**
- `Compliance Summary` — `confirmed-from-code`
- `Training Completion`
- `Overdue Training`
- `Certification Renewals`

---

### `/dashboard/invitations` — `InvitationsPage` (`src/routes/dashboard.invitations.tsx`)

**Controls:**
- `+ Invite` button → opens dialog — `confirmed-from-code`
- Dialog fields: Email (input), Role (Select: admin/manager/employee)
- Per-pending invite row: `Copy join link` (Copy icon), `Resend` (RefreshCcw), `Revoke` (Ban)

---

### `/dashboard/timeclock` — `TimeClockPage` (`src/routes/dashboard.timeclock.tsx`)

- Renders `GeneralTimeClock` component (non-client time tracking)
- Controls within component (inferred): clock-in button, type selector (Training/Admin/Travel/Meeting), clock-out button

---

### `/dashboard/help` — `HelpPage` (`src/routes/dashboard.help.tsx`)

**Controls:**
- Starter question buttons (admin: 6 prompts; staff: 4 prompts) — `confirmed-from-code` (lines 50-61)
- Message input (textarea)
- `Send` button
- `Reset` / clear conversation button
- `Escalate to HIVE` button (calls `escalateHelpToHive`, creates support ticket)
- `View my tasks` button → opens `NectarTaskCenter`

---

### `/dashboard/authoritative-sources` — (admin NECTAR)

**Tabs:**
- `Sources` (file/web uploads)
- `Requirements` (extracted requirements list)
- `Mappings` (requirement-to-data mappings)
- `Attestations` (audit trail)

**Controls:**
- `+ Upload source` button (PDF/DOC)
- `+ Add web source` button (URL input)
- `AuthoritativeSourceDrop` drag-zone
- Per-source: `Mark as authoritative` toggle, `Ignore` button, `Generate requirements` button (AI)
- Per-requirement: `Confirm` / `Mark N/A` / `Explain` (AI) buttons
- Per-mapping: `Accept` / `Delete` buttons
- `Propose mappings with NECTAR` button
- `Prefill all` button

---

### `/dashboard/nectar-docs` — `NectarDocsPage` (`src/routes/dashboard.nectar-docs.tsx`)

**Controls:**
- `+ Upload document` button → opens dialog — `confirmed-from-code`
- Upload dialog fields: file input, doc type (Select from DOC_TYPES: PCSP / 1056 Budget / State SOW / Referral / Intake / Assessment / Certification / Training / Contract / EVV report / Timesheet / Incident report / Billing record / Other), owner kind (client/staff/org), owner select
- Search input
- Doc type filter Select
- Per-doc: `Actions` button → opens `NectarDocumentActionsDialog` (view, re-parse, delete, review extracted fields)
- `Delete` button per doc

---

*End of FEATURE_INVENTORY.md — Part 1*
