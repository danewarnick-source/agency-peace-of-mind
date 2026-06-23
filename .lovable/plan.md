## Plan

Fix the client directory navigation so selecting a client reliably opens that client’s profile.

### Changes
1. In `src/routes/dashboard.clients.tsx`, keep the client name as a real TanStack `<Link>` to `/dashboard/clients/$clientId` with `tab=overview`.
2. Strengthen the row click fallback so clicks anywhere else in the row navigate, while clicks on controls, menus, buttons, inputs, or marked no-navigation areas do not.
3. Keep intake chip/action cells marked as no-row-navigation so those controls remain usable without accidentally opening the profile.
4. Do not change profile layout, profile data queries, backend rules, or routing files.

### Verification
- Clicking the client name opens `/dashboard/clients/<clientId>?tab=overview`.
- Clicking another non-control part of the row also opens the profile.
- Clicking intake actions does not navigate.
- Keyboard focus on the client name followed by Enter opens the profile.