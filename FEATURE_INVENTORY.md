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

---

## 4. Server Functions

All server functions use `@tanstack/react-start` `createServerFn`. Auth gate minimum is always `requireSupabaseAuth` middleware. Org-membership is a secondary runtime check via `requireOrgMembership(supabase, userId, orgId, role?)` or an RPC call.

### agency-health.functions.ts
- **`getAgencyHealthSnapshot`** — POST — input: `{ organizationId: uuid }` — reads cross-table compliance snapshot for dashboard — gate: `requireOrgMembership(..., "employee")`

### ai-coach.functions.ts
- **`evaluateShiftNote`** — POST — input: `{ note, clientGoals, shiftContext }` — sends note to AI for compliance evaluation — gate: `requireSupabaseAuth` only ⚠️ no org-membership check
- **`draftShiftNote`** — POST — input: `{ goals, keyEvents, duration }` — AI drafts a shift note — gate: `requireSupabaseAuth` only ⚠️
- **`draftVarianceJustification`** — POST — input: `{ context, varianceType }` — AI drafts billing variance justification — gate: `requireSupabaseAuth` only ⚠️
- **`answerProceduralQuestion`** — POST — input: `{ question, orgContext }` — AI answers procedural compliance question — gate: `requireSupabaseAuth` only ⚠️
- **`scanNoteForTriggers`** — POST — input: `{ note }` — scans shift note for incident/reportable triggers — gate: `requireSupabaseAuth` only ⚠️

### audit-packet.functions.ts
- **`parseAndProduceAuditPacket`** — POST — input: `{ organization_id, provider_name, letter_text, audit_letter_path?, fallback_fiscal_year? }` — AI parses audit letter, inserts audit packet + items — gate: `requireSupabaseAuth` only ⚠️ no org-membership check on write

### auditor-shares.functions.ts
- **`createAuditorShare`** — POST — input: `{ organization_id, packet_id, recipient_emails[], starts_at, ends_at, message?, share_all_items, packet_item_ids?, audit_file_ids? }` — creates timed share link for external auditors — gate: `requireSupabaseAuth` + internal `assertAdmin`
- **`revokeAuditorShare`** — POST — input: `{ share_id }` — revokes share — gate: `requireSupabaseAuth` + `assertAdmin` (looks up org from share row)
- **`extendAuditorShare`** — POST — input: `{ share_id, ends_at }` — extends expiry — gate: same
- **`listMyAuditorShares`** — GET — no input — lists shares visible to current user — gate: `requireSupabaseAuth`
- **`getAuditorShareView`** — POST — input: `{ share_id }` — returns full share payload including documents — gate: `requireSupabaseAuth`
- **`listSharesForPacket`** — POST — input: `{ packet_id }` — lists shares for a packet — gate: `requireSupabaseAuth` ⚠️ no explicit org-membership check
- **`listActiveSharesForOrg`** — POST — input: `{ organization_id }` — gate: `requireSupabaseAuth` ⚠️ no explicit org-membership check

### authoritative-sources.functions.ts
- **`ingestWebSource`** — POST — input: `{ organizationId, url, title, authoritativeKind, fiscalYear?, effectiveStart?, effectiveEnd?, assistedSetup? }` — fetches URL, stores as authoritative document — gate: `requireOrgMembership(..., "manager")`
- **`listAuthoritativeSources`** — POST — input: `{ organizationId }` — gate: `requireSupabaseAuth` ⚠️ no org-membership check
- **`markAsAuthoritativeSource`** — POST — input: `{ documentId, authoritativeKind, isAuthoritative, assistedSetup? }` — gate: `requireOrgMembership` (resolved from doc row)
- **`setSourceIgnoreState`** — POST — input: `{ documentId, action: ignore|duplicate|reactivate, reason?, duplicateOfId? }` — gate: `requireOrgMembership` (resolved from doc row)
- **`listRequirements`** — POST — input: `{ organizationId, origin?, category? }` — gate: `requireSupabaseAuth` ⚠️ no org-membership check
- **`upsertRequirement`** — POST — input: `{ id?, organizationId, sourceDocumentId?, origin, requirementKey, title, description?, category?, sourceCitation?, appliesTo? }` — gate: `requireOrgMembership(..., "manager")`
- **`deleteRequirement`** — POST — input: `{ id }` — gate: `requireOrgMembership` (resolved from row)
- **`setRequirementReviewStatus`** — POST — gate: `requireOrgMembership` (resolved from row)
- **`verifyRequirement`** — POST — gate: `requireOrgMembership(..., "manager")`
- **`generateRequirementsFromSource`** — POST — AI extracts requirements from authoritative doc — gate: `requireOrgMembership(..., "manager")`
- **`recordAttestation`** — POST — input: `{ organizationId, requirementId, ... }` — gate: `requireOrgMembership(..., "employee")`
- **`listAttestations`** — POST — gate: `requireSupabaseAuth` ⚠️ no org-membership check
- **`explainRequirement`** — POST — AI plain-language explanation — gate: `requireSupabaseAuth` ⚠️ no org-membership check

### billing-budget-parse.functions.ts
- **`parseClientBudgetDocument`** — POST — input: `{ storagePath, mimeType }` — downloads PDF from storage, AI parses PCSP/1056 budget rows — gate: `requireSupabaseAuth` only ⚠️ no org check; caller must own storage path

### bulk-import.functions.ts
- **`bulkImportRoster`** — POST — input: `{ organizationId, rows[] }` — bulk-inserts staff/client roster — gate: `requireSupabaseAuth` only ⚠️ no org-membership check on write

### celebrations.functions.ts
- **`fireCelebration`** — POST — input: `{ organizationId, ... }` — gate: `requireOrgMembership(..., "employee")`
- **`listActiveCelebrations`** — POST — gate: `requireOrgMembership(..., "employee")`
- **`acknowledgeCelebration`** — POST — gate: `requireSupabaseAuth` ⚠️ no org check
- **`evaluateCelebrationTriggers`** — POST — gate: `requireOrgMembership(..., "manager")`
- **`getCelebrationSettings`** — POST — gate: `requireOrgMembership(..., "employee")`
- **`setCelebrationSettings`** — POST — gate: `requireOrgMembership(..., "admin")`
- **`setUserCelebrationMute`** — POST — gate: `requireSupabaseAuth` only ⚠️

### client-hr.functions.ts
- **`getClientIntakeChecklist`** — GET — input: `{ organization_id, client_id }` — gate: `requireOrgMembership` + RPC `can_view_client_intake`
- **`upsertClientIntakeCompletion`** — POST — gate: `requireOrgMembership` + RPC `can_view_client_intake`

### company-overview.functions.ts
- **`getCompanyOverview`** — POST — input: `{ organizationId }` — reads org-wide overview metrics — gate: `requireOrgMembership(..., "employee")`

### employees.functions.ts
- **`createEmployeeManually`** — POST — creates org member record — gate: `requireSupabaseAuth` ⚠️ no explicit org-membership check shown
- **`adminResetEmployeePassword`** — POST — triggers password reset — gate: `requireSupabaseAuth` ⚠️

### entitlements.functions.ts
- **`getMyEntitlements`** — GET — no input — reads caller's org subscription/tier/addons — gate: `requireSupabaseAuth` (inherently self-scoped)

### financial-revenue.functions.ts
- **`getBilledRevenueByYear`** — POST — input: `{ organizationId, year }` — gate: `requireOrgMembership(..., "admin")`
- **`listBilledManualEntries`** — POST — gate: `requireOrgMembership(..., "admin")`
- **`upsertBilledManualEntry`** — POST — gate: `requireOrgMembership(..., "admin")`
- **`deleteBilledManualEntry`** — POST — gate: `requireOrgMembership(..., "admin")`

### hhs.functions.ts
- All exported fns — POST — gate: `requireOrgMembership(..., "employee")` — reads/writes HHS daily records, EMAR logs, attendance, summaries for HHS group-home clients

### hive-exec.functions.ts / hive-exec-admin.functions.ts
- HIVE executive and platform-admin operations — gate details require further read (not fully traced)

### hive-tickets.functions.ts
- Support ticket CRUD — gate: `requireSupabaseAuth`

### hr-staff.functions.ts
- **`getStaffPii`** — GET — input: `{ organization_id, staff_id }` — gate: `requireOrgMembership` + RPC `can_view_staff_pii`; returns `ssn_last4, date_of_birth, home_address, pay_rate`
- **`listStaffPii`** — GET — gate: same
- **`getStaffChecklist`** — GET — gate: `requireOrgMembership` + `can_view_staff_pii`
- **`upsertChecklistCompletion`** — POST — gate: `requireOrgMembership`
- **`updateStaffPii`** — POST — input includes `ssn_last4, date_of_birth, home_address` — gate: `requireOrgMembership` + `can_view_staff_pii`
- **`listHrDocuments`** — GET — gate: `requireOrgMembership`
- **`createHrDocumentUploadUrl`** — POST — gate: `requireOrgMembership` (role not shown in grep)

### lifecycle.functions.ts
- **`archiveEntity`** — POST — input: `{ table, id, orgId }` — soft-archives any entity — gate: `requireSupabaseAuth` ⚠️ no org-membership check confirmed
- **`deleteEntity`** — POST — hard-deletes entity — gate: `requireSupabaseAuth` ⚠️ unguarded delete

### login.functions.ts
- Login helpers — gate: `requireSupabaseAuth` or public (unauthenticated)

### medications.functions.ts
- **`parseMedicationsAI`** — POST — input: `{ text }` — AI parses medication list from free text — gate: `requireSupabaseAuth` only ⚠️

### nectar-approvals.functions.ts / nectar-document-actions.functions.ts / nectar-documents.functions.ts
- NECTAR document ingestion, approval workflow, action dispatch — gates vary; org-membership checked on most write paths

### nectar-engine.functions.ts
- **`proposeRequirementMappings`** — POST — gate: `requireOrgMembership(..., "manager")`
- **`setRequirementMapping`** / **`deleteRequirementMapping`** — POST — gate: `requireOrgMembership(..., "manager")`
- **`listRequirementMappings`** / **`getApplicableRequirements`** / **`getBillingReadinessForCode`** / **`listEngineGapsAsTasks`** — POST — gate: `requireSupabaseAuth` ⚠️ no org-membership check
- **`prefillRequirementMappings`** / **`confirmRequirementWithScopes`** — POST — gate: `requireOrgMembership(..., "manager")`
- **`listAuthorizedCodes`** — POST — gate: `requireSupabaseAuth` ⚠️
- **`upsertAuthorizedCode`** — POST — gate: `requireOrgMembership(..., "manager")`

### nectar-guide.functions.ts / nectar-help.functions.ts / nectar-reports.functions.ts / nectar-staff.functions.ts
- NECTAR guided-mode, help, saved reports, staff Q&A — `nectar-staff.functions.ts` `askNectarStaff` gates with `requireOrgMembership(..., "employee")`

### pdf-import.functions.ts
- PDF upload/ingest — gate: `requireOrgMembership(..., "manager")`

### provider-ledger.functions.ts
- **`listLedgerEntries`** / **`createLedgerEntry`** / **`updateLedgerEntry`** / **`deleteLedgerEntry`** — POST — gate: `requireOrgMembership(..., "admin")`

### saved-reports.functions.ts / state-*.functions.ts / internal-audit.functions.ts / external-compliance.functions.ts
- State onboarding, state templates, structural gaps, internal audit — gates vary per function

### team-access.functions.ts
- **`listTeamAccess`** — GET — gate: `requireSupabaseAuth` ⚠️ no explicit org check
- **`setMemberGrants`** — POST — gate: `requireSupabaseAuth` ⚠️
- **`inviteTeamMember`** — POST — gate: `requireSupabaseAuth` ⚠️

### vector-search.functions.ts
- Semantic search over org documents — gate: `requireOrgMembership(..., "employee")`

### ⚠️ Functions flagged as lacking org-membership checks or performing unguarded writes
- `evaluateShiftNote`, `draftShiftNote`, `draftVarianceJustification`, `answerProceduralQuestion`, `scanNoteForTriggers` — AI coach fns; auth-only; no org gate (all purely read/generate, no DB write)
- `parseAndProduceAuditPacket` — **writes** audit_packets rows with no org-membership verification
- `bulkImportRoster` — **writes** staff/client rows with no org-membership verification
- `createEmployeeManually`, `adminResetEmployeePassword` — no org gate confirmed
- `archiveEntity`, `deleteEntity` — `lifecycle.functions.ts` performs destructive writes with only `requireSupabaseAuth`
- `listSharesForPacket`, `listActiveSharesForOrg` — read-only but unguarded
- `listRequirements`, `listAuthoritativeSources`, `listAttestations`, `explainRequirement` — read-only but unguarded
- `listBillingReadinessForCode`, `listEngineGapsAsTasks`, `listAuthorizedCodes` — read-only but unguarded
- `listTeamAccess`, `setMemberGrants`, `inviteTeamMember` — `team-access.functions.ts` performs writes with only `requireSupabaseAuth`

---

## 5. Database

All migrations are in `supabase/migrations/` (60 files, `20260521…` through `20260603…`).

### Tables

#### Core identity & org
- **`profiles`** — `id` (FK auth.users), `email`, `full_name`, `agency_name`, `tenant_id`, `system_role`, `evv_gps_consent_status` — PII: email, full_name — RLS: SELECT/UPDATE/INSERT scoped to `auth.uid() = id`
- **`organizations`** — `id`, `name`, `slug`, `logo_url`, `created_by` — RLS: members read (`is_org_member`); admins update/delete; auth insert
- **`organization_members`** — `id`, `organization_id`, `user_id`, `role` (app_role enum: admin/manager/employee), `job_title`, `manager_id`, `active` — RLS: members read; admins manage all; self-insert
- **`invitations`** — `organization_id`, `email`, `role`, `token`, `status`, `expires_at` — RLS: admins manage; invitee reads own by email

#### Training / LMS
- **`training_modules`** (legacy seed table) — `title`, `description`, `duration_minutes`, `progress`, `category` — RLS: any authenticated can read
- **`staff_certifications`** (legacy seed table) — `staff_name`, `role`, `certification`, `issued_date`, `expiration_date`, `status` — RLS: any authenticated can read (no org scoping ⚠️)
- **`courses`** — `organization_id`, `title`, `category`, `duration_minutes`, `certificate_validity_months`, `is_published`, `is_global` — RLS: members/globals read; managers write
- **`course_modules`** — FK courses — RLS: read via course; managers write
- **`lessons`** — FK course_modules — RLS: read via course; managers write
- **`course_assignments`** — `course_id`, `user_id`, `organization_id`, `due_date`, `status`, `progress` — RLS: user reads own or managers; managers assign/delete
- **`module_progress`** / **`lesson_progress`** — per-user completion — RLS: user reads/writes own
- **`lesson_quiz_attempts`** — quiz scores — RLS: user reads/writes own
- **`certifications`** — `user_id`, `course_id`, `verification_code`, `recipient_name`, `expires_at` — RLS: **public (anon+auth)** can read ⚠️ (for public certificate verification)
- **`training_programs`** / **`program_courses`** / **`program_assignments`** / **`program_acknowledgements`** — training program grouping — RLS: members read; managers write
- **`training_tracks`** / **`track_programs`** / **`track_assignments`** — learning path assignments
- **`certification_types`** / **`external_certifications`** — external cert tracking — RLS: org-scoped
- **`user_training_progress`** — aggregate training progress

#### Clients & shifts
- **`clients`** — `organization_id`, `first_name`, `last_name`, `phone_number` (PHI), `physical_address` (PHI), `medicaid_id` (PHI), `date_of_birth` (PHI), `emergency_contact_name`, `emergency_contact_phone` (PHI), `pcsp_goals`, `authorized_dspd_codes`, `diagnosis` (PHI), `geofence_radius_feet`, `feature_config` JSONB — RLS: members read; managers write
- **`shifts`** — `organization_id`, `user_id`, `client_id`, `clock_in_time`, `clock_out_time`, `clock_in_lat/long`, `clock_out_lat/long`, `outside_geofence`, `device_fingerprint`, `status` — RLS: user reads own or managers; user inserts own; managers delete
- **`shift_notes`** — `shift_id`, `user_id`, `narrative_summary` (PHI), `goals_addressed[]` — RLS: read via shift; user inserts own
- **`daily_logs`** — EVV daily logs with `ai_compliance_status`, `denial_reason`, `word_count`, `submitted_late`, `ai_trigger_reasons[]`
- **`evv_timesheets`** — `staff_id`, `client_id`, `status`, `denial_reason`, `denied_by`, `submitted_late`, `ai_trigger_reasons[]`
- **`scheduled_shifts`** / **`staff_assignments`** — scheduling tables
- **`shift_completeness_flags`** — flags for incomplete shift data
- **`submitted_forms`** — generic form submissions
- **`staff_nudges`** — compliance nudge records
- **`compliance_overrides`** — manager overrides on compliance flags

#### Staff HR / PII
- **`hr_documents`** — `organization_id`, `staff_id`, `requirement_id`, `file_path`, `file_name`, `expires_at` — RLS: `can_view_staff_pii` RPC gates all access
- **`hr_document_access_log`** — immutable audit log of HR doc reads
- **`staff_checklist_completion`** — per-staff checklist item tracking — RLS: `can_view_staff_pii`
- **`role_permissions`** — org-level role permission overrides
- **`time_pay_categories`** / **`time_pay_settings`** — payroll category configs

Staff PII fields (stored on `organization_members` or a linked table per migration `20260603214316`):
- `ssn_last4 char(4)` (PHI) — added to staff PII table
- `date_of_birth date` (PHI)
- `home_address text` (PHI)
- `pay_rate numeric` (PHI)

#### Medications / eMAR
- **`client_medications`** — `client_id`, `organization_id`, `name` (PHI), `dosage`, `frequency`, `prescriber`, `start_date`, `end_date`, `instructions`
- **`emar_logs`** — medication administration records — PHI
- **`hhs_emar_logs`** — HHS-specific eMAR
- **`hhs_medical_logs`** — medical observations (PHI)

#### HHS group-home tables
- **`hhs_daily_records`** — daily group-home records
- **`hhs_monthly_attendance`** — monthly attendance summary
- **`hhs_monthly_summaries`** — admin monthly roll-up
- **`hhs_incident_reports`** — HHS-specific incident reports
- **`hhs_client_inventories`** — client personal inventory
- **`hhs_evacuation_drills`** — drill log
- **`hhs_transfer_logs`** — client transfer records

#### Financial / billing
- **`pba_accounts`** — Personal Bank Account trust accounts per client — `medicaid_threshold`, `balance`
- **`pba_transactions`** — PBA debit/credit records with receipt snapshots
- **`pba_audit_samples`** — audit sample selections
- **`els_usage_ledger`** — ELS unit tracking with DB-enforced daily cap (24 units) and annual day cap triggers
- **`respite_stays`** — respite service records
- **`agency_bank_accounts`** / **`agency_bank_mappings`** — agency financial accounts
- **`billing_submissions`** / **`billing_submission_audit_log`** / **`billing_submission_warnings`** — billing export records
- **`client_billing_codes`** — per-client authorized billing codes
- **`provider_authorized_codes`** — org-level authorized service codes
- **`provider_ledger_entries`** — general ledger entries (admin-only access)
- **`client_spending_log`** / **`activity_reimbursement_requests`** — client spending/activity receipts

#### Client documents & belongings
- **`client_documents`** — uploaded client files
- **`client_belongings`** — personal belongings inventory with DB trigger enforcing guardian-signature requirement for items ≥$50 (Section 11.3(5) compliance)
- **`client_approved_locations`** / **`client_approved_location_audit`** — geofence-approved locations
- **`client_intake_completion`** — per-client intake checklist completion

#### Audit & compliance
- **`audit_packets`** / **`audit_packet_items`** / **`audit_files`** / **`audit_file_documents`** — audit preparation packages
- **`auditor_shares`** / **`auditor_share_items`** / **`auditor_share_access_log`** — time-limited external auditor access
- **`incident_reports`** — full incident report with 24-hour state submission deadline enforced by DB trigger; fields: `incident_types[]`, `medical_attention_required`, `aps_notified`, `law_enforcement_called`, `staff_signature_url`, `ai_trigger_reasons[]`
- **`notifications`** — org notification inbox (admin/manager only); types: `incident_report_filed`, `timesheet_exception`, `daily_log_exception`, `open_shift_warning`

#### NECTAR / intelligence
- **`nectar_documents`** / **`nectar_document_entities`** / **`nectar_extracted_fields`** — document store with AI extraction
- **`nectar_requirements`** / **`nectar_requirement_mappings`** / **`nectar_requirement_approval_events`** — requirements engine
- **`nectar_attestations`** — staff attestation records
- **`nectar_guides`** / **`nectar_guide_tasks`** — guided-mode task lists
- **`nectar_report_runs`** / **`nectar_report_schedules`** / **`nectar_saved_reports`** — reporting engine
- **`state_derived_requirements`** / **`state_requirement_sources`** / **`state_templates`** / **`state_onboarding_sessions`** / **`state_structural_gaps`** — state compliance engine
- **`hive_base_template_versions`** — versioned base templates

#### Platform admin
- **`provider_tenants`** — `agency_name`, `owner_email`, `client_tier_limit`, `is_active`, `feature_quickbooks_sync`, `feature_pba_bank_feed`, `feature_ai_receipt_ocr`, `feature_lms_training` — RLS: super_admins manage; owner reads own
- **`system_features`** / **`tenant_features`** — feature flag catalog and per-tenant toggles
- **`org_subscriptions`** — tier/subscription records
- **`platform_states`** — platform-level state config
- **`hive_executives`** / **`hive_executive_audit_log`** — HIVE-level exec access
- **`org_support_tickets`** / **`hive_platform_tickets`** — support queue
- **`celebrations`** / **`celebration_events`** / **`celebration_acknowledgements`** / **`org_celebration_settings`** / **`user_celebration_mute`** — gamification

#### Custom fields
- **`custom_field_definitions`** / **`custom_field_values`** — org-defined extra fields on any entity

### RLS Summary by sensitive table
| Table | Key policies |
|---|---|
| `profiles` | SELECT/UPDATE/INSERT: `auth.uid() = id` only |
| `organizations` | SELECT: `is_org_member`; UPDATE/DELETE: `is_org_admin`; INSERT: `created_by = uid` |
| `organization_members` | SELECT: `is_org_member`; ALL: admins; INSERT: self |
| `clients` | SELECT: `is_org_member` or super_admin; ALL: `is_org_admin_or_manager` |
| `client_medications` / `emar_logs` | SELECT: `is_org_member`; write: managers |
| `hr_documents` / `staff_checklist_completion` | ALL operations: `can_view_staff_pii` RPC |
| `incident_reports` | SELECT: org members; INSERT: self + org member; UPDATE: self or managers |
| `certifications` | SELECT: **public (anon)** — intentional for certificate verification |
| `staff_certifications` (legacy) | SELECT: any authenticated — **no org scoping** ⚠️ |
| `training_modules` (legacy) | SELECT: any authenticated — **no org scoping** ⚠️ |
| `provider_tenants` | ALL: super_admins; SELECT: owner email match |
| `tenant_features` | ALL: super_admins; SELECT: owner via provider_tenants join |
| `pba_accounts` / `pba_transactions` | org-scoped, managers |
| `auditor_shares` | org-scoped via assertAdmin server-side |

### SECURITY DEFINER Functions
(`src`: `supabase/migrations/`)

| Function | Args | Purpose |
|---|---|---|
| `handle_new_user()` | trigger | Auto-creates profile + org + admin member on auth signup |
| `issue_certificate_on_completion()` | trigger | Auto-issues certification row when course_assignment → completed |
| `is_org_member(_org, _user)` | uuid, uuid | RLS helper — checks active org membership |
| `has_org_role(_org, _user, _role)` | uuid, uuid, app_role | RLS helper — checks specific role |
| `is_org_admin_or_manager(_org, _user)` | uuid, uuid | RLS helper — admin or manager check |
| `user_org_ids(_user)` | uuid | Returns set of org UUIDs for a user |
| `is_super_admin(_user)` | uuid | Checks `profiles.system_role = 'super_admin'` |
| `is_hive_executive(_user)` | uuid | Checks hive_executives table |
| `is_company_executive(_org, _user)` | uuid, uuid | Checks company executive role |
| `can_view_staff_pii(_org, _staff, _viewer)` | uuid×3 | Gates HR PII access; checks org role and team grants |
| `can_view_client_intake(_org, _client, _viewer)` | uuid×3 | Gates client intake checklist access |
| `get_staff_pii(_org, _staff)` | uuid, uuid | Returns PII row if `can_view_staff_pii` passes |
| `list_staff_pii(_org)` | uuid | Returns filtered PII list |
| `get_hr_client_intake_base(_org, _client)` | uuid, uuid | Returns intake checklist base |
| `get_hr_staff_checklist_base(_org, _staff)` | uuid, uuid | Returns staff checklist base |
| `accept_invitation(token)` | text | Consumes invite token, inserts org_member |
| `restore_my_admin_role(_org)` | uuid | Allows org creator to restore admin role |
| `set_company_executive` / `set_hive_executive` | — | Elevates user to exec role |
| `generate_pba_audit_sample(_org, _period)` | — | Randomly selects PBA audit sample |
| `clients_for_staff(_org, _staff)` | uuid, uuid | Returns clients assigned to a staff member |
| `recalc_assignment_progress` | trigger | Recalculates course assignment progress % |
| `hr_document_access_log_immutable` | trigger | Blocks UPDATE/DELETE on hr_document_access_log |
| `log_approved_location_change` | trigger | Audit-logs changes to client_approved_locations |
| `notify_incident_filed(...)` | — | Inserts critical notification on incident creation |
| `set_incident_state_deadline` | trigger | Sets state_submission_deadline = submitted_at + 24h |
| `touch_updated_at` | trigger | Generic updated_at updater |

### Storage Buckets

| Bucket | Public | Access rules |
|---|---|---|
| `certificates` | false | User reads/writes/deletes own folder (`uid = foldername[1]`); managers can read org certs |
| `training-assets` | false | Any authenticated can read; any authenticated can upload/update/delete ⚠️ (no org scope) |
| `client_receipt_snapshots` | false | Org-scoped read/write via RLS |
| `client-documents` | false | Org-scoped; members read; managers write/delete |
| `client-photos` | false | Org-scoped; members read; managers write/delete |
| `audit-documents` | false | Org-scoped; members read; managers write/delete |
| `activity-receipts` | false | Org-scoped |
| `client-spending-receipts` | false | Org-scoped |
| `nectar-documents` | false | Org-scoped; members read; managers write |
| `hr-documents` | false | `can_view_staff_pii` RPC gates read; managers write |

---

## 6. NECTAR Capability Registry

Source: `src/lib/nectar-capability-registry.ts`

Detected document types: `staff_checklist`, `scope_of_work`, `insurance_certificate`, `training_certificate`, `policy_document`, `client_intake`, `unknown`

### Live Actions (`is_live: true`)

- **`add_to_authoritative_sources`** — label: "Add this to your authoritative sources" — `applies_to_types`: ALL types — handler: `add_to_authoritative_sources` — marks document as authoritative source for HIVE requirements engine
- **`propose_staff_checklist`** — label: "Draft a trackable checklist from this for your review" — `applies_to_types`: `staff_checklist`, `scope_of_work` — handler: `propose_staff_checklist_from_document` — AI extracts items as pending checklist entries
- **`per_staff_tracking`** — label: "Open per-staff tracking for items in this checklist" — `applies_to_types`: `staff_checklist` — handler: `noop` (UI-only, opens HR Admin tab)
- **`renewal_alerts`** — label: "Set renewal reminders for dates found in this document" — `applies_to_types`: `insurance_certificate`, `training_certificate`, `staff_checklist` — handler: `noop`
- **`client_intake_checklist`** — label: "Open per-client intake tracking for items in this document" — `applies_to_types`: `client_intake`, `scope_of_work` — handler: `noop` — **note: marked `is_live: true` in code but comment says "DORMANT"** ⚠️ inconsistency

### Dormant Actions (`is_live: false`)

- **`sow_requirement_mapping`** — label: "Map SOW clauses to platform requirements" — `applies_to_types`: `scope_of_work` — handler: `noop` — not shown in menu until `is_live` flips

### Guardrail
`liveActionsForType(type)` at `nectar-capability-registry.ts` (bottom of file) filters to `is_live && applies_to_types.includes(type)`. All offer UI must use this filter — no ad-hoc capability buttons permitted per file comment.

---

## 7. Feature Gates & Toggles

### 7a. `tenant_features` keys (org-level on/off per tenant)

Defined as seed data in `supabase/migrations/20260525030431`:

| feature_key | category | ENFORCED / DECORATIVE |
|---|---|---|
| `overview` | Core | **ENFORCED** — `routeToFeatureKey("/dashboard")` returns `"overview"`; `useDisabledFeatures()` checked at route level (`src/hooks/use-tenant-features.tsx`) |
| `time_clock` | Workforce | **DECORATIVE** — seeded but not in `routeToFeatureKey` map, no read-site found |
| `daily_notes` | Documentation | **ENFORCED** — `routeToFeatureKey("/dashboard/daily-logs")` |
| `scheduler` | Workforce | **DECORATIVE** — seeded, not in route map |
| `submissions` | Documentation | **DECORATIVE** — seeded, not in route map |
| `audit_portal` | Compliance | **DECORATIVE** — seeded, not in route map |
| `dspd_controls` | Compliance | **ENFORCED** — `routeToFeatureKey("/dashboard/dspd-controls")` |
| `emar_pass` | Clinical | **ENFORCED** — `routeToFeatureKey("/dashboard/emar")` |
| `emar_audit` | Compliance | **ENFORCED** — `routeToFeatureKey("/dashboard/admin/emar-audit")` |
| `pba_trust_ledger` | Financial | **ENFORCED** — `routeToFeatureKey("/dashboard/pba-ledger")` |
| `employees` | Roster | **ENFORCED** — `routeToFeatureKey("/dashboard/employees")` |
| `clients` | Roster | **ENFORCED** — `routeToFeatureKey("/dashboard/clients")` |
| `teams_homes` | Roster | **ENFORCED** — `routeToFeatureKey("/dashboard/teams")` |
| `ai_assistance` | Intelligence | **DECORATIVE** — seeded, not in `routeToFeatureKey` |

Gate mechanism: `useDisabledFeatures()` hook (`src/hooks/use-tenant-features.tsx`) queries `tenant_features` where `is_enabled = false` and returns a `Set<FeatureKey>`. The caller (route guard) checks membership. Enforcement is client-side only — no server-fn checks `tenant_features`. ⚠️

### 7b. `provider_tenants` boolean feature columns

Stored in `provider_tenants` table (`supabase/migrations/20260524065945`):

| Column | ENFORCED / DECORATIVE |
|---|---|
| `feature_quickbooks_sync` | **DECORATIVE** — column exists, no read-site found in `src/` |
| `feature_pba_bank_feed` | **DECORATIVE** — column exists, no read-site found |
| `feature_ai_receipt_ocr` | **DECORATIVE** — column exists, no read-site found |
| `feature_lms_training` | **DECORATIVE** — column exists, no read-site found |

### 7c. Hive-tier add-ons (`src/lib/hive-tiers.ts`)

| AddonId | Tiers included | ENFORCED / DECORATIVE |
|---|---|---|
| `nectar_infusion` | pro, enterprise, custom | **PARTIALLY ENFORCED** — `getMyEntitlements` reads addon list; `src/lib/entitlements.server.ts` exports addon checks; UI conditionally renders NECTAR features |
| `internal_audit` | enterprise, custom | **PARTIALLY ENFORCED** — entitlements read, used to gate Internal Audit UI |
| `requirements_engine` | enterprise, custom | **PARTIALLY ENFORCED** — entitlements read, used to gate Requirements Engine |
| `priority_support` | enterprise, custom | **DECORATIVE** — stored, no enforcement code found |

Tier assignment is read from `org_subscriptions` table via `getMyEntitlements` (`src/lib/entitlements.functions.ts`). Payment collection is described in `hive-tiers.ts` comments as "skeletoned."

### 7d. Per-client `feature_config` JSONB flags (`src/lib/client-features.ts`)

| ClientFeatureKey | Tier counterpart | ENFORCED / DECORATIVE |
|---|---|---|
| `daily_notes` | `daily_notes` | **ENFORCED** — `isClientFeatureEnabled()` checks tier first, then `client.feature_config`; used in `src/routes/dashboard.hhs-hub.$clientId.tsx` and `src/hooks/use-caseload.tsx` |
| `emar` | `emar_pass` | **ENFORCED** — same mechanism |
| `trust_ledger` | `pba_trust_ledger` | **ENFORCED** — same mechanism |
| `attendance` | none | **ENFORCED** — checked via `isClientFeatureEnabled()` with no tier gate |
| `incident_forms` | none | **ENFORCED** — same |
| `scheduling` | none | **ENFORCED** — same |

Default is ON when `feature_config` is null or key absent. Toggle UI is in `src/routes/dashboard.clients.tsx` (FEATURE_TOGGLES array), writing `client.feature_config` via direct Supabase `.update()`.

---

## 8. Integrations

### From `package.json` dependencies
- **Supabase** (`@supabase/supabase-js`) — primary database, auth, storage, realtime
- **TanStack Router + Start** — SSR framework, server functions transport
- **TanStack React Query** — client-side data fetching/caching
- **Radix UI** (full suite) — headless component primitives
- **Recharts** — data visualization / charts
- **React Hook Form** + `@hookform/resolvers` + `zod` — form validation
- **React Leaflet** + `leaflet` — map/geofence visualization
- **date-fns** — date manipulation
- **papaparse** — CSV parsing (bulk import)
- **xlsx** — Excel file parsing/export
- **unpdf** — PDF text extraction (client-side)
- **react-markdown** + `remark-gfm` — markdown rendering
- **embla-carousel-react** — carousel UI
- **input-otp** — OTP input
- **vaul** — drawer UI
- **sonner** — toast notifications
- **cmdk** — command palette
- **@lovable.dev/cloud-auth-js** — Lovable platform auth integration
- **@cloudflare/vite-plugin** — Cloudflare Workers deployment target
- **nitro** — server runtime
- **Tailwind CSS** v4 + `tw-animate-css` — styling

### From `src/integrations/`
- `src/integrations/supabase/` — Supabase client, auth middleware (`requireSupabaseAuth`), org guard (`requireOrgMembership`), generated types

### From `.lovable/project.json`
- Template: `tanstack_start_ts_2026-05-12` — schemaVersion 1

### External AI service
- AI coach, requirement extraction, note evaluation, and document parsing all call an LLM via `fetch` POST (internal API route, not a named SDK) — inferred from `ai-coach.functions.ts` pattern with `method: "POST"` fetch blocks; provider not named in source

### No evidence found for
- Stripe / payment processor (tiers described as "skeletoned" in `hive-tiers.ts`)
- QuickBooks API client (column `feature_quickbooks_sync` exists but no SDK or API call found)
- Twilio / SMS
- SendGrid / email provider SDK (invitations use Supabase Auth email)
- Plaid / bank feed (column `feature_pba_bank_feed` exists but no SDK found)

---

## Gaps / Not Found

### Missing routes for existing DB tables
- **`billing_submissions`** / **`billing_submission_audit_log`** — tables exist, no dedicated billing-submission review route found
- **`state_structural_gaps`** / **`state_derived_requirements`** / **`state_requirement_sources`** — tables and server fns exist, no standalone route identified
- **`nectar_guides`** / **`nectar_guide_tasks`** — tables and guide fns exist; no `/dashboard/nectar-guide` route found in inventory
- **`notifications`** — table exists, notification center UI not found as a dedicated route
- **`org_support_tickets`** / **`hive_platform_tickets`** — support ticket tables exist; no customer-facing ticket detail route found

### Missing CRUD for existing tables
- **`training_tracks`** / **`track_programs`** / **`track_assignments`** — tables seeded, no UI route for track management
- **`certification_types`** — table exists, no admin UI for managing cert types
- **`time_pay_categories`** / **`time_pay_settings`** — payroll config tables, no route found
- **`scheduled_shifts`** — table exists; scheduler feature key exists in `system_features` but `routeToFeatureKey` has no scheduler mapping (DECORATIVE)
- **`program_acknowledgements`** — table exists, no acknowledgement UI route found

### Dormant NECTAR registry actions with no backing flow
- **`sow_requirement_mapping`** (`is_live: false`) — SOW clause → requirement mapping has no UI
- **`client_intake_checklist`** — marked `is_live: true` in registry but handler is `noop` and comment says dormant ⚠️

### Unimplemented integrations (columns/flags with no code)
- `provider_tenants.feature_quickbooks_sync` — no QuickBooks client or route
- `provider_tenants.feature_pba_bank_feed` — no bank feed client
- `provider_tenants.feature_ai_receipt_ocr` — no OCR pipeline found (AI receipt parsing uses `billing-budget-parse.functions.ts` which is PDF-based, not camera OCR)
- `provider_tenants.feature_lms_training` — separate LMS flag, but LMS tables/routes already exist unconditionally
- Payment collection for HIVE tiers — `hive-tiers.ts` explicitly notes payment is "skeletoned"

### Security observations
- `staff_certifications` and `training_modules` (first migration, legacy seed tables) have RLS `FOR SELECT TO authenticated USING (true)` — **no org scoping**, any authenticated user can read all rows across all orgs
- `training-assets` storage bucket allows any authenticated user to upload/update/delete — no org-level restriction
- Several server fns (`bulkImportRoster`, `parseAndProduceAuditPacket`, `archiveEntity`, `deleteEntity`, `team-access` writes) perform DB writes with only `requireSupabaseAuth` and no `requireOrgMembership` — rely solely on RLS for isolation
- Tenant feature gates are enforced **client-side only** — no server function checks `tenant_features`; a direct API call bypasses all feature gates
- `certifications` table RLS allows `anon` SELECT — intentional (public cert verification) but means all issued cert records are publicly readable by UUID
