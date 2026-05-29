
## Scope

Two files only. No logic, query, state, or structural changes.

## 1. `src/routeTree.gen.ts` — no change

Already contains `DashboardSchedulingRoute` import + `.update({ id:'/scheduling', path:'/scheduling', ... })` + entries in `FileRoutesByFullPath`, `FileRoutesById`, `fullPaths`, `to`, `id`. The "not found" is a stale dev cache; restarting the dev server after the file edits below will pick it up. This file is auto-generated and should not be hand-edited.

## 2. `src/routes/dashboard.tsx` — one line

Line 41: remove the `📅 ` prefix from the Scheduling nav label.

```text
{ to: "/dashboard/scheduling", label: "Scheduling", icon: CalendarDays },
```

## 3. `src/routes/dashboard.scheduling.tsx` — remove emojis only

Targeted text-only edits:

- Line 375: drop the `✓ ` before "Duration:".
- Line 587: change `` `✅ ${unpublished.length} shift…` `` to `` `${unpublished.length} shift…` ``.
- Line 624: `<h1>📅 Scheduling</h1>` → `<h1>Scheduling</h1>`.
- Scan the remaining lines in the file (846–907 not yet viewed) for any other emoji in: ShiftCard JSX, "All Shifts This Month" h3, empty-state heading, "Publish All Shifts" button, DialogTitle, SHIFT_TYPES labels, stats strip, toast strings — strip any found, keep text intact.

Nothing else changes: no imports removed, no STATUS_STYLES/SHIFT_TYPES/RECURRENCE_OPTIONS values changed (they're already plain text), no query/mutation/handler edits.

## Verify

After edits, restart the dev server so `/dashboard/scheduling` resolves through the existing route registration, and confirm the page renders with no emoji characters.
