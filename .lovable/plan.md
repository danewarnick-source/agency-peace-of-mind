## Diagnosis

The dev server is healthy:
- `curl http://localhost:8080/` → **200 OK**
- Logs show only `inputValidator() is deprecated` warnings (non-fatal, cosmetic) — no syntax errors, no module resolution failures, no crashes.
- Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are present.

The "preview has not built yet" banner you saw was the **transient state during the last dev-server restart**. The build has since completed and the preview is serving.

## Action

1. Reload the preview panel in your browser. It should render now.
2. If it still shows the banner after a hard refresh, tell me and I'll dig into the iframe / preview-proxy layer rather than the dev server itself.

No source-code changes are warranted — there is no bug to fix.

## Optional cleanup (separate task, not part of this fix)

The logs are noisy with TanStack's `createServerFn().inputValidator()` → `.validator()` rename. That's a project-wide find/replace across `src/lib/*.functions.ts`. Say the word and I'll do it as its own plan; it is unrelated to the preview banner.
