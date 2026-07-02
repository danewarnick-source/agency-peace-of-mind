# Respect Portal View on /dashboard/hive-training

The training page currently branches on the real DB role (`org.role`), so a Company Admin who flips the sidebar's **Portal View** to "Staff View" still sees the admin storefront. Fix: also consult `usePortalView()` and force `StaffView` when the admin has explicitly switched to staff.

## Change

In `src/routes/dashboard.hive-training.index.tsx`, `HiveTrainingHub()`:

1. Import `usePortalView` from `@/hooks/use-portal-view`.
2. Replace:
   ```ts
   const isAdmin = ["admin","manager","super_admin"].includes(org.role);
   ```
   with:
   ```ts
   const { view, hydrated } = usePortalView();
   const realIsAdmin = ["admin","manager","super_admin"].includes(org.role);
   const isAdmin = realIsAdmin && view !== "staff" && view !== "staff_mobile";
   ```
3. While `!hydrated`, show the existing spinner so we don't flash the wrong view.
4. Header subtitle: when `realIsAdmin && !isAdmin`, append a small muted "Previewing as staff" pill so admins know the toggle is what changed the page.

That's the whole fix — StaffView already exists and handles the learner surface correctly (assignments only, no storefront, no roster).

## Note on AutoRenewCard

The AutoRenewCard added in the previous turn is already wired inside `AdminView`. The screenshots predate that build. Once the preview rebuilds, admins on the admin surface will see it above "Renewals coming up." No additional work needed.

## Out of scope

- No changes to StaffView, storefront, renewals, roster, or edge functions.
- No new hooks or DB.
