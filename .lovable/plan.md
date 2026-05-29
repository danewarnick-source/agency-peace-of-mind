## Goal
Restore your super admin dashboard access without broad changes or another bulk security pass.

## What’s broken
Your account is correctly marked as `super_admin` on both organizations, and login succeeds. The failure is happening after login:
- the app requests organization/member data
- those queries hit RLS helper functions
- the backend returns 403 errors like `permission denied for function has_org_role` and `permission denied for function is_org_admin_or_manager`
- because membership/permission queries fail, the UI falls back to employee behavior and hides admin features

## Plan
1. **Fix backend function permissions with a focused migration**
   - Update the helper functions used by RLS (`has_org_role`, `is_org_admin_or_manager`, `is_super_admin`, and any other directly referenced role-check helpers if needed).
   - Grant execution to signed-in users where required by policies.
   - Revoke anonymous execution if it’s currently too open.
   - Keep the change limited to function permissions and function definitions only if needed.

2. **Verify the backend behavior immediately after the migration**
   - Confirm your user still has both `super_admin` memberships.
   - Confirm signed-in users can execute the helper functions.
   - Re-run the relevant read queries to ensure `organization_members` and admin-scoped data no longer return 403.

3. **Validate the dashboard gating path**
   - Re-check the role-loading hooks and guards already in the app (`useCurrentOrg`, `usePermissions`, dashboard layout, and super-admin guard).
   - Only if necessary, make a minimal code fix so the UI waits for role data instead of dropping to employee mode when membership data is temporarily unavailable.

4. **Test the actual super-admin experience**
   - Sign-in flow should land with admin-capable membership data available.
   - Admin sidebar options should render.
   - `/dashboard/super-admin` should no longer redirect or hide behind employee-only gating.

## Technical details
- Current evidence shows this is primarily a backend access-control regression, not a bad role assignment.
- The critical symptom is missing routine grants for role-check functions in the exposed schema.
- The highest-probability fix is a migration that restores execute privileges for authenticated users on the RLS helper functions used inside policies.
- If the UI still misbehaves after that, the fallback path in `useCurrentOrg` / `usePermissions` / `RequirePermission` is the next place to patch surgically.

## Expected outcome
After this fix, your account should load as `super_admin`, the admin sidebar should return, and the super-admin dashboard/features should be accessible again.