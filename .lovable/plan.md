# Fix: Hoist `SidebarBody` to a stable module-level component

## Goal

Stop the dashboard sidebar from unmounting and remounting on every parent re-render. This is what was making sidebar nav clicks fail intermittently throughout the session.

## Scope (only this)

- Move `SidebarBody` out of `DashboardLayout` in `src/routes/dashboard.tsx` to a top-level component in the same file.
- Pass everything it needs as explicit props.
- Remove the two `[DIAG-SIDEBAR]` instrumentation blocks added during diagnosis.

## Not in scope (deferred, per user)

- No changes to `refetchOnWindowFocus` on `useCurrentOrg` or `CelebrationProvider`.
- No memoization of the `nav` array.
- No changes to security policies, storage buckets, FKs, Financial tab, or any other file.

## Implementation

### 1. Remove temporary instrumentation in `src/routes/dashboard.tsx`

- Delete the render-rate logger block (the `if (typeof window !== "undefined") { … __dashRenders … }` block at the top of `DashboardLayout`).
- Delete the capture-phase `pointerdown` probe `useEffect` (the one that logs `[DIAG-SIDEBAR] pointerdown in sidebar area`).

### 2. Hoist `SidebarBody`

Move the `SidebarBody` arrow function out of `DashboardLayout` and define it at module scope as `function SidebarBody(props: SidebarBodyProps) { … }`.

Define a `SidebarBodyProps` type for everything currently captured from the closure:

```text
SidebarBodyProps {
  // identity / role
  user, role, isAdminCapable, isExecutive, isHiveExecView,

  // view + state controls
  rawView, setView,            // portal-view select
  isStatePreview,              // toggles state-picker block
  stateCode, setStateCode,
  subView, setSubView,
  states, currentPreviewState,

  // nav data (already computed in DashboardLayout)
  nav: NavItem[],
  showNectarCluster: boolean,  // === (effectiveView === "admin")
  pathname,

  // actions
  signOut: () => Promise<void>,
  onNavigate?: () => void,     // used by the mobile Sheet to auto-close
}
```

Inside the hoisted `SidebarBody`:

- Render the HIVE header, Portal View select, State picker, primary nav list, NECTAR cluster (only when `showNectarCluster`), and the bottom user/org/sign-out block — identical JSX to today, just reading from `props` instead of closure.
- The `<OrgSwitcher />` keeps using its own `useCurrentOrg`/`useMyMemberships` hooks — no prop drilling needed for it.

### 3. Update both call sites in `DashboardLayout`

Compute the props once in the parent, then pass them to both renders so desktop sidebar and mobile Sheet share the same stable component instance:

```text
<aside …>
  <SidebarBody {...sidebarProps} />
</aside>
…
<SheetContent …>
  <SidebarBody {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
</SheetContent>
```

`signOut` stays defined in `DashboardLayout` (it uses `navigate`) and is passed in.

### 4. Verification checklist (manual smoke + code review)

After the edit:

- Build passes (harness runs it automatically).
- Desktop sidebar nav: every tab clicks on the first try, repeatedly, while the page sits idle (no more random misses).
- Mobile Sheet (md breakpoint, hamburger): opens, nav items click, `onNavigate` closes the sheet.
- Portal View `<Select>` switches between Staff / Admin / Staff Mobile / HIVE Executive / State Build-Preview as before.
- State Build/Preview sub-panel: state picker dropdown, Admin/Staff sub-view toggle, and "Edit … template" link all still work.
- Role-gated items still filter (`nav` is computed in the parent with `can()` + role checks; `SidebarBody` just renders the array it gets).
- `OrgSwitcher` still shows the active org, lets multi-org users switch, and `DemoBadge` still renders for sandbox orgs.
- Sign-out button signs out and redirects to `/`.
- No `[DIAG-SIDEBAR]` log lines remain in the console.

## Files touched

- `src/routes/dashboard.tsx` — only this file.
