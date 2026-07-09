## Goal
Make `/dashboard/admin/emar-audit` (Master eMAR Audit Desk) reachable for admins/managers, since it's currently orphaned (no nav entry anywhere).

## Change
Add a single navigation entry pointing to `/dashboard/admin/emar-audit`, gated to users with `manage_users` (same gate the route itself uses).

**Placement options** — pick one:
1. **Admin sidebar / admin section** of the main dashboard nav (alongside other admin-only links like user management). Best fit since the route lives under `/dashboard/admin/*`.
2. **Card/tile on the admin landing page** (`/dashboard/admin` or the admin hub, if one exists) — more discoverable but requires a hub page to host it.
3. **Both** — sidebar link + admin hub tile.

Default recommendation: **Option 1** (sidebar link labeled "eMAR Audit" under an Admin group), because it's the lowest-friction way to un-orphan the page and matches how other admin routes are exposed.

## Out of scope
- No changes to the audit page itself (component, data, permissions).
- No changes to the route gate.
- No new roles or policies.

## Technical notes
- Locate the sidebar/nav config (likely `src/components/dashboard-sidebar.tsx` or similar) and add one `<Link to="/dashboard/admin/emar-audit">` entry conditionally rendered when the current user has `manage_users` (reuse the existing role hook already used for other admin links).
- No route file changes — the route already exists.
- No migration, no server function, no type changes.

## Verification
- As admin: link appears in nav, clicking it lands on the audit desk.
- As non-admin staff: link is not rendered.

Confirm Option 1 (or pick 2/3) and I'll implement.
