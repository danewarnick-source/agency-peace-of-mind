## Problem

`/dashboard/workspace/$clientId` crashes with **React error #310** ("Rendered more hooks than during the previous render").

In `src/routes/dashboard.workspace.$clientId.tsx` two hooks — `useClientFeature(client, "emar")` and `useQuery({ queryKey: ["workspace-bs-tab", …] })` — are called **after** the `if (isLoading || !client) return …` early return. On the first render `client` is null, the function returns early, and those hooks never run. As soon as the caseload resolves and `client` becomes truthy, React sees two new hooks appear in the render and throws #310.

## Fix

Move every hook call above the early return. Specifically, in `src/routes/dashboard.workspace.$clientId.tsx`:

1. Move `const { enabled: emarEnabled } = useClientFeature(client, "emar");` up to sit with the other hooks (right after `useTodayShifts` / `effectivePresetCode`). `useClientFeature` must accept a possibly-null client; if it doesn't already, pass `client ?? null` and gate the result with `client ? emarEnabled : false`.
2. Move the `useQuery` that powers `bsTab` up to the same hook block, and set `enabled: !!client?.id` on the query so it doesn't fire until the client is loaded. Keep its `queryFn` reading `client.id` only when enabled.
3. Leave the `if (isLoading || !client) return …` early return where it is, but now *below* all hook calls.
4. No other behavior changes — tabs, gating logic, and rendering stay identical.

## Why not the other route changes

This crash is unrelated to the incident-wizard work. The workspace route hasn't changed recently; the bug was latent and only triggers when the caseload query flips from loading to loaded on this screen. One small reordering fixes it.

## Verification

After the edit, hard-reload `/dashboard/workspace/<clientId>?tab=forms`. The page should render the client header + tabs instead of the error boundary, and the console should be free of #310.
