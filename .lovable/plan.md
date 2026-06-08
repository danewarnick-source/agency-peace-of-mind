## Goal

When a dynamically-imported route chunk fails to load (stale build hash after a deploy or pinned preview), the app currently white-screens with "Something went wrong." Add narrowly-scoped handling that auto-reloads ONCE on that specific error class, while leaving all other errors visible in the existing error boundary.

## Scope

Touch only:
- `src/routes/__root.tsx` — `ErrorComponent` (detect chunk-load class, render friendly recovery UI / trigger reload)
- A new tiny helper `src/lib/chunk-reload.ts` — detection predicate + loop-guarded reload
- `src/routes/__root.tsx` `RootComponent` — install global `error` + `unhandledrejection` listeners (one-time, browser-only)

NOT touched: route definitions, router config, business logic, RLS, data, lazy-loading config. TanStack Router's Vite plugin handles route code-splitting automatically — there is no user-authored `React.lazy` to wrap, so the router's `errorComponent` IS the lazy-import failure surface.

## Detection (chunk-load class only)

A single predicate `isChunkLoadError(err)` matches when ANY of these are true on the error / reason:
- `name === "ChunkLoadError"`
- message includes any of (case-insensitive):
  - `"Failed to fetch dynamically imported module"` (Chrome/Edge)
  - `"error loading dynamically imported module"` (Vite generic)
  - `"Importing a module script failed"` (Safari)
  - `"Unable to preload CSS"` (Vite CSS chunk)
  - `"dynamically imported module"` (defensive catch-all suffix)

Anything else → predicate returns false → existing error boundary renders as today. Real bugs are NOT swallowed.

## Loop guard

`sessionStorage` key `chunk-reload:lastAt` storing a timestamp. `tryAutoReloadOnce()`:
1. If predicate is false → no-op, return false.
2. Read `lastAt`. If `Date.now() - lastAt < 10_000` → already reloaded recently; return false (caller shows manual-refresh UI).
3. Otherwise set `lastAt = Date.now()` and call `window.location.reload()`. Return true.

This guarantees at most one automatic reload per ~10s window per tab, so a persistently-broken chunk cannot infinite-loop.

## Behavior matrix

| Situation | Result |
|---|---|
| Route chunk 404 / network fail, first occurrence | Single full reload → fresh HTML + valid hashes |
| Same chunk fails again within 10s | No reload; friendly card with "Refresh for latest version" button (calls `location.reload()` on click; clears guard key) |
| Any other thrown error (real bug) | Existing `ErrorComponent` UI shows message + "Try again" (unchanged) |
| Background async chunk failure (e.g. preload) reaching `unhandledrejection` | Same one-time reload via global listener |

## Files

### `src/lib/chunk-reload.ts` (new)
Exports `isChunkLoadError(err: unknown): boolean` and `tryAutoReloadOnce(err: unknown): boolean`. Pure browser-safe; guards on `typeof window`.

### `src/routes/__root.tsx`
- `ErrorComponent`: at top, call `tryAutoReloadOnce(error)`. If predicate matches but guard blocked the reload, render a small "New version available — please refresh" card with a Reload button. Otherwise (non-chunk error) render the existing "Something went wrong" UI unchanged.
- `RootComponent`: add a `useEffect` that registers `window.addEventListener("error", …)` and `window.addEventListener("unhandledrejection", …)`, each calling `tryAutoReloadOnce` with the underlying error/reason. Cleanup on unmount. SSR-safe (effect only).

## Verification (after build mode)

1. **Real errors still surface**: temporarily throw `new Error("boundary smoke test")` in a leaf component → confirm existing error UI renders, no reload. Remove the throw.
2. **Chunk-load path**: in DevTools, block `*/assets/*.js` via Network request blocking, navigate to a route → confirm exactly one reload, then unblock → app loads normally.
3. **Loop guard**: keep the block on, trigger again within 10s → confirm friendly "refresh for latest version" card appears instead of another reload.
4. **Happy path**: regular navigation across `/dashboard/*` routes — no behavioral change, no extra reloads, no console noise.

## Out of scope / explicitly NOT doing

- Not changing `errorComponent` on individual routes, router config, or `defaultErrorComponent`.
- Not wrapping any imports in `React.lazy` (router plugin handles splitting).
- Not auto-reloading on generic errors, network errors, API errors, or auth errors.
- Not touching `src/server.ts` / `src/start.ts` / SSR error path.
