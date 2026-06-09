## Problem

Clicking "Review placement" on the Smart Import summary updates the URL to `/dashboard/smart-import/<jobId>/review`, but the visible page stays on the Smart Import landing screen. Same root cause will affect `…/done` and `…/history`.

## Why

`src/routes/dashboard.smart-import.tsx` has child routes in the file tree:

```text
dashboard.smart-import.tsx                  ← parent
dashboard.smart-import.$jobId.review.tsx    ← child
dashboard.smart-import.$jobId.done.tsx      ← child
dashboard.smart-import.history.tsx          ← child
```

In TanStack's flat file routing this makes `dashboard.smart-import.tsx` a layout for its children. A layout MUST render `<Outlet />` for child routes to appear. The current file renders the landing UI directly with no `<Outlet />`, so child routes match the URL but render nowhere — the parent UI stays mounted.

## Fix (smallest, conventional)

Split the parent into a real layout + an index route. No logic changes.

1. Create `src/routes/dashboard.smart-import.index.tsx` containing the current landing/summary page (everything that's in `dashboard.smart-import.tsx` today — `SmartImportPage`, `SummaryView`, helpers, imports). This becomes the `/dashboard/smart-import` route.

2. Replace `src/routes/dashboard.smart-import.tsx` with a minimal pathless layout:

   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/dashboard/smart-import")({
     component: () => <Outlet />,
   });
   ```

That's it. The router auto-regenerates `routeTree.gen.ts`.

## What this fixes

- `Review placement` → renders `dashboard.smart-import.$jobId.review.tsx`.
- `…/done` → renders the Done page (post-commit screen, undo, etc.).
- `Import history` link → renders the History page in place instead of falling back to the landing UI.
- Landing UI at `/dashboard/smart-import` is unchanged (now served by `…index.tsx`).

## Out of scope

- No changes to RLS, upload paths, server functions, or any review/done/history page logic.
- No new routes or features.

## Verification

- Visit `/dashboard/smart-import` → landing page renders (unchanged).
- Upload a doc, click `Review placement` → review page renders at `/dashboard/smart-import/<jobId>/review`.
- Click `Import history` → history page renders at `/dashboard/smart-import/history`.
- After commit, Done page renders at `/dashboard/smart-import/<jobId>/done`.