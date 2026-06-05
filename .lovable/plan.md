## Plan

1. Make dashboard boot state deterministic across logout/login
- Treat persisted dashboard preferences as session-scoped for routing purposes.
- Clear or reset the saved portal view when a user signs out or when the authenticated user identity changes, so a stale prior-session `hive_exec` preference cannot steer the next login before fresh auth/org checks finish.
- Keep any non-routing preferences that should survive untouched.

2. Stop using an unconditional login redirect target
- Replace the current login-page behavior that always navigates authenticated users to `/dashboard`.
- Route post-login based on confirmed state: auth ready, portal state hydrated, executive status resolved, and current allowed view.
- Ensure executives can land directly in HIVE Executive when appropriate without a `/dashboard` ↔ `/dashboard/hive-exec` tug-of-war.

3. Harden the dashboard shell against cross-session stale view state
- Update the `/dashboard` layout so route reconciliation only runs after all required bootstrap signals are ready, including the persisted view and any user-scoped reset that happens after logout/login.
- Prevent the shell from redirecting away from `/dashboard/hive-exec` during the brief window where auth has returned but view/org state is still catching up.
- Avoid any effect that can keep rewriting the route on every auth/bootstrap pass.

4. Validate the exact failure case
- Reproduce the sequence: sign in as Dane, sign out, sign back in, and confirm the app settles once.
- Verify both routes remain stable:
  - `/dashboard` for non-exec/staff/admin flows
  - `/dashboard/hive-exec` for executive flow
- Confirm no repeated full-page refreshes, no bouncing between dashboard surfaces, and no regression in sign-out behavior.

## Technical details
- Files likely involved:
  - `src/routes/login.tsx`
  - `src/routes/dashboard.tsx`
  - `src/hooks/use-auth.tsx`
  - `src/hooks/use-portal-view.ts`
  - `src/hooks/use-org.tsx`
- Current likely trigger:
  - `login.tsx` always sends an authenticated user to `/dashboard`.
  - `use-portal-view.ts` persists `portal-view` across sessions.
  - `dashboard.tsx` then reconciles the route back toward `/dashboard/hive-exec` when persisted state says `hive_exec`.
  - Because sign-out does not reset that routing preference, the next login can replay the same race and loop again.
- Scope: routing/bootstrap only. No backend permissions, role policies, or executive-access rules will be changed.