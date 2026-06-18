## What's happening

The preview is showing "not built yet" / blank because two things stacked up:

1. **You're on `/api/public/hooks/billing-daily-check`** — that's a server-only API endpoint (webhook), not a UI page. TanStack tries to hydrate the SPA there, finds no matching page route, and throws `Expected to find a match below the root match in SPA mode`.
2. **Vite's dev module cache is stale** after the recent reload — the client can't fetch `virtual:tanstack-start-client-entry`, so the bundle never finishes loading and you see the unbuilt state.

No code is actually broken — `curl http://localhost:8080/` returns a fully rendered home page.

## Fix

1. Flush the Vite HMR gate so the client picks up the current module graph:
   `curl -sf -X POST http://localhost:8080/__hmr_flush`
2. If still wedged after the flush, restart the dev server once via `code--restart_dev_server`.
3. Navigate the preview back to a real UI route (e.g. `/` or `/dashboard`) instead of `/api/public/hooks/billing-daily-check`. API routes will always look "broken" in the preview pane because they're meant to be called by external services, not viewed.
4. Confirm with `preview_control--get_preview_health` — expect `healthy`.

No source files change.
