## Diagnosis
The most likely remaining loop is in the dashboard shell, not the HIVE Overview page itself.

- `src/routes/dashboard.tsx` still reconciles the current route against `rawView`.
- `src/hooks/use-portal-view.ts` initializes `view` to `"staff"` and only restores the persisted `portal-view` from local storage in an effect after mount.
- For a user like Dane with persisted `portal-view = "hive_exec"`, the first render can still look like `staff` before hydration finishes.
- That means the dashboard shell can briefly treat `/dashboard/hive-exec` as the wrong route and force navigation away, then flip back once the persisted view is restored. That presents as repeated refresh/reload behavior.

The earlier fix covered executive-permission loading, but not portal-view hydration timing.

## Plan
1. **Make portal-view hydration explicit**
   - Update `src/hooks/use-portal-view.ts` to expose a `hydrated`/`ready` flag once local storage has been read.
   - Keep the persisted portal view as the single source of truth; do not change security, org access, or executive checks.

2. **Gate dashboard reconciliation on portal readiness**
   - Update `src/routes/dashboard.tsx` so it does not run the view↔route reconciliation effect until both are true:
     - executive status is resolved
     - portal view has hydrated from storage
   - Extend the dashboard loading guard so it does not render the wrong shell/view for one frame while portal state is still restoring.

3. **Keep the HIVE Executive route stable during login boot**
   - Ensure the dashboard shell does not redirect away from `/dashboard/hive-exec` during the login/bootstrap window just because the pre-hydration default is `staff`.
   - Leave `RequireHiveExecutive`, org membership logic, auth clearing, and security boundaries unchanged.

4. **Validate the exact user flow**
   - Sign in as Dane in preview.
   - Confirm the app settles on `/dashboard/hive-exec` without repeated reloads.
   - Confirm the HIVE Overview renders steadily (header, executive tabs, KPI row, and company list), with no bounce back to `/dashboard`.

## Technical notes
- Files expected: `src/hooks/use-portal-view.ts`, `src/routes/dashboard.tsx`
- No changes planned to RLS, data access, org switching, auth policies, or HR/security gating.
- If a second trigger appears during validation, the next place to inspect would be login-time navigation (`src/routes/login.tsx`) only after the portal hydration fix is proven insufficient.