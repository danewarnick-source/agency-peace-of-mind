## Goal
Clean up your account `danewarnick@gmail.com` so it only belongs to **True North Supports LLC** as Super Admin.

## Current state (from DB)
- **Acme Healthcare** — role: `super_admin`, active ✅
- **True North Supports LLC** — role: `admin`, active ✅

So today, when the app's deterministic org picker runs, Acme can win (both are non-demo, and `super_admin` outranks `admin`). That's why you're landing in Acme.

## Changes
1. Delete your `organization_members` row in **Acme Healthcare** (full removal, not just deactivate — you said "deleted or taken off").
2. Update your **True North Supports LLC** membership: `role = 'super_admin'`.
3. No schema changes. No other users touched. No other orgs touched.

## After
- Only one membership remains: True North Supports LLC as Super Admin.
- Next login lands you directly in True North with full Super Admin access.
- You may want to clear the persisted `hive.activeOrgId` in localStorage if the browser still tries to open Acme — easiest is just to log out and back in.

## Note
This only affects YOUR user. Acme Healthcare org and its other members stay intact. If you'd also like Acme Healthcare itself removed (it looks like seed/demo data), tell me and I'll add that as a follow-up.
