## Goal
The dashboard sidebar is currently hidden on mobile (`hidden md:flex` in `src/routes/dashboard.tsx`), so phone users have no navigation. Make it accessible on mobile via a slide-out drawer.

## Changes (scope: `src/routes/dashboard.tsx` only)

1. **Add a hamburger menu button** to the mobile header (left side, before the title), visible only below `md`.
2. **Wrap the existing `<aside>` sidebar in a `Sheet`** (shadcn `sheet.tsx`, already in project) for mobile:
   - On `md+`: render the sidebar as today (static left column, no behavior change).
   - On mobile: the same sidebar content lives inside a `SheetContent side="left"` that opens from the hamburger.
3. **Auto-close the sheet on navigation** so tapping a nav link closes the drawer (track open state, close in the `Link` `onClick`).
4. Keep the existing mobile sign-out button on the right of the header.

## Notes
- Reuses the existing nav array, portal-view selector, user footer, and sign-out — extracted into a small inline `SidebarBody` block so both the desktop `<aside>` and the mobile `SheetContent` render identical content (no duplication).
- No changes to routing, auth, impersonation, or any other files.
- No new dependencies.
