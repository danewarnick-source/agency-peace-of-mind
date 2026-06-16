Change the default state of every job/billing code section on `/dashboard/scheduler` so they render collapsed on initial load. Users will click each section header to expand it as needed.

### What to change
- In `src/routes/dashboard.scheduler.tsx`, the `CodeSection` component initializes its collapse state with `useState(true)` (line 389). Flip this to `useState(false)` so all authorized-code sections start collapsed.
- The header button (with the chevron, code badge, label, and client count) remains clickable and toggles the section open/closed, preserving the existing animation and layout.
- No other logic changes: the dynamic filtering that only shows codes current clients are authorized for, the RHS home toggle, and the day/week/month views all stay exactly the same.

### Verification
- Open the scheduler and confirm each job/billing code card shows only its header bar by default.
- Confirm clicking a header expands the card and reveals the schedule grid for that code.
- Confirm clicking again collapses it back.
- Check that no console errors appear and the build stays green.