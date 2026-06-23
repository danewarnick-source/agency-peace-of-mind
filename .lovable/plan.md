## Goal
Replace the bare-bones HTML fallback used when SSR catastrophically fails (`src/lib/error-page.ts`) with a clearer, on-brand "preview/build failure" page that explains what's happening and offers a retry.

## Scope
Frontend-only. No route, backend, or routing changes. Existing wiring in `src/server.ts` (`brandedErrorResponse`) and `src/start.ts` (`errorMiddleware`) already serves whatever `renderErrorPage()` returns — we just upgrade that HTML.

## Changes

**`src/lib/error-page.ts`** — rewrite `renderErrorPage()` to return a self-contained HTML document (no external CSS/JS, since this fires when the app bundle itself may have failed) with:
- HIVE-aligned dark header band using the existing brand color `#0d112b` (already used in `__root.tsx` theme-color and the mobile shell).
- Clear copy: title "This preview didn't load", short explanation that the latest build may still be deploying or hit an error, and that retrying usually resolves it.
- Two actions:
  - Primary: **Try again** → `location.reload()`.
  - Secondary: **Go home** → `href="/"`.
- A small auto-retry helper: on first load, sets a `sessionStorage` flag and reloads once after ~4s; on the second hit (flag present) it stops auto-retrying and just shows the manual buttons. Mirrors the loop-guard pattern already used in `src/lib/chunk-reload.ts` so we don't create a refresh loop.
- Inline system-font styles, mobile-friendly, no external requests.

**No other files change.** Routes, `__root.tsx` `ErrorComponent`, and the chunk-reload behavior stay as-is — those already handle in-app React errors; this plan only improves the hard-failure SSR fallback.

## Verification
- Visually load `/` after temporarily forcing `brandedErrorResponse()` in dev (manual check) — page renders with brand color, copy, and both buttons.
- Click **Try again** reloads; **Go home** navigates to `/`.
- Auto-retry fires once then stops (no infinite reload loop) — confirmed via the `sessionStorage` guard.
- No new network requests from the error page (fully inline).
