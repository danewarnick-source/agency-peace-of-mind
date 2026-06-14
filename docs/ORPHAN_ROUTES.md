# Orphan Routes Report

Generated 2026-06-14T05:10:42Z. No deletions performed; review and approve.

Method: for each route file, derived its URL path, then grep'd `src/` (excluding routeTree.gen.ts and the route file itself) for: nav config, `<Link to>`, `navigate({ to`, `redirect({ to`, `router.navigate`, and any literal occurrence of the path string.

| Route path | File | Link/Nav refs | Literal refs | Verdict | Notes / suspected superseder |
|---|---|---:|---:|---|---|
| `/admin` | admin.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/auditor` | auditor.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/certificate/$code` | certificate.$code.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0 |
| `/contact` | contact.tsx | 4 | 5 | LIVE |  |
| `/dashboard/admin/ce-hours` | dashboard.admin.ce-hours.tsx | 0 | 0 | LIKELY ORPHAN |  |
| `/dashboard/admin/emar-audit` | dashboard.admin.emar-audit.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/dashboard/ask-nectar` | dashboard.ask-nectar.tsx | 7 | 11 | LIVE |  |
| `/dashboard/assignments` | dashboard.assignments.tsx | 0 | 0 | LIKELY ORPHAN | ; vs /dashboard/schedule-preview |
| `/dashboard/audit` | dashboard.audit.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/dashboard/authoritative-sources` | dashboard.authoritative-sources.tsx | 2 | 4 | LIVE |  |
| `/dashboard/behavior-support/$clientId` | dashboard.behavior-support.$clientId.tsx | 2 | 3 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/behaviorist` | dashboard.behaviorist.tsx | 1 | 2 | LIVE |  |
| `/dashboard/billing-520` | dashboard.billing-520.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/$clientId` | dashboard.billing.$clientId.tsx | 4 | 5 | LIVE | dynamic segment; parent refs=6; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/contractors` | dashboard.billing.contractors.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/distributions` | dashboard.billing.distributions.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/form520` | dashboard.billing.form520.tsx | 3 | 3 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/gross` | dashboard.billing.gross.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/host-home` | dashboard.billing.host-home.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/imports` | dashboard.billing.imports.tsx | 2 | 2 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing` | dashboard.billing.index.tsx | 6 | 7 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/monthly-grid` | dashboard.billing.monthly-grid.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/nectar` | dashboard.billing.nectar.tsx | 1 | 2 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/subscription` | dashboard.billing.subscription.tsx | 1 | 1 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing/totals` | dashboard.billing.totals.tsx | 0 | 0 | LIKELY ORPHAN | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/billing` | dashboard.billing.tsx | 5 | 6 | LIVE | ; possibly superseded by /dashboard/hub/finances or /dashboard/financial/* |
| `/dashboard/certifications` | dashboard.certifications.tsx | 1 | 1 | LIVE |  |
| `/dashboard/client-billing-codes` | dashboard.client-billing-codes.tsx | 0 | 0 | LIKELY ORPHAN |  |
| `/dashboard/client-intake/$clientId` | dashboard.client-intake.$clientId.tsx | 4 | 3 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/client-loans` | dashboard.client-loans.tsx | 2 | 2 | LIVE |  |
| `/dashboard/client-training/$clientId` | dashboard.client-training.$clientId.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/clients/$clientId` | dashboard.clients.$clientId.tsx | 2 | 2 | LIVE | dynamic segment; parent refs=6 |
| `/dashboard/clients/rhs-board` | dashboard.clients.rhs-board.tsx | 1 | 1 | LIVE |  |
| `/dashboard/clients` | dashboard.clients.tsx | 2 | 6 | LIVE |  |
| `/dashboard/command-center` | dashboard.command-center.tsx | 2 | 2 | LIVE |  |
| `/dashboard/compliance-desk` | dashboard.compliance-desk.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/documentation |
| `/dashboard/courses/$courseId/edit` | dashboard.courses.$courseId.edit.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0; overlapping training systems |
| `/dashboard/courses/$courseId` | dashboard.courses.$courseId.tsx | 2 | 2 | LIVE | dynamic segment; parent refs=11; overlapping training systems |
| `/dashboard/courses/ce` | dashboard.courses.ce.tsx | 3 | 3 | LIVE | ; overlapping training systems |
| `/dashboard/courses/core` | dashboard.courses.core.tsx | 3 | 2 | LIVE | ; overlapping training systems |
| `/dashboard/courses` | dashboard.courses.index.tsx | 13 | 12 | LIVE | ; overlapping training systems |
| `/dashboard/courses/mindsmith` | dashboard.courses.mindsmith.tsx | 0 | 0 | LIKELY ORPHAN | ; overlapping training systems |
| `/dashboard/courses/other` | dashboard.courses.other.tsx | 4 | 4 | LIVE | ; overlapping training systems |
| `/dashboard/courses/person-module/$assignmentId` | dashboard.courses.person-module.$assignmentId.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0; overlapping training systems |
| `/dashboard/courses/person` | dashboard.courses.person.tsx | 3 | 2 | LIVE | ; overlapping training systems |
| `/dashboard/courses/topic/$topicId` | dashboard.courses.topic.$topicId.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0; overlapping training systems |
| `/dashboard/daily-logs` | dashboard.daily-logs.tsx | 4 | 5 | LIVE |  |
| `/dashboard/deadlines` | dashboard.deadlines.tsx | 3 | 3 | LIVE |  |
| `/dashboard/emar` | dashboard.emar.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/dashboard/employees/$staffId` | dashboard.employees.$staffId.tsx | 3 | 3 | LIVE | dynamic segment; parent refs=6 |
| `/dashboard/employees` | dashboard.employees.index.tsx | 5 | 7 | LIVE |  |
| `/dashboard/external-certifications` | dashboard.external-certifications.tsx | 2 | 2 | LIVE |  |
| `/dashboard/external-compliance` | dashboard.external-compliance.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs; vs /dashboard/hub/documentation |
| `/dashboard/financial/contractors` | dashboard.financial.contractors.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/distributions` | dashboard.financial.distributions.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/employees` | dashboard.financial.employees.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/gross` | dashboard.financial.gross.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/host-home` | dashboard.financial.host-home.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial` | dashboard.financial.index.tsx | 1 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/monthly-grid` | dashboard.financial.monthly-grid.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/nectar` | dashboard.financial.nectar.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/revenue` | dashboard.financial.revenue.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/rhs` | dashboard.financial.rhs.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial/totals` | dashboard.financial.totals.tsx | 2 | 2 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/financial` | dashboard.financial.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/finances |
| `/dashboard/forms/$formId/edit` | dashboard.forms.$formId.edit.tsx | 2 | 1 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/forms/$formId/fill` | dashboard.forms.$formId.fill.tsx | 4 | 4 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/forms/$formId/submissions` | dashboard.forms.$formId.submissions.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/forms` | dashboard.forms.index.tsx | 5 | 7 | LIVE |  |
| `/dashboard/forms` | dashboard.forms.tsx | 5 | 6 | LIVE |  |
| `/dashboard/help` | dashboard.help.tsx | 1 | 3 | LIVE |  |
| `/dashboard/hhs-hub/$clientId` | dashboard.hhs-hub.$clientId.tsx | 3 | 4 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/hive-exec/$orgId` | dashboard.hive-exec.$orgId.tsx | 7 | 7 | LIVE | dynamic segment; parent refs=5 |
| `/dashboard/hive-exec/approvals` | dashboard.hive-exec.approvals.tsx | 1 | 1 | LIVE |  |
| `/dashboard/hive-exec/base-template` | dashboard.hive-exec.base-template.tsx | 1 | 1 | LIVE |  |
| `/dashboard/hive-exec/company-migration` | dashboard.hive-exec.company-migration.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec/health` | dashboard.hive-exec.health.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec` | dashboard.hive-exec.index.tsx | 5 | 6 | LIVE |  |
| `/dashboard/hive-exec/messages` | dashboard.hive-exec.messages.tsx | 1 | 1 | LIVE |  |
| `/dashboard/hive-exec/nectar` | dashboard.hive-exec.nectar.tsx | 1 | 1 | LIVE |  |
| `/dashboard/hive-exec/new-company` | dashboard.hive-exec.new-company.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec/permissions` | dashboard.hive-exec.permissions.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec/plans` | dashboard.hive-exec.plans.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec/states/$stateCode/onboarding` | dashboard.hive-exec.states.$stateCode.onboarding.tsx | 3 | 2 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/hive-exec/states/$stateCode` | dashboard.hive-exec.states.$stateCode.tsx | 4 | 3 | LIVE | dynamic segment; parent refs=4 |
| `/dashboard/hive-exec/states` | dashboard.hive-exec.states.tsx | 4 | 4 | LIVE |  |
| `/dashboard/hive-exec/tickets` | dashboard.hive-exec.tickets.tsx | 2 | 2 | LIVE |  |
| `/dashboard/hive-exec` | dashboard.hive-exec.tsx | 4 | 5 | LIVE |  |
| `/dashboard/homes` | dashboard.homes.tsx | 3 | 2 | LIVE |  |
| `/dashboard/host-home-control` | dashboard.host-home-control.tsx | 0 | 0 | LIKELY ORPHAN |  |
| `/dashboard/hr-admin/settings` | dashboard.hr-admin.settings.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/employees |
| `/dashboard/hr-admin` | dashboard.hr-admin.tsx | 1 | 1 | LIVE | ; vs /dashboard/hub/employees |
| `/dashboard/hrc` | dashboard.hrc.tsx | 2 | 3 | LIVE | ; vs /dashboard/hub/documentation |
| `/dashboard/hub/clients` | dashboard.hub.clients.tsx | 3 | 4 | LIVE |  |
| `/dashboard/hub/documentation` | dashboard.hub.documentation.tsx | 4 | 4 | LIVE |  |
| `/dashboard/hub/employees` | dashboard.hub.employees.tsx | 2 | 3 | LIVE |  |
| `/dashboard/hub/finances` | dashboard.hub.finances.tsx | 1 | 1 | LIVE |  |
| `/dashboard/hub/knowledge` | dashboard.hub.knowledge.tsx | 1 | 1 | LIVE |  |
| `/dashboard/inbox` | dashboard.inbox.tsx | 1 | 1 | LIVE |  |
| `/dashboard` | dashboard.index.tsx | 18 | 20 | LIVE |  |
| `/dashboard/internal-audit` | dashboard.internal-audit.tsx | 0 | 0 | LIKELY ORPHAN | ; vs /dashboard/hub/documentation |
| `/dashboard/invitations` | dashboard.invitations.tsx | 1 | 1 | LIVE |  |
| `/dashboard/nectar-docs` | dashboard.nectar-docs.tsx | 1 | 2 | LIVE |  |
| `/dashboard/pba-ledger` | dashboard.pba-ledger.tsx | 1 | 3 | LIVE |  |
| `/dashboard/permissions` | dashboard.permissions.tsx | 0 | 0 | LIKELY ORPHAN |  |
| `/dashboard/programs-admin` | dashboard.programs-admin.tsx | 0 | 0 | LIKELY ORPHAN | ; overlapping training systems |
| `/dashboard/programs/$programId` | dashboard.programs.$programId.tsx | 2 | 2 | LIVE | dynamic segment; parent refs=1; overlapping training systems |
| `/dashboard/programs` | dashboard.programs.tsx | 1 | 1 | LIVE | ; overlapping training systems |
| `/dashboard/records-desk` | dashboard.records-desk.tsx | 3 | 5 | LIVE | ; vs /dashboard/hub/documentation |
| `/dashboard/reimbursements` | dashboard.reimbursements.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/dashboard/reports` | dashboard.reports.tsx | 2 | 2 | LIVE |  |
| `/dashboard/roles` | dashboard.roles.tsx | 0 | 0 | LIKELY ORPHAN | ; vs /dashboard/hub/employees |
| `/dashboard/schedule-preview` | dashboard.schedule-preview.tsx | 4 | 3 | LIVE |  |
| `/dashboard/schedule` | dashboard.schedule.tsx | 6 | 6 | LIVE | ; vs /dashboard/schedule-preview |
| `/dashboard/scheduling` | dashboard.scheduling.tsx | 3 | 4 | LIVE | ; vs /dashboard/schedule-preview |
| `/dashboard/settings/automation-rules` | dashboard.settings.automation-rules.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/bank-mapping` | dashboard.settings.bank-mapping.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/email` | dashboard.settings.email.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/gmail` | dashboard.settings.gmail.tsx | 1 | 2 | LIVE |  |
| `/dashboard/settings/retention` | dashboard.settings.retention.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/service-catalog` | dashboard.settings.service-catalog.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/service-codes` | dashboard.settings.service-codes.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings/subscription` | dashboard.settings.subscription.tsx | 2 | 2 | LIVE |  |
| `/dashboard/settings/team-access` | dashboard.settings.team-access.tsx | 1 | 1 | LIVE |  |
| `/dashboard/settings` | dashboard.settings.tsx | 5 | 6 | LIVE |  |
| `/dashboard/shift/$shiftId` | dashboard.shift.$shiftId.tsx | 0 | 0 | NEEDS REVIEW | dynamic segment; parent refs=0 |
| `/dashboard/smart-import/$jobId/done` | dashboard.smart-import.$jobId.done.tsx | 3 | 3 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/smart-import/$jobId/review` | dashboard.smart-import.$jobId.review.tsx | 5 | 3 | LIVE | dynamic segment; parent refs=0 |
| `/dashboard/smart-import/history` | dashboard.smart-import.history.tsx | 1 | 1 | LIVE |  |
| `/dashboard/smart-import` | dashboard.smart-import.index.tsx | 7 | 7 | LIVE |  |
| `/dashboard/smart-import` | dashboard.smart-import.tsx | 7 | 6 | LIVE |  |
| `/dashboard/summaries` | dashboard.summaries.tsx | 1 | 1 | LIVE |  |
| `/dashboard/super-admin` | dashboard.super-admin.tsx | 1 | 1 | LIVE |  |
| `/dashboard/team` | dashboard.team.tsx | 0 | 0 | LIKELY ORPHAN | ; vs /dashboard/hub/employees |
| `/dashboard/teams` | dashboard.teams.tsx | 2 | 5 | LIVE | ; vs /dashboard/hub/employees |
| `/dashboard/timeclock` | dashboard.timeclock.tsx | 6 | 6 | LIVE |  |
| `/dashboard/tracks/$trackSlug` | dashboard.tracks.$trackSlug.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=1; overlapping training systems |
| `/dashboard/tracks` | dashboard.tracks.tsx | 1 | 1 | LIVE | ; overlapping training systems |
| `/dashboard/training/$id` | dashboard.training.$id.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=1; overlapping training systems |
| `/dashboard/training` | dashboard.training.index.tsx | 1 | 1 | LIVE | ; overlapping training systems |
| `/dashboard` | dashboard.tsx | 17 | 19 | LIVE |  |
| `/dashboard/workspace/$clientId` | dashboard.workspace.$clientId.tsx | 10 | 12 | LIVE | dynamic segment; parent refs=0 |
| `/employee` | employee.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/forgot-password` | forgot-password.tsx | 2 | 2 | LIVE |  |
| `` | index.tsx | 0 | 303 | NEEDS REVIEW | literal-only refs |
| `/login` | login.tsx | 7 | 7 | LIVE |  |
| `/manager` | manager.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/pricing` | pricing.tsx | 4 | 6 | LIVE |  |
| `/reset-password` | reset-password.tsx | 1 | 1 | LIVE |  |
| `/signup` | signup.tsx | 6 | 7 | LIVE |  |
| `/super-admin` | super-admin.tsx | 0 | 1 | NEEDS REVIEW | literal-only refs |
| `/unauthorized` | unauthorized.tsx | 2 | 2 | LIVE |  |
| `/verify/$code` | verify.$code.tsx | 1 | 1 | LIVE | dynamic segment; parent refs=0 |
