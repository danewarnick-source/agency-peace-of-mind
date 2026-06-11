## Goal

A NECTAR search bar pinned to the top of every dashboard page (desktop header + mobile staff top bar). Typing surfaces quick navigation matches (pages + clients + staff) as-you-type; pressing Enter (or clicking "Ask NECTAR") hands the query to NECTAR for a Q&A answer.

## UX

Desktop (`src/routes/dashboard.tsx` header, between the page title and the right-side action cluster):
- Compact input (max ~420px) with a Hexagon glyph and "Ask NECTAR or search…" placeholder.
- `Cmd/Ctrl+K` opens/focuses it from anywhere.
- Focusing shows a results popover below the input:
  - **Pages** section — fuzzy match against the same `nav` + `NECTAR_NAV` arrays already built in `dashboard.tsx`, scoped to the user's effective role.
  - **Clients** section — matches by name (admin+manager+super_admin only, gated by `view_clients` permission), top 5.
  - **Staff** section — matches by name (admin-capable only), top 5.
  - **Ask NECTAR** action row at the bottom — always present once the query ≥2 chars: "Ask NECTAR: '<query>'".
- Selecting a page/client/staff result navigates via `<Link>`/`useNavigate` with typed params.
- Selecting "Ask NECTAR" (or Enter when no result is highlighted) navigates to `/dashboard/help?q=<query>` (admin/desktop) or `/dashboard/ask-nectar?q=<query>` (staff mobile) and auto-sends the question on mount.
- Arrow keys cycle results; Esc closes; click-outside closes.

Mobile (`src/components/staff-mobile/staff-top-bar.tsx`):
- Replace the title row's right padding with a compact search-trigger pill ("Ask NECTAR…") that opens a full-width sheet (top-anchored) with the same input + results. Title stays left, profile button stays right.
- Inside the sheet: same sections (pages/clients/staff/Ask NECTAR). Tap targets ≥44px per the project's mobile rule.

Both surfaces respect the existing role gating — staff never see client/staff entity matches; they only see pages + Ask NECTAR.

## Implementation

1. **New component** `src/components/nectar/nectar-search-bar.tsx`:
   - Props: `nav: NavItem[]`, `effectiveView`, `isAdminCapable`, `role`, `variant: "desktop" | "mobile"`.
   - Local `query` state; debounced 150ms.
   - Page results: in-memory fuzzy filter of the passed nav list.
   - Entity results: `useQuery(["nectar-search-entities", orgId, query], …)` calling a new server function (below), `enabled: isAdminCapable && query.length >= 2`.
   - Renders popover (desktop) or inline list (mobile sheet) with keyboard nav + ARIA combobox roles.
   - On submit-without-pick → `navigate({ to: helpRoute, search: { q: query } })`.

2. **New server function** `src/lib/nectar-search.functions.ts` (`searchOrgEntities`):
   - `requireSupabaseAuth` + `requireOrgMembership` (admin-capable only; throw 403 otherwise).
   - Input: `{ organizationId, query }` (zod: query 2–80 chars).
   - Queries Supabase: `clients` (first_name/last_name ilike) and `profiles` joined via `organization_members` (full_name/email ilike), limit 5 each.
   - Returns `{ clients: [{id, name}], staff: [{id, name}] }`.

3. **Wire into `src/routes/dashboard.tsx`** header (~line 313–364): mount `<NectarSearchBar variant="desktop" nav={allNav} … />` between the title block and the right-side cluster. Hide on `isHiveExecView` (exec area has its own context) — or include with exec nav; default = include.

4. **Wire into `src/components/staff-mobile/staff-top-bar.tsx`**: insert the mobile trigger pill before the profile sheet trigger. Keep current min-height; trigger is 44×44.

5. **Update `/dashboard/help`** (`src/routes/dashboard.help.tsx`) and **`/dashboard/ask-nectar`** (`src/routes/dashboard.ask-nectar.tsx`):
   - Add `q?: string` to `validateSearch` (with `fallback` from `@tanstack/zod-adapter`).
   - On mount, if `q` is present, prefill input and auto-call `send(q)` once, then clear the search param.

6. **Global `Cmd/Ctrl+K` listener** lives inside the desktop `NectarSearchBar` (mounted once per route via the dashboard header). Listens on `window` and focuses the input.

## Notes

- No new DB tables. Search runs against existing `clients` and `profiles`/`organization_members` (RLS already restricts to the user's org).
- Entity search is server-side and admin-gated — staff only get page + Ask NECTAR results, matching existing role boundaries.
- No changes to NECTAR's answer pipeline; we reuse `askNectarHelp` via the existing Help page.
- Mobile keeps the existing "Ask NECTAR" bottom-tab unchanged; the top search is an additional entry point.
