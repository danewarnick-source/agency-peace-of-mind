## Issue

Vite log shows a stale transform error from the previous broken paste:

```
Error transforming route file /dev-server/src/routes/dashboard.scheduling.tsx:
SyntaxError: Missing semicolon. (492:10)
```

That error was emitted before the file was rewritten with valid TSX. The route IS registered in `routeTree.gen.ts` (`/dashboard/scheduling` → `DashboardSchedulingRoute`), and the file now parses cleanly. The dev server just hasn't recovered from the prior failed transform, so the route module is still missing from the running bundle — which is why clicking the sidebar link renders "Not Found".

## Fix

1. Restart the Vite dev server to force a clean re-transform of `dashboard.scheduling.tsx` and regenerate the route tree.
2. Reload the preview at `/dashboard/scheduling` and confirm the page renders (no "Not Found", no console error).
3. If a transform error reappears, capture the new line/column from the vite log and fix that specific syntax issue in the route file.

No code changes are expected — this should be a dev-server recovery. Only edit the file if step 2 surfaces a real new error.