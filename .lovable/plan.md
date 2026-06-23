## Problem

Clicking a client row in `/dashboard/clients` doesn't navigate — the URL stays on the directory. The destination route itself works (you can reach `/dashboard/clients/$clientId` by direct URL), so this is a directory-side click/handler issue, not a profile-hub render issue.

Current wiring in `src/routes/dashboard.clients.tsx` puts the navigation on the whole `<TableRow onClick={...}>` (line 498) and has `onClick={(e) => e.stopPropagation()}` on the Action cell. Row‑level `onClick` on shadcn `<TableRow>` is fragile on touch viewports and easy to break with stray overlays (chips, badges, loan markers, intake action menus). The current viewport is 747px (touch), which matches that failure mode.

## Fix

Make navigation explicit and reliable instead of relying on a row‑wide JS click handler.

1. In `src/routes/dashboard.clients.tsx`, change each client row so the **name cell** is a real `<Link to="/dashboard/clients/$clientId" params={{ clientId: c.id }} search={{ tab: "overview" }}>` (block‑level, fills the cell, focusable, keyboard‑accessible, works on touch). Keep the avatar + name inside the link.
2. Keep the row visually clickable: leave `cursor-pointer` + `hover:bg-muted/50`, and keep the `onClick` on the row as a fallback for clicks elsewhere in the row, but harden it:
   - Bail out if `e.defaultPrevented` or `(e.target as HTMLElement).closest('a,button,[role="menuitem"],[data-no-row-nav]')` matches.
3. Mark the Action cell's wrapper with `data-no-row-nav` (in addition to the existing `stopPropagation`) so any future control inside that cell never accidentally triggers navigation.
4. No changes to `dashboard.clients.$clientId.tsx`, `profile-tab.tsx`, queries, RLS, or routing config.

## Verification

- Click a row name → URL becomes `/dashboard/clients/<id>?tab=overview` and the Profile tab renders.
- Click anywhere else in the row → same navigation.
- Click an Intake action button → opens its menu, no navigation.
- Keyboard: Tab to a row's name, Enter → navigates.
- Build stays green; no new imports beyond `Link` (already imported).

## Out of scope

- Profile tab visual/layout (already updated last turn).
- Any RLS / data / migration changes.
