# HIVE repo cleanup audit

**Type:** Read-only. No application code, routes, queries, or behavior were changed. This file is the only deliverable.

**Date:** 2026-08-27.
**Tree:** `origin/main` at `6b3db5bc` (merge of PR **#167**). PRs **#165**, **#166**, and **#167** are all merged. There were no open PRs at audit time.

**Sep 1 context:** Tuesday 2026-09-01 agency test for True North Supports (HHS, SLN, SLH, SEI, DSI). Operational punch list lives in `GO_LIVE.md` (PR #166). This document answers a different question: **what is dead, what is dual, and what is scary-but-load-bearing** — without proposing a rewrite.

**Method:** Current `src/routes/` + `src/routeTree.gen.ts` (what the app actually mounts), `STAFF_NAV` / `ADMIN_NAV` / `EXEC_NAV`, inbound `Link`/`navigate`/`redirect` grep, and an import-graph pass over `src/` (basename never mentioned outside the file = orphaned). June docs (`LAUNCH_READINESS_AUDIT.md`, `FEATURE_INVENTORY.md`, `ROUTE_MAP.md`, `docs/platform-qa-map.md`) were treated as hypotheses and **re-checked**. Several of them are stale.

**Rule used throughout:** never recommend deleting a route file the router still mounts. A page can be unused *by testers* and still be a live URL. Redirect stubs exist specifically so old bookmarks do not 404.

---

## Verdict

The codebase is large because it accumulated **three generations of the same surfaces** (old scheduler UI, old Home, old training LMS) next to the live ones, plus a full Hive-exec platform console that TNS testers will not use. It is **not** a junk drawer of unmounted routes. Almost every `src/routes/*.tsx` file is in `routeTree.gen.ts`.

Safe cleanup after Sep 1 is **small, file-level deletions of components nothing imports**, plus optional redirect-stub hygiene. It is not a merge of Deadlines into Compliance, Compass into NECTAR, or My Trainings into HIVE Training. Those pairs are either already consolidated at the route layer, or they are different products that both still run.

Do not delete anything in the “never-touch-before-Tuesday” list. Do not drop database tables based on this file (`CLAUDE.md`: all SQL goes through `docs/SQL_HANDOFF.md`).

---

## 1. Dual implementations (named in the brief)

### 1.1 Deadlines vs Compliance — consolidated at the URL, duplicated in the data layer

| Piece | Path | Status |
|-------|------|--------|
| Deadlines **page** | `src/routes/dashboard.deadlines.tsx` | **Mounted.** `beforeLoad` redirects to `/dashboard/company-obligations?tab=action-required`. Comment in file: keep so old bookmarks do not 404. |
| Compliance register | `src/routes/dashboard.company-obligations.tsx` | **Live.** `ADMIN_NAV` “Compliance”. |
| Staff “My Compliance” | `src/routes/dashboard.my-obligations.tsx` | **Live.** `STAFF_NAV`. |
| Action Required queue | `src/hooks/use-action-required-queue.tsx` | **Live.** Sidebar badge + Compliance tab. Explicitly does **not** read `nectar_requirements`. |
| Deadlines calendar hook | `src/hooks/use-deadlines.tsx` | **Live.** Used by Admin Home (`admin-home-dashboard.tsx`), staff profile Activity tab (`dashboard.employees.$staffId.tsx`), NotificationBell. Reads company-obligation instances **plus** summaries, incident 24h clocks, HRC re-reviews. |
| `DeadlinesHomeCard` | exported from `dashboard.deadlines.tsx` | **Orphaned.** Nothing imports it. Admin Home now uses `useDeadlines` directly. |

This is **not** two competing pages anymore. Deleting `/dashboard/deadlines` would 404 old links; do not delete the route. Deleting `useDeadlines` would blank Home / bell / staff Activity. After Sep 1, the only honest small deletion here is the unused `DeadlinesHomeCard` export (or leave it; it is ~50 lines).

`nectar_requirements` / `nectar_compliance_instances` are a **third** compliance store used by Knowledge base / authoritative sources (`src/lib/authoritative-sources.functions.ts`, ~2653 lines). Action Required does not use them. Do not “simplify” by deleting that table or those functions — Knowledge is gated off for TNS (`nectar` feature default OFF) but the code is wired.

### 1.2 NECTAR vs Compass — different products, both wired

| Surface | Path | What it is | Wired? |
|---------|------|------------|--------|
| Compass (staff voice agent) | `src/components/staff-mobile/compass-voice-button.tsx`, `src/lib/cedar-voice-agent.server.ts` | Floating mic on **staff** screens. Clock-in / note expand / intent routing. Mounted from `src/routes/dashboard.tsx`. | **Yes.** PR #167: GPS required on Compass clock-in; location failure opens punch pad. Does **not** transmit UEVV. |
| Punch-pad Compass | `src/components/evv/punch-pad.tsx` (“Expand with Compass”, dictation) | In-shift note tools. Independent of the floating button (comment in `compass-voice-button.tsx`). | **Yes.** |
| Ask NECTAR (staff) | `/dashboard/ask-nectar` → `ask-nectar-staff.tsx` | Chat. `STAFF_NAV` + mobile tab. Feature `nectar` **default OFF**. | Mounted; locked unless flag on. |
| Ask NECTAR (admin) | `/dashboard/help` | Admin help + ticket escalation. `NECTAR_NAV`. | Mounted; same flag. |
| NECTAR Knowledge | `/dashboard/hub/knowledge` + standalone `/dashboard/authoritative-sources`, `/dashboard/nectar-docs`, `/dashboard/external-compliance` | Sources / company docs / external compliance. | Mounted; flag off. |
| NECTAR billing / tasks / tours | `src/components/nectar/*`, `draft-jobs-driver.tsx` | Shell chrome, not a second clock. | Mounted in dashboard layout. |

Do **not** delete Compass to “leave NECTAR,” or vice versa. Compass is how staff start a shift by voice; NECTAR is the advisory/knowledge layer (`CLAUDE.md`: Gatekeeper / Scrubber / Sentinel / Auditor — never auto-publish). They share Bedrock (`src/lib/ai-bedrock.server.ts`) and that is the only real overlap.

`GO_LIVE.md` §H-2 (Compass clock-in wrote `gps_in_bypassed`) is **stale as of PR #167**. Current Compass requires GPS or hands off to the punch pad.

### 1.3 Old training vs HIVE Training — three live stacks, not two

Testers with default flags will only see **My Trainings**. The other stacks are still mounted.

| Stack | Routes | Data | In sidebar? | Default flag |
|-------|--------|------|-------------|--------------|
| **A. My Trainings (DSPD core)** | `/dashboard/courses`, `/courses/core`, `/courses/topic/$topicId`, person / other / CE | `training_topics`, `training_topic_progress`. Player: `src/components/training/hive-training-engine.tsx` (~2103 lines) despite the filename. | Staff: “My Trainings”. Mobile: “Trainings”. Feature `staff_onboarding` **ON**. | This is the Sep 1 staff path. |
| **B. HIVE Training (paid catalog)** | `/dashboard/hive-training`, `/hive-training/course/$assignmentId`, public `/training` | `hive_training_catalog`, Stripe edge fns `create-training-checkout`, `training-stripe-webhook`. | Staff + admin “HIVE Training”. Feature + addon `hive_training` **OFF**. | Skip for Sep 1 unless TNS paid for it. |
| **C. Training Catalog (admin seats)** | `/dashboard/training/catalog` | `src/lib/training-enrollments.functions.ts` | Admin nav, same `hive_training` flag. | Skip. |
| **D. Legacy module library** | `/dashboard/training/`, `/dashboard/training/$id` | `training_modules` query in `dashboard.training.index.tsx`. Certifications page still links “Go to My Training” → `/dashboard/training`. | **Not** in `ADMIN_NAV` / `STAFF_NAV`. | URL-reachable. Do not delete the route. |
| **E. Old LMS programs/tracks** | `/dashboard/programs`, `/programs/$programId`, `/programs-admin`, `/dashboard/tracks`, `/tracks/$trackSlug` | `training_programs` / `program_courses`. | **No inbound nav** from `dashboard.tsx`. Self-links only. | Mounted. Do not delete. |

`StaffTrainingStrip` (`src/components/training/staff-training-strip.tsx`) was removed from the Employees roster (PR #155) and is now **unimported**. `src/lib/hive-training-roster.functions.ts` has no callers (it was the strip’s data). That pair is an honest after-Sep-1 deletion. Do **not** delete `hive-training-engine.tsx` — stack A uses it.

### 1.4 Whiteboard / celebrations — already gone from app code

| Claim in old docs | Reality on this tree |
|-------------------|----------------------|
| `src/lib/whiteboard-notes.functions.ts` | **File does not exist.** Zero imports of whiteboard helpers under `src/`. |
| `src/lib/celebrations.functions.ts` | **File does not exist.** |
| `DATABASE.md` “Whiteboard / Celebrations … `whiteboard-notes.functions.ts`” | **Stale.** Tables still appear in `src/integrations/supabase/types.ts` (`whiteboard_notes`, `celebration_events`, `celebration_acknowledgements`, `org_celebration_settings`, `user_celebration_mute`). |
| “Worth celebrating” cards | Computed inside `src/lib/company-overview.functions.ts` from hire dates / certs — **not** from `celebration_events`. And the page that rendered them (`CompanyOverview()` in `src/components/company-overview.tsx`) is **not mounted** (see §2). |

There is nothing left to delete in TS for whiteboard. Do **not** `DROP` those tables before a SQL handoff confirms no live rows / no leftover RPCs. `user_ui_dismissals` is a different, live table (`src/lib/ui-dismissals.functions.ts`).

### 1.5 Scheduler generations — live page vs leftover UI kit

| Generation | Where | Status |
|------------|-------|--------|
| **Live admin scheduler** | `/dashboard/scheduler` (`src/routes/dashboard.scheduler.tsx`, ~1835 lines) + `src/lib/scheduler/*` + `src/hooks/use-scheduler-data.tsx` | **In `ADMIN_NAV`.** Sep 1 path. |
| Redirect stubs | `/dashboard/scheduling`, `/dashboard/schedule-preview`, `/dashboard/day-program` | **Mounted redirects** to `/dashboard/scheduler`. Keep. |
| Staff My Schedule | `/dashboard/schedule` | **In `STAFF_NAV`.** Uses `GeneralTimeClock` inline (the old Time Clock tab was folded in). |
| Old scheduling **components** | most of `src/components/scheduling/*` | **Unimported** except `open-shifts-panel`, `hhs-info-tooltip`, `hhs-explainer-banner`, `homes-teams-board`, `add-segment-dialog` (only from other unused files). See §2. |
| Old schedule-preview leftovers | `nectar-command-bar.tsx`, `settings-drawer.tsx`, `shift-editor.tsx` | **Unimported.** `requests-panel.tsx` / time-off / swap dialogs **are** used by the live scheduler + staff schedule. |
| `src/lib/scheduling/*` | shifts, locations, open-shifts, HHS labels, conflict math | **Load-bearing.** Compass clock-in, staff schedule, homes board, and the unused old UI all call this package. Do not delete the lib because the old UI is unused. |

Homes & Teams: `/dashboard/homes` is the live board (`HomesTeamsBoard`). `/dashboard/teams` redirects there. **Quirk (do not “fix” before Tuesday):** Clients hub tab “Teams & homes” (`dashboard.hub.clients.tsx`) still renders `TeamsPage()`, which is now a `<Navigate to="/dashboard/homes">` — so that hub tab navigates **away** from the hub. Wired, not dead.

---

## 2. What can be deleted vs what is still wired

Legend:

- **Keep (mounted)** — route file is in `routeTree.gen.ts`. Do not delete the file.
- **Keep (linked)** — something in the running UI still navigates there.
- **Orphan component** — no importer; deleting does not 404 a URL.
- **Redirect stub** — mounted on purpose.

### 2.1 Redirect stubs (keep through Sep 1; optional forever)

These are 5–15 line files. Deleting them is a 404 for bookmarks and for stale strings in `nectar-help.functions.ts` / `nectar/tour-anchors.ts`.

| Route file | URL | Goes to |
|------------|-----|---------|
| `src/routes/dashboard.deadlines.tsx` | `/dashboard/deadlines` | `/dashboard/company-obligations?tab=action-required` |
| `src/routes/dashboard.scheduling.tsx` | `/dashboard/scheduling` | `/dashboard/scheduler` |
| `src/routes/dashboard.schedule-preview.tsx` | `/dashboard/schedule-preview` | `/dashboard/scheduler` |
| `src/routes/dashboard.day-program.tsx` | `/dashboard/day-program` | `/dashboard/scheduler` |
| `src/routes/dashboard.records-desk.tsx` | `/dashboard/records-desk` | `/dashboard/hub/documentation` (tab map) |
| `src/routes/dashboard.admin.ce-hours.tsx` | `/dashboard/admin/ce-hours` | `/dashboard/records-desk?tab=training-records` (then the records-desk redirect) |
| `src/routes/dashboard.teams.tsx` | `/dashboard/teams` | `/dashboard/homes` (+ exports `TeamsPage` used by Clients hub) |
| `src/routes/dashboard.clients.rhs-board.tsx` | `/dashboard/clients/rhs-board` | `/dashboard/hub/clients` |
| `src/routes/dashboard.billing.subscription.tsx` | `/dashboard/billing/subscription` | `/dashboard/settings/subscription` |
| `src/routes/dashboard.settings.service-catalog.tsx` | `/dashboard/settings/service-catalog` | `/dashboard/settings/service-codes` |
| `src/routes/dashboard.financial.index.tsx` | `/dashboard/financial/` | `/dashboard/financial/revenue` |
| `src/routes/mfa-setup.tsx` | `/mfa-setup` | `/dashboard` (MFA intentionally off) |
| `src/routes/admin.tsx`, `manager.tsx`, `employee.tsx` | `/admin` `/manager` `/employee` | role-entry → `/dashboard` (`src/lib/role-entry.tsx`) |

`/fix-admin` is **already gone** (no route file, no grep hits). Do not recreate (`CLAUDE.md`).

### 2.2 Mounted routes not in the sidebar — still wired (do not delete)

| URL | File | Who still reaches it |
|-----|------|----------------------|
| `/dashboard/compliance-desk` | `dashboard.compliance-desk.tsx` (~2721 lines) | Admin Home EVV tile; Action Required; Utah CSV. **Sep 1 EVV export path.** |
| `/dashboard/command-center` | `dashboard.command-center.tsx` (~2014 lines) | `NotificationBell` “View Agency Command Center”. Not in `ADMIN_NAV`. Incidents also live under Documentation → Incidents. Dual **page**, both mounted. |
| `/dashboard/timeclock` | `dashboard.timeclock.tsx` | `active-shift-bar.tsx`, `nectar-pay-period-card.tsx`. Staff nav uses Schedule instead; this URL still clocks general time. |
| `/dashboard/employees/` | `dashboard.employees.index.tsx` | Admin Home “Employees” tile; staff profile back-link; hub roster **embeds** the same `EmployeesPage`. |
| `/dashboard/homes` | `dashboard.homes.tsx` | Live Homes & Teams. |
| `/dashboard/hhs-hub/$clientId` | `dashboard.hhs-hub.$clientId.tsx` | **HHS Sep 1 path** (daily note + attendance). Not punch pad. |
| `/dashboard/workspace/$clientId` | `dashboard.workspace.$clientId.tsx` | Staff caseload → punch pad. Compass GPS fallback lands here. |
| `/dashboard/evv-archive` | `dashboard.evv-archive.tsx` | Timesheet import wizard `onArchive`. Also a **tab inside** compliance-desk. |
| `/dashboard/nectar-company-profile` | `dashboard.nectar-company-profile.tsx` | Form 520 “provider approver” link. |
| `/dashboard/host-home-control` | `dashboard.host-home-control.tsx` | Only `src/lib/dspd-audit-tool.ts` `hive_href`. Still mounted. |
| `/dashboard/assignments` | `dashboard.assignments.tsx` | **No UI Link found.** Still mounted. Help prompt still names it. |
| `/dashboard/team` | `dashboard.team.tsx` | **No inbound Link found.** Still mounted (training-progress table). |
| `/dashboard/programs*` `/dashboard/tracks*` | see §1.3 E | No sidebar item. Self-linked. Mounted. |
| `/dashboard/training/` | `dashboard.training.index.tsx` | Certifications “Go to My Training”. |
| `/dashboard/audit`, `/dashboard/hrc`, `/dashboard/forms/*`, `/dashboard/internal-audit`, `/dashboard/nectar-docs`, `/dashboard/authoritative-sources`, `/dashboard/external-compliance` | matching route files | Documentation / Knowledge **hubs embed the same page components** *and* the standalone URLs still work. Dual mount, not dead. `/dashboard/hrc` is also the **only** screen `committee_member` is allowed to see (`dashboard.tsx`). |
| `/dashboard/hive-exec/*` | exec route tree + `src/lib/exec-nav.ts` | Hive executives only. TNS owner will not live here; do not delete. |
| `/training` | `src/routes/training.tsx` | Public HIVE Training storefront. |

### 2.3 Unmounted UI: smallest honest deletions (after Sep 1)

Import-graph + grep. None of these are route files.

**Old Admin Home (replaced by `AdminHomeDashboard` in `dashboard.index.tsx`):**

- `src/components/company-overview.tsx` — `CompanyOverview()` has **zero call sites**. Settings still imports `getOverviewPrefs` / `OVERVIEW_CARDS` via `src/components/company-overview-settings.tsx` (`dashboard.settings.tsx` renders that card). Deleting the overview file **requires** removing the Settings “Company Overview layout” block in the same change, or Settings will not compile.
- `src/lib/company-overview.functions.ts` — only consumed by the unmounted `CompanyOverview`. Same cluster.
- Unused cards (nothing imports them):  
  `src/components/company-overview/billing-plan-card.tsx`  
  `expiring-soon-card.tsx`  
  `first-run-nudge.tsx`  
  `hive-exec-rollup.tsx`  
  `kpi-stat-card.tsx`  
  `quick-actions-card.tsx`  
  `recent-activity-card.tsx`  
  `team-leaderboard-card.tsx`  
- **Keep:** `onboarding-pipeline-card.tsx` — imported by `nectar-onboarding-panel.tsx`.

**Old scheduler UI kit** (live scheduler does not import these):

- `src/components/scheduling/action-needed-card.tsx`
- `auto-assign-drawer.tsx`
- `conflicts-panel.tsx`
- `copy-week-menu.tsx`
- `coverage-bar-24h.tsx`
- `coverage-requirements-dialog.tsx`
- `day-program-panel.tsx`
- `day-timeline-drawer.tsx`
- `locations-dialog.tsx`
- `recurring-patterns-dialog.tsx`
- `shift-card.tsx`
- `shift-create-dialog.tsx`
- `swap-request-dialog.tsx`
- `timesheets-reconcile.tsx`
- `weekly-target-meter.tsx`
- `weekly-targets-dialog.tsx`
- `src/components/clients/rhs-planning-board.tsx` (route already redirects)

**Keep in `scheduling/`:** `homes-teams-board.tsx`, `open-shifts-panel.tsx`, `hhs-explainer-banner.tsx`, `hhs-info-tooltip.tsx`.

**Schedule-preview leftovers:** `nectar-command-bar.tsx`, `settings-drawer.tsx`, `shift-editor.tsx`. Keep `requests-panel.tsx`, `request-time-off-dialog.tsx`, `request-swap-dialog.tsx`.

**Training leftovers (stack A/B still live — only these files are unimported):**

- `src/components/training/staff-training-strip.tsx`
- `src/lib/hive-training-roster.functions.ts`
- `src/components/training/other-assignments-reminder.tsx`
- `src/components/training/other-assignments-section.tsx`  
  (`other-assignments-rollup.tsx` **is** used by `dashboard.hr-admin.tsx`)

**Records Desk leftovers** (hub Documentation → Records is `records-tab.tsx`; these were old Records Desk tabs):

- `src/components/audit-zone/training-records-admin.tsx`
- `src/components/audit-zone/training-content-admin.tsx`  
  (`audit-zone.tsx` itself **is** still embedded in the Documentation hub Audit tab.)

**Other unimported components** (same bar: no importer found):

- `src/components/ai-pdf-importer.tsx`
- `src/components/today-shift-banner.tsx`
- `src/components/mar-calendar.tsx`
- `src/components/behavior-support/bs-config-card.tsx`
- `src/components/ce/ce-reminder-card.tsx`
- `src/components/clients/care-section.tsx` (re-export only; live code imports `section-panel.tsx`)
- `src/components/clients/client-discharge-dialog.tsx`
- `src/components/clients/living-arrangement-flag.tsx`
- `src/components/clients/per-shift-forms-care-section.tsx`
- `src/components/clients/tracked-fields-card.tsx`
- `src/components/documents/governing-source-badge.tsx`
- `src/components/evv/approved-locations-editor.tsx`
- `src/components/evv/geofence-map.tsx` (punch pad has its own map path; this file is unused)
- `src/components/forms/forms-reminder-card.tsx`
- `src/components/landing/cert-benefits.tsx`, `how-it-works.tsx`, `testimonials.tsx` (live landing is inline in `src/routes/index.tsx` + `founder-story` / `competitive-contrast` / `footer`)
- `src/components/loans/client-loan-marker.tsx`
- `src/components/nectar/compliance-rules-panel.tsx`
- `src/components/nectar/held-timesheets-panel.tsx`
- `src/components/nectar/nectar-auto-assign-dialog.tsx`

**Unimported hooks / libs** (functions with no callers; do not confuse with similarly named live files):

- `src/hooks/use-reduced-motion.tsx`
- `src/hooks/use-state-template.tsx` (`state-templates.functions.ts` is still used by Hive-exec states)
- `src/lib/avatar-tint.ts`
- `src/lib/client-report.functions.ts`
- `src/lib/document-attestations.functions.ts`
- `src/lib/smart-import-nectar-mapping.functions.ts`
- `src/integrations/supabase/auth-attacher.ts` (live boot uses `src/lib/attach-supabase-auth.ts` from `src/start.ts`)

**Unused shadcn primitives** (never imported; deleting is cosmetic, not a product simplification):  
`src/components/ui/aspect-ratio.tsx`, `carousel.tsx`, `context-menu.tsx`, `hover-card.tsx`, `info-tile.tsx`, `input-otp.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `resizable.tsx`, `section-header.tsx`, `toggle-group.tsx`.

**Do not delete** `src/nitro-plugins/error-handler.ts` or `alb-origin-verify.ts` — `nitro.config.ts` references both. The import-graph missed config.

### 2.4 Dual *pages* that look redundant but are both mounted

Do not pick a winner before Tuesday. After Sep 1, the cleanup is “stop linking the old URL,” not “delete the route on day one.”

| Pair | Live for testers | Also mounted |
|------|------------------|--------------|
| Documentation hub Records vs Command Center | Hub → Records (`records-tab.tsx`) + Incidents | `/dashboard/command-center` (bell) |
| Documentation hub Records vs Compliance Desk | Hub Records + Utah CSV dialog | `/dashboard/compliance-desk` (Home EVV tile; fuller approve UI) |
| Schedule vs `/dashboard/timeclock` | Schedule embeds `GeneralTimeClock` | Standalone timeclock URL |
| Knowledge hub vs standalone nectar-docs / authoritative-sources / external-compliance | Hub when `nectar` on | Same page components on old URLs |
| Employees hub vs `/dashboard/employees` | Hub roster | Same `EmployeesPage`; Home still links the old path (redirect-free — both work) |

---

## 3. Complexity hotspots (scary, load-bearing)

These files look like “too much code.” They are the Sep 1 product. Do not split, rewrite, or “just trim unused props” this week.

| File | ~Lines | Why it exists |
|------|--------|----------------|
| `src/integrations/supabase/types.ts` | 18k | Generated DB types. Edit only via regen. |
| `src/components/pages/authoritative-sources-page.tsx` | 5069 | NECTAR SOW ingestion UI. Gated off; still the only sources UI. |
| `src/components/evv/punch-pad.tsx` | 3496 | **Clock in/out.** Geofence, 1056 gate, launchpad, Compass expand, GPS. PR #166/#167 just touched copy + Compass handoff. |
| `src/lib/company-obligations.functions.ts` | 3221 | Compliance register + due-date engine. Home / Action Required / My Compliance all sit on this. |
| `src/routes/dashboard.smart-import.$jobId.review.tsx` | 3702 | PCSP/1056 import review. |
| `src/routes/dashboard.compliance-desk.tsx` | 2721 | EVV approve + Utah CSV. |
| `src/routes/dashboard.clients.$clientId.tsx` | 2716 | Client profile. |
| `src/lib/authoritative-sources.functions.ts` | 2653 | Writes `nectar_requirements`. |
| `src/components/training/hive-training-engine.tsx` | 2103 | **My Trainings** player (name is leftover). |
| `src/components/clients/client-meal-planner-panel.tsx` | 2105 | Meal planner + edge fns. Not TNS-critical; still wired on client workspace. |
| `src/routes/dashboard.command-center.tsx` | 2014 | Old triage desk; bell still opens it. |
| `src/components/workspace/mar-emar-tab.tsx` | 2083 | eMAR. |
| `src/components/incidents/incident-report-dialog.tsx` | 2006 | Incident filing. |
| `src/routes/dashboard.employees.$staffId.tsx` | 1959 | Staff profile + deadlines slice. |
| `src/routes/dashboard.scheduler.tsx` | 1835 | **Admin scheduler.** |
| `src/lib/forms.functions.ts` | 1797 | Forms + staff mandates. |
| `src/components/admin-home/admin-home-dashboard.tsx` | 1618 | **Admin Home** (PR #159/#166). |
| `src/lib/smart-import-commit.functions.ts` | 1645 | Import commit. |
| `src/lib/billing-units.ts` + `src/lib/evv-codes.ts` + `src/lib/service-billing.ts` | small | **Domain math.** `computeEntryUnits()` is the only legal unit path (`CLAUDE.md`). |
| `src/lib/hhs.functions.ts` | — | HHS daily note / attendance writes. Readers must stay on `hhs_daily_records_v`. |
| `src/lib/cedar-voice-agent.server.ts` | — | Compass intents; just changed in PR #167. |
| `src/routes/__root.tsx` | — | `must_change_password` enforcement. |

Three EVV/shift hooks look duplicate and are all live: `use-active-shift.tsx` (green bar / Compass / punch), `use-today-shift.tsx` (staff Home hero), `use-today-shifts.tsx` (caseload grid). Unifying them is a regression magnet — not a cleanup.

`src/lib/scheduling/*` vs `src/lib/scheduler/*` is two packages by accident of history. Both are called from the live scheduler and from Compass. Do not merge this week.

---

## 4. After Sep 1 vs never-touch-before-Tuesday

### 4.1 Never-touch-before-Tuesday

Anything a tester will click, plus the last 48 hours of merges:

- Punch pad, Compass button, Cedar voice agent, GPS fallback to workspace.
- Scheduler + staff Schedule + `GeneralTimeClock` + `general_shifts`.
- HHS hub, daily logs, `hhs.functions.ts`, `hhs_daily_records_v`.
- Client 1056 / `client_billing_codes`, `computeEntryUnits`, `evv-codes.ts`.
- Admin Home, Action Required, `company-obligations.functions.ts`, `use-deadlines`, `use-action-required-queue`.
- Summaries (`dashboard.summaries.tsx`).
- Employees **Add manually**, `must_change_password` in `__root.tsx`.
- Utah EVV CSV (`utah-export-dialog.tsx`, `utah-evv-export.ts`, compliance-desk).
- `src/routeTree.gen.ts` except as a byproduct of a real route add/remove (and never remove a mounted route this week).
- RLS helpers, migrations, `docs/SQL_HANDOFF.md`.
- Feature flags / entitlements (`use-feature-enabled`, `use-entitlements`) — hiding HIVE Training is a flag, not a file delete.
- Hive-exec tree (even if TNS never opens it).
- Invite/signup (`signup.tsx`) — broken for staff join (`GO_LIVE.md` B-1); still the **new-agency** path. Do not delete.

Also do not “help” by deleting unused shadcn files or landing leftovers this week. Zero tester benefit, nonzero merge conflict with Lovable.

### 4.2 Safe after Sep 1 (smallest honest deletions)

Do these as **one cluster per PR**, grep for the symbol, `npm run build`, keep `routeTree.gen.ts` in the same commit if it changes (it should not, if you only delete components).

1. **Unimported `company-overview/*` cards** (except `onboarding-pipeline-card.tsx`). Then, if desired, `CompanyOverview()` + `company-overview.functions.ts` **together with** the Settings layout card (`company-overview-settings.tsx` + the block in `dashboard.settings.tsx`). Until Settings is updated, `company-overview.tsx` must stay because it exports prefs helpers.
2. **Unimported old scheduler components** listed in §2.3. Leave `src/lib/scheduling/*` and the four live `scheduling/` components.
3. **Schedule-preview** `nectar-command-bar` / `settings-drawer` / `shift-editor`.
4. **`StaffTrainingStrip` + `hive-training-roster.functions.ts`** (already removed from Employees).
5. **Training-records-admin / training-content-admin** if Documentation hub never re-embeds them (confirm `audit-zone.tsx` still does not import them — it does not today).
6. **Truly unimported** one-off components in §2.3 (pdf importer, today-shift-banner, geofence-map file, etc.).
7. **Stale nav copy** in `src/lib/nectar-help.functions.ts` and `src/lib/nectar/tour-anchors.ts` (they still teach `/dashboard/scheduling`, `/dashboard/records-desk`, `/dashboard/timeclock`, `/dashboard/assignments`). Those URLs **redirect or still exist**, so this is copy cleanup, not route deletion.
8. **June docs:** add a one-line banner to `LAUNCH_READINESS_AUDIT.md`, `FEATURE_INVENTORY.md`, `ROUTE_MAP.md`, `docs/platform-qa-map.md` pointing at `GO_LIVE.md` + this file — or delete those four after the test if nobody wants history in-repo. They actively mislead (`/fix-admin` exists, HIVE Subscription 404s, general time is localStorage, Staff nav has no My Compliance).

**Not safe as a “cleanup” even after Sep 1 without a product decision:**

- Deleting `/dashboard/command-center` or `/dashboard/compliance-desk` or `/dashboard/timeclock` or `/dashboard/training` or `/dashboard/programs` or `/dashboard/team` or `/dashboard/assignments` or `/dashboard/host-home-control` — all still **mounted**. First change remaining links/embeds to the hub, ship that, *then* consider a redirect stub, *then* maybe delete. Never skip to delete.
- Merging Compass into NECTAR or My Trainings into HIVE Training.
- Dropping `hhs_daily_records`, `locations`, celebration/whiteboard tables, or `nectar_requirements`.
- Rewriting punch-pad / scheduler / obligations / smart-import “to make them smaller.”

### 4.3 Intentionally out of scope (not dead)

From `GO_LIVE.md`, still true after PRs 166–167: no live UEVV API, invite-accept unwired, Form 520 submit disabled, MFA off, `nectar` / `hive_training` / `state_audit` default OFF. Those are product gaps, not unused files.

---

## 5. June docs vs this tree (do not treat as current)

| June claim | This tree (`main` through PR #167) |
|------------|--------------------------------------|
| `/fix-admin` public privilege button | Route **deleted**. |
| HIVE Subscription tab 404 | Route **exists** and redirects to Settings. |
| General time clock = localStorage | **Fixed.** `general_shifts`; UI on Schedule + `/dashboard/timeclock`. |
| Reports unreachable / identical CSVs | In `ADMIN_NAV`; distinct exporters. |
| Billing reads `hhs_daily_records` | App reads `hhs_daily_records_v`. Do not drop the old table. |
| Admin lands on empty staff caseload | Admin-capable default to Admin Home. |
| `must_change_password` only inside dashboard | Enforced in `__root.tsx`. |
| Staff Forms missing `clientId` | Client picker on `dashboard.forms.index.tsx`. |
| Deadlines vs Compliance as two desks | Deadlines **redirects**; both hooks still live. |
| Whiteboard/celebrations “wired” | Function files **gone**; tables remain in types. |
| `STAFF_NAV` is Caseload / Schedule / Logs / Ask NECTAR / Trainings | Also My Compliance, Historical Records, Time Corrections, HIVE Training. |
| `FEATURE_INVENTORY.md` `/dashboard/billing/subscription` missing | File exists. |
| `ROUTE_MAP.md` `/fix-admin`, Records Desk as primary | Historical. |
| `GO_LIVE.md` Compass GPS bypassed | **Superseded by PR #167.** |

`GO_LIVE.md` is the Sep 1 operations doc. This file is the cleanup map. June audits are fossils.

---

## 6. What this audit will not recommend

- A new information architecture, a “one training system,” or a NECTAR/Compass merge.
- Deleting any file under `src/routes/` while it still appears in `src/routeTree.gen.ts`.
- Database drops, RLS edits, or “while we’re here” scheduler/punch-pad refactors.
- Removing redirect stubs so the route map looks smaller. 404s during the agency test are worse than extra files.

If cleanup happens after Sep 1, start with §4.2 items 1–4 (unimported Home cards, old scheduler UI, leftover preview bars, training strip). That is the entire honest deletion set that does not require a product call.
