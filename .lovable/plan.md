## Root cause

Dane is both a `super_admin` of an org AND a HIVE Executive, and his browser has `portal-view=hive_exec` persisted in localStorage from a prior session.

In `src/routes/dashboard.tsx` (lines ~125–184) the layout computes:

```ts
const allowedViews: PV[] = ["staff"];
if (isAdminCapable) allowedViews.push("admin", "staff_mobile");
if (isExecutive)    allowedViews.push("hive_exec", "state_preview");   // ← gated on isExecutive
const rawView = allowedViews.includes(view) ? view : "staff";
const isHiveExecView = rawView === "hive_exec";
```

and a reconciler effect:

```ts
useEffect(() => {
  if (isHiveExecView && !pathname.startsWith("/dashboard/hive-exec")) navigate({ to: "/dashboard/hive-exec" });
  else if (!isHiveExecView && !isStatePreview && pathname.startsWith("/dashboard/hive-exec")) navigate({ to: "/dashboard" });
}, [isHiveExecView, isStatePreview, pathname, navigate]);
```

`isExecutive` comes from `useIsHiveExecutive()`, which returns `false` whenever the query is **loading** (initial fetch, refetch after `queryClient.clear()` in `use-auth`, window-focus refetch, etc.).

Sequence on login:
1. Mount: `view="staff"` (initial). Render at `/dashboard` → caseload.
2. `usePortalView` effect reads localStorage → `view="hive_exec"`.
3. Exec query still loading → `isExecutive=false` → `hive_exec` is stripped from `allowedViews` → `rawView` falls back to `"staff"` → `isHiveExecView=false`. Still on `/dashboard`. Caseload renders.
4. Exec query resolves true → `isHiveExecView=true` → effect redirects to `/dashboard/hive-exec` → HIVE Overview renders.
5. `useAuth`'s `onAuthStateChange` (TOKEN_REFRESHED, second `INITIAL_SESSION`, or any user-id transition during boot) calls `queryClient.clear()` → exec query is dropped → `isExecutive=false` again → `isHiveExecView=false` → effect sees we're on `/dashboard/hive-exec` and bounces back to `/dashboard` → caseload renders.
6. Exec query resolves true again → back to HIVE Overview. Loop.

The reconciler does not consider the loading state of the executive check, so every flicker of `isExecutive` causes a real navigation, and the page oscillates.

## Fix

Treat the executive check's loading state as "undetermined" and do not reconcile view↔route while it's unknown. Frontend-only; no RLS/security/data changes.

### Edits

**1. `src/routes/dashboard.tsx`**

- Destructure `isLoading` from `useIsHiveExecutive` (rename to `execLoading` locally).
- While `execLoading` is true, treat `hive_exec` and `state_preview` as still allowed in `allowedViews` (preserve the persisted view instead of demoting to staff), OR equivalently skip the reconciler effect entirely until known.
- Gate the reconciliation effect on `!execLoading`:

  ```ts
  useEffect(() => {
    if (execLoading) return;
    if (isHiveExecView && !pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard/hive-exec" });
    } else if (!isHiveExecView && !isStatePreview && pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard" });
    }
  }, [execLoading, isHiveExecView, isStatePreview, pathname, navigate]);
  ```

- Also include `execLoading` in the initial `Loading…` gate so the layout doesn't render a "wrong" sidebar/page for one frame on first load when the persisted view is `hive_exec`/`state_preview`:

  ```ts
  if (loading || !session || execLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  ```

That eliminates the flicker: the route is only changed once the executive status is known, and any later refetch of the exec query keeps the cached `true` (react-query keeps `data` during background refetches), so `isExecutive` won't flap.

### Out of scope

- No changes to `useIsHiveExecutive`, `useAuth`, `useCurrentOrg`, or `RequireHiveExecutive`.
- No changes to RLS, server functions, HR/PII gating, or the registry.
- Don't clear the user's persisted `portal-view`; we just stop reacting to it before we know the user's executive status.

## Verification

1. Sign in as `danewarnick@gmail.com`.
2. Expect: a brief "Loading…" → land directly on **HIVE Overview** (because his persisted view is `hive_exec`) with no flicker back to My Caseload. If his persisted view is staff/admin, lands there with no flicker.
3. Switch portal view back and forth via the sidebar switcher — still works (the reconciler still runs once exec status is known).
4. Sign out and sign in as a non-executive user → no HIVE pages ever appear; lands on the role-appropriate dashboard.
