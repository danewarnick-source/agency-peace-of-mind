## 1. One Schedule — sidebar + repo

**Sidebar (`src/routes/dashboard.tsx`, ADMIN_NAV ~line 47–59)**
- Remove the legacy `/dashboard/scheduling` entry.
- Rename `Schedule (new)` → `Schedule`, keep icon `CalendarDays`, point to `/dashboard/schedule-preview`.
- Staff `/dashboard/schedule` (mobile staff view) is unchanged — that's a different page for field staff, not the admin scheduler.

**Routes / files removed from the repo**
- `src/routes/dashboard.scheduling.tsx` — the legacy multi-tab admin scheduler.
- `src/routes/dashboard.teams.tsx` — already just redirects into the old scheduling tabs (`?tab=homes`); superseded by `/dashboard/homes`.
- `src/components/scheduling/schedule-builder.tsx`
- `src/components/scheduling/individual-services-scheduler.tsx`
- `src/components/scheduling/homes-teams-board.tsx` (if it isn't referenced anywhere else — will grep before deleting; if referenced elsewhere it stays)
- Any other file in `src/components/scheduling/` that's only imported by the three above.

**Feature flag / preview plumbing — removed**
- `src/lib/schedule-v2-flag.ts` (no longer needed; new schedule is the only schedule).
- The flag-driven redirect block at the top of `src/routes/dashboard.schedule-preview.tsx`.
- The "V2 Preview" toggle that lived on the old scheduling page (going away with the file).

**Redirects kept (so old links don't 404)**
- `/dashboard/scheduling` → `/dashboard/schedule-preview` (replace the deleted route file with a thin redirect-only route).
- `/dashboard/teams` → `/dashboard/homes` (replace the deleted route file with a thin redirect-only route).

**Not touched** (per standing guardrails)
- `scheduled_shifts` schema, recurrence columns, RLS.
- Time clock / EVV, billing / Form 520, revenue, pay.
- `src/lib/schedule-preview-mutations.ts`, `src/hooks/use-schedule-preview.ts`, `src/components/schedule-preview/*` — the new schedule's own code.
- Staff mobile `/dashboard/schedule` route.

**Rollback**
Because this physically deletes the legacy files, rollback is a git revert of this change rather than a flag flip. Calling that out explicitly since it's a step beyond the earlier "keep old code in place" plan — confirm before I delete, or say "redirect only, don't delete" and I'll leave the legacy files on disk and only fix the sidebar.

## 2. NECTAR "Import a schedule" button — brand restyle

File: `src/components/schedule-preview/nectar-command-bar.tsx` (~line 234).

Current: white background, thin gray border, ink text.
Target: platform navy with gold trim, matching the rest of the app.

Change inline style to:
- `background: "#0B1126"` (navy)
- `color: "#fff"`
- `border: "1px solid #f5a623"` (gold trim)
- `boxShadow: "0 0 0 1px rgba(245,166,35,0.25) inset"` for a subtle gold inner trim
- Keep existing radius, padding, font weight, `Upload` icon, hover cursor.
- Icon inherits `currentColor` so it reads white on navy.

No logic, no data, no other buttons touched.

## Open question before I build

Delete the legacy scheduling files outright (cleanest "one schedule in GitHub"), or keep them on disk and only remove them from the sidebar + add redirects? Default if you don't answer: **delete**, as your message said "and within github."
