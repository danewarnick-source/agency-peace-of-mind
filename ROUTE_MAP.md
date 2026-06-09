# Route Map — every clickable control and where it goes

Companion to `LAUNCH_READINESS_AUDIT.md`. This lists buttons, nav items, links, cards, and tabs with their destination, so a non-technical reader can eyeball mismatches.

**"Match?"** = does the destination fit what the control's label/count/section promises?
- **Yes** = goes where you'd expect.
- **No** = wrong, broken, or missing destination (see the linked finding).
- **Unsure** = destination depends on data/role or a file outside the audited scope; worth a manual check.

Where a control implies a **filtered** view (e.g., a count like "3 need review"), the **Note** column says whether the destination actually filters or just dumps you on a generic page.

> Derived from static code analysis. Every static navigation target resolves to a real route **except** the "HIVE Subscription" billing tab. Destinations marked "redirect → X" pass through an intermediate route.

---

## Auth & Role landing

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Login | Sign in (submit) | `/dashboard` or `/dashboard/hive-exec` (exec) | Yes | Landing chosen by post-auth effect |
| Login | Continue with Google | `/dashboard` (hardcoded) | Yes | Bypasses exec landing (A-6) |
| Login | Forgot? | `/forgot-password` | Yes | |
| Login | Start a free trial | `/signup` | Yes | |
| Login | ← Back to site · {path} | `/` | Yes | Footer leaks current path (A-5) |
| Signup | Create account / Accept invitation | `/dashboard` | Unsure | Bounces to `/login` if email-confirm pending (A-4) |
| Forgot password | Send reset link | sends email, stays | Yes | |
| Reset password | Update password | `/dashboard` | Yes | |
| Unauthorized | Back to your dashboard | `/dashboard` | Yes | |
| Fix-admin | Restore My Admin Access | RPC → `/dashboard` | Unsure | Route ungated (A-3 / L-7) |
| `/admin` `/manager` `/employee` `/super-admin` | (auto) | redirect to role home | Yes | Vestigial; redirect-only (A-7) |
| Auditor portal | Send sign-in link / Sign out | OTP email / `/auditor` | Yes | |
| Certificate | Download / Print PDF | `window.print()` | Yes | |

## Home — Company Admin

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Admin Home | Audit readiness KPI | `/dashboard/records-desk` → Documentation/Review | Yes | Generic — no readiness filter (H-4) |
| Admin Home | EVV match KPI | `/dashboard/timeclock` | Yes | |
| Admin Home | Documentation KPI | `/dashboard/daily-logs` | Yes | |
| Admin Home | Credentials current KPI | `/dashboard/certifications` | Yes | |
| Admin Home | Overall compliance KPI | `/dashboard/records-desk` → Documentation/Review | Yes | Generic |
| Admin Home | Staff credentials expiring | `/dashboard/certifications` | Unsure | No "expiring" filter applied |
| Admin Home | **Incident reports pending review** | `/dashboard/records-desk` → Docs/Review | **No** | Should be Command Center → Urgent (H-2) |
| Admin Home | Authoritative requirements needing review | `/dashboard/authoritative-sources` | Yes | |
| Admin Home | Reimbursements / Billing warnings / Claims / Off-pace | `/dashboard/billing` | Yes | Generic — no sub-filter (H-4) |
| Admin Home | Notes awaiting signature | `/dashboard/records-desk` → Docs/Review | Yes | Generic — no signature filter (H-4) |
| Admin Home | Published shifts not accepted | `/dashboard/scheduling` | Yes | |
| Admin Home | Auditor shares expiring | `/dashboard/audit` | Yes | |
| Admin Home | Billing & payroll snapshot cards | `/dashboard/billing`, `/dashboard/timeclock` | Yes | |

## Home — Staff (DSP) & Behaviorist

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Staff Home | Caseload client card | `/dashboard/workspace/$clientId` | Unsure | Verify in `staff-client-grid.tsx` |
| Staff Home | "Fix Now" (rejected log / open shift) | `/dashboard/daily-logs`, `/dashboard/timeclock` | Yes | Generic, not row-filtered |
| Behaviorist Home | Client card | `/dashboard/behavior-support/$clientId` | Yes | |

## Global chrome

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Site header | Home / Pricing / Contact / Sign in / Book demo | `/`, `/pricing`, `/contact`, `/login`, `/signup` | Yes | Marketing |
| NotificationBell | View Agency Command Center | `/dashboard/command-center` | Yes | Admin-only render |
| NotificationBell | CE "behind on training" | `/dashboard/records-desk?tab=training-records` → Docs/Review | **No** | No training data there (H-3) |
| NotificationBell | (generic notification) | `n.link_to` (free-form DB value) | Unsure | Malformed value could throw (L-?) |
| Impersonation banner | Exit | `/dashboard/super-admin` | Yes | |
| Sidebar | Portal View select (Staff/Admin/Mobile/Exec/State) | switches view | Yes | Defaults to Staff (H-1) |

## Scheduling

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Scheduling (admin) | Add/Edit Shift → Publish | write `scheduled_shifts` (published) | Yes | |
| Scheduling (admin) | Publish All Shifts | bulk update published=true | Yes | |
| Scheduling (admin) | Save Draft | write `scheduled_shifts` (unpublished) | Yes | |
| Scheduling (admin) | NECTAR auto-assign "create drafts" | insert draft `scheduled_shifts` | Yes | |
| Scheduling (admin) | Edit / Delete / Duplicate | update/delete `scheduled_shifts` | Yes | |
| My Schedule (staff) | Shift card tap | `/dashboard/workspace/$clientId?tab=clock-in` or hhs-hub | Yes | |
| My Schedule (staff) | Accept / Decline | (control absent) | **No** | No accept/decline exists (S-5) |
| Assignments (admin) | Save caseload | write `staff_assignments` | Yes | |
| Teams (admin) | Create / Reassign | write `teams` / `profiles`,`clients` | Yes | |

## Documentation / EVV

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Client Workspace (staff) | Clock In | insert `evv_timesheets` | Yes | Relies on DB default for timestamp (S-1) |
| Client Workspace (staff) | Clock Out / End Shift | update `evv_timesheets` | Yes | |
| General Time Clock (staff) | Clock In · {category} | **localStorage only** | **No** | No server write (S-2) |
| General Time Clock (staff) | End {category} Shift | localStorage log only | **No** | (S-2) |
| Active Shift Bar | Clock out → | clock-out flow | Yes | |
| Daily Logs (staff) | Save daily log | insert `daily_logs` | Yes | |
| Daily Logs (admin) | Approve / Return | update `daily_logs` | Yes | |
| Daily Logs (incident) | File Critical Event Report Now | `/dashboard/hhs-hub/$clientId` (hard reload) | Yes | Full reload, not SPA (CL-2) |
| eMAR | Record eMAR pass | insert `emar_logs` | Yes | |
| HHS Hub (daily) | Save daily / attendance / PRN / incident | `daily_logs` / `hhs_monthly_attendance` (server fns) | Partial | Readers expect dead `hhs_daily_records` (D-1) |
| Compliance Desk | Approve / Ask NECTAR / Export CSV | update `evv_timesheets` / vector search | Yes | |
| Pay Period card (staff) | (auto) | `evv_timesheets` + `hhs_daily_records`(dead) + localStorage(dead) | Partial | Daily + general time drop (D-1, S-2) |

## Reports

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Reports page | (reaching it at all) | `/dashboard/reports` | **No** | Not linked from anywhere (R-1) |
| Reports | Standard / Behavior Supports tabs | in-page tabs | Yes | |
| Reports | Download CSV (×4) | client-side CSV | **No** | All export same dataset, mislabeled (R-2) |
| Behavior Supports | Export CSV / PDF | real packet from live queries | Yes | |

## Finances / Billing

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Billing layout | Overview / NECTAR / 520 Form / Imports | nested billing routes | Yes | |
| Billing layout | **HIVE Subscription** | `/dashboard/billing/subscription` | **No** | Route doesn't exist — 404 (F-1) |
| Billing Overview | Open (per client) | `/dashboard/billing/$clientId` | Yes | |
| `/dashboard/billing-520` | (auto) | redirect → `/dashboard/billing/form520` | Yes | |
| 520 Form | Copy / CSV / PDF / Excel | clipboard / blob / print / xlsx | Yes | "Remaining units" math off (D-2) |
| Financial layout | Revenue tab | `/dashboard/financial/revenue` | Yes | |
| Financial layout | Profitability / Cash Flow | disabled "Soon" | Yes | Intentional stub (D-5) |
| `/dashboard/financial` | (index) | redirect → `/financial/revenue` | Yes | |
| Revenue | Import or attest payments | `/dashboard/billing/imports` | Yes | |
| Revenue | Learn about NECTAR | `/pricing` | Yes | |
| NECTAR Billing | Ask NECTAR / Save / Schedule / Export | LLM + `nectar_saved_reports`/schedules | Yes | Scheduler worker unconfirmed (L-4) |
| Readiness bar | Run billing · 520 | `/dashboard/billing/form520` | Yes | |
| Readiness bar issue | Open | `/dashboard/timeclock`, `/dashboard/hhs-hub/$clientId`, `/dashboard/records-desk` | Unsure | Targets out of one scope; verify |
| PBA Trust Ledger | Receipt upload (real) + Mock Receipt Deck | edge fn / fake `setTimeout` | Yes | Mock deck ships to prod (D-3) |
| Finances hub | Billing / Financial cards | `/dashboard/billing`, `/dashboard/financial` | Yes | |

## Clients

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Client Directory | Add New Client | insert `clients` | Yes | Geocode can stall submit (CL-1) |
| Client Workspace | Save Profile | update `clients` | Yes | |
| Client Workspace | Archive / Delete | `archiveEntity` / `deleteEntity` | Yes | |
| Client Workspace | Upload/Delete photo | storage + update `clients` | Yes | |
| Client Workspace → Care | Open Teams/Billing/Behavior/HRC/PBA/Loans | matching routes | Yes | All exist |
| Care → Medications | Add/Edit/Discontinue medication | insert/update `client_medications` | Yes | Unused AI importer dialog (DOC-1) |

## Employees

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Team members | Add manually | create auth + `profiles` + membership | Yes | |
| Team members | Edit / Disable | update `profiles` + membership | Yes | |
| Team members | Reset password | `auth.admin.updateUserById` | Yes | |
| Team members | Manage Caseload | insert/delete `staff_assignments` | Yes | |
| Roster | Name link | `/dashboard/employees/$staffId` | Yes | |
| Invitations | Create / Resend / Revoke | insert/update `invitations` | Yes | No email sent (SET-2) |

## Smart Import

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| NECTAR Bulk Import (CSV/XLSX) | Finalize | write clients/profiles/members/teams/fields | Yes | |
| AI PCSP Importer | Confirm & save (commit) | write clients + billing codes + meds + doc + fields | Yes | Temp storage path not re-keyed (SI-1) |
| Company Docs | Upload / review field / delete | server fns ingest/review/delete | Yes | |

## Settings

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Settings | Save profile / Save organization | update `profiles` / `organizations` | Yes | |
| Settings | Team access card | `/dashboard/settings/team-access` | Yes | |
| Settings | Institutional Client Banking Registry | `/dashboard/settings/bank-mapping` | Yes | Mock Plaid/SSI data (SET-1) |
| Team Access | Role checkboxes / Send invite | `setMemberGrants` / `inviteTeamMember` | Yes / **No** | Writes role; sends no email (SET-2) |
| Roles | Change role | update `organization_members` | Yes | Page is URL-only (X-1) |
| Permissions | Toggle + Save | upsert `role_permissions` | Yes | Page is URL-only (X-1) |
| Teams | Create / drag-drop / quick-add | `teams` insert + `team_id` updates | Yes | |
| HR Admin | HR Settings → / Open HR → | `/dashboard/hr-admin/settings` / `/employees/$staffId` | Yes | |

## Training / Courses

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| My Trainings | Core / Person / Other / CE cards | `/courses/core` `/person` `/other` `/ce` | Yes | "22 topics" hardcoded (TR-1) |
| Core Topic | Sign & Complete | insert `training_completions` + progress | Yes | |
| Other Trainings | Start / Mark complete | `updateMyAssignmentStatus` | Yes | |
| CE | Start this month's review | `ensureCurrentCeModule` (demo-gated) | Yes | |
| Course player | Mark complete / quiz / Edit content | `lesson_progress` / quiz / `/courses/$id/edit` | Yes | |
| Course editor | Add/Edit/Delete module & lesson, upload | `course_modules`/`lessons` CRUD + storage | Yes | |
| Course Library | Assign Compliance Track | insert `user_training_progress` | Yes | |
| Tracks | Track card | `/dashboard/tracks/$trackSlug` | Yes | |
| Programs | Enroll / Start / View | `program_assignments` / `/programs/$programId` | Yes | |
| Programs Admin | New program / add course / Acknowledge | `training_programs`/`program_courses` CRUD | Yes | Page is URL-only (X-1) |

## Forms

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Forms (admin) | New form / Edit / Submissions / Archive | `saveForm` / edit / submissions / `archiveForm` | Yes | |
| Forms (staff) | **Complete form** | `/dashboard/forms/$formId/fill` (no clientId) | **No** | Dead-ends — missing required client (B-1) |
| Form builder | Save / Publish / Build with Nectar / Assign | `saveForm` / `publishForm` / `nectarDraftForm` | Yes | |
| Form fill | Submit | `submitForm` | Yes | |
| Submissions | Export CSV / Print | client-side CSV / print | Yes | |
| Client Workspace → Forms tab | Complete form | `/forms/$formId/fill?clientId=…` | Yes | The working path (vs B-1) |

## Certifications / Compliance / Audit

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| Certifications | Verify / PDF | `/verify/$code` / `/certificate/$code` | Yes | |
| External Certs | Upload / Approve / Reject | `external_certifications` + storage | Yes | |
| External Compliance | Attest completion / Auto-classify | `attestExternalCompletion` / `autoClassifyRequirements` | Yes | |
| Audit | New folder / Attach / Mark compiled | `parseAndProduceAuditPacket` + `audit_packet*` | Yes | |
| Internal Audit | Run audit / Export / sample | `runInternalAudit` (add-on gated) | Yes | Page is URL-only (X-1) |
| Compliance Desk | Approve / Ask NECTAR / CSV | `evv_timesheets` update / vector search | Yes | |
| Authoritative Sources | Upload / Draft requirements / confirm | ingest / generate / confirm | Yes | |
| **HRC** | Add placeholder meeting / review | inserts placeholder rows | **No** | Scaffold, not real workflow (C-1) |
| `/dashboard/admin/ce-hours` | (auto) | redirect → records-desk → hub (double) | Yes | Double redirect (C-2) |

## HIVE Executive (platform operator — not a customer role)

| Screen | Control | Where it goes | Match? | Note |
|---|---|---|---|---|
| HIVE Exec layout | Overview / Add Company / States / Approvals / Permissions / Plans / Health / Tickets / Migration / NECTAR | `/dashboard/hive-exec/*` | Yes | Double-gated to executives |
| HIVE Exec Plans | (payment) | "Payment processing — coming soon" | Yes | Intentional stub (D-5) |
