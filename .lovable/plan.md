
## What I found (read-only inspection)

### Shift data model
- **`scheduled_shifts`** is the single shift table. Key columns: `id`, `organization_id`, `staff_id` (→ `profiles.id`), `client_id` (→ `clients.id`), `job_code` (text, e.g. `HHS`, `DSI`, `DSG`), `code_id` (→ `service_codes`), `shift_type`, `starts_at`, `ends_at`, `status` (draft / published / accepted / declined / etc.), `published` (bool), recurrence fields, `notes`.
- A shift relates to **staff** via `staff_id`, to the **person served** via `client_id`, and to a **site** indirectly via `clients.team_id` (clients are grouped into a `teams` row — that's how the current app models a "home").

### "Site" / "home" model
- There is **no first-class `sites`/`homes` table**. The existing scheduler uses **`teams`** (`id`, `team_name`, `organization_id`) as the home.
- `home_designations` + `home_staff_designations` add per-team **staff role tags** (e.g. House Lead) — not site type.
- Residential vs. day vs. community is **not stored**. The existing app infers it by `job_code`: codes in `{HHS, RHS, DSG, RL6, RP3, RP4, RP5}` are daily/residential; everything else (e.g. `DSI`) is hourly/community/1:1. See `src/routes/dashboard.schedule.tsx` and `src/components/scheduling/staff-client-grid.tsx`. I'll reuse that same `DAILY_CODES` set so the new page agrees with billing/pay routing.

### Where the current scheduler lives (untouched)
- Route: **`/dashboard/scheduling`** → `src/routes/dashboard.scheduling.tsx`.
- Components: `components/scheduling/schedule-builder.tsx`, `coverage-views.tsx`, `individual-services-scheduler.tsx`, `homes-teams-board.tsx`.
- Staff "My Schedule" route: `/dashboard/schedule` → `src/routes/dashboard.schedule.tsx`.
- Other readers of `scheduled_shifts` (we will NOT touch): `dashboard.shift.$shiftId.tsx`, `dashboard.billing.form520.tsx`, `lib/audit-packet.functions.ts`, `lib/company-overview.functions.ts`, `hooks/use-today-shifts.tsx`, `hooks/use-today-shift.tsx`, nectar auto-assign.
- EVV / time clock reads **`evv_timesheets`** (separate table) — not affected.

### Gaps to call out (no schema changes to fix them)
- No site-type field → residential vs. day inferred from `job_code` (documented in UI as "inferred").
- Clients with `team_id = NULL` will be grouped into a virtual **"1-on-1 Services"** bucket.
- No "house coverage" shift concept — 24h coverage is computed by unioning that day's shifts for any client whose `team_id` matches the site.

---

## What I'll build (additive, read-only)

### Route + nav
- New file `src/routes/dashboard.schedule-preview.tsx` → `/dashboard/schedule-preview`, admin/manager-gated using existing `useCurrentOrg` + role check pattern already in `dashboard.scheduling.tsx`.
- Add one nav entry "Schedule (new)" in the admin nav (same file the existing "Scheduling" link lives in) — pure addition, existing link stays.

### Data hook (new, read-only)
`src/hooks/use-schedule-preview.ts` — one weekly query:
```
scheduled_shifts: id, staff_id, client_id, job_code, shift_type, starts_at, ends_at, status, published
clients:          id, first_name, last_name, team_id
teams:            id, team_name
profiles:         id, first_name, last_name, full_name (for staff names)
```
Scoped by `organization_id` and the visible week. No writes, no mutations.

### Components (all new under `src/components/schedule-preview/`)
1. **`SitePicker`** — segmented row of buttons: `All sites` + each team + virtual `1-on-1 Services` (clients with no `team_id`).
2. **`AllSitesOverview`** — table with one row per site × 7 day columns.
   - Residential site (any client in that team has a daily code that week, or the team has ≥1 client and ≥1 shift uses a residential code): show `✓ 24h` if the union of that day's shift intervals spans 00:00–24:00, otherwise `gap` badge with the missing-minutes count.
   - Day / 1-on-1 site: show `N shifts` (and `N open` if any `staff_id IS NULL`).
   - Row click → opens that site.
3. **`SiteWeekGrid`** — 7-column week grid with a segmented view toggle:
   - **Staff** — row per staff with a shift that week at this site; one card per shift.
   - **Client** — row per client at the site + a top "House coverage — all residents" row that reuses the 24h check per day.
   - **Both** — staff rows, each card labelled with the client.
4. **`DisplaySettingsDrawer`** — gear icon → side sheet using existing `Sheet` component. Stored in `localStorage` under `hive.schedulePreview.settings`:
   - default view (Staff / Client / Both)
   - start on All-sites vs last site
   - density (Comfortable / Compact)
   - color by shift type vs by staff
   - show times on cards
   - show resident counts on rows
5. **`coverage.ts`** util — pure functions: `mergeIntervals`, `dayCoverageMinutes`, `is24h`, `inferSiteType(team, clientsInTeam, shiftsInTeam)`.

### Visual
- Tailwind tokens scoped to this page (or inline classes) using HIVE palette: navy `#0B1126`, gold `#f5a623`, teal `#137182`, ink `#0d112b`. Plus Jakarta Sans via existing font setup if present, otherwise a local `<link>` in the route's `head()`.
- One card per cell, never stacked; All-sites view stays high-density status board, single-site view shows shift detail.

### Guardrails honored
- No edits to: `dashboard.scheduling.tsx`, `dashboard.schedule.tsx`, `dashboard.shift.$shiftId.tsx`, anything in `components/scheduling/`, billing, Form 520, revenue, pay, EVV, time clock.
- No `insert` / `update` / `delete` calls anywhere in the new code.
- No migrations, no new tables, no `types.ts` regeneration.
- Reuses `useCurrentOrg`, `supabase` browser client, and the existing `DAILY_CODES` constant (re-exported, not copied/forked).

### Out of scope (Phase 1)
- Creating / editing / deleting shifts.
- Drag-and-drop, publishing, notifications.
- Open-shift claim flow.

### One question before I build
You mentioned a working visual prototype of the layout — if you can paste a screenshot or the HTML, I'll match it pixel-for-pixel. Otherwise I'll build to the description above.
