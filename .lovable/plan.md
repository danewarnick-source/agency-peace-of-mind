## What
After a client is permanently deleted, the page currently leaves the user on the deleted client's detail view. Change it so the app navigates to the main clients page (`/dashboard/hub/clients`) as soon as deletion succeeds.

## Where
- `src/routes/dashboard.clients.tsx` — contains the `<LifecyclePanel>` used to delete the active client.

## How
1. Verify `useNavigate` is already imported in `dashboard.clients.tsx`.
2. Add a `navigate` call inside the `LifecyclePanel` `onDone` prop (only on permanent delete; `archive` can continue to keep the user in place or also redirect).
3. Use the TanStack Start pattern: `navigate({ to: "/dashboard/hub/clients" })`.
4. Keep the existing query invalidation logic intact so the client list refreshes.

## Definition of done
- Deleting a client from the client detail page redirects to `/dashboard/hub/clients`.
- No dead detail view remains after deletion.
- Build passes and route types remain valid.