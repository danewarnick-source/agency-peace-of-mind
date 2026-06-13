## Diagnosis

The preview shows "preview has not built yet" because the Vite dev server in the sandbox is not responding (`curl localhost:5173` → 000, no connection). The log shows only deprecation warnings (no fatal errors) and the last activity was at 8:27 PM, so the process is wedged rather than crashed on a syntax error. Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are present and correct.

## Fix

1. Restart the Vite dev server via `code--restart_dev_server`.
2. Re-check `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` returns 200, and tail `/tmp/dev-server-logs/dev-server.log` for any new fatal errors.
3. If it comes back up, done — preview will render. If it crashes on startup, read the new error and fix the offending file (most likely a stale build artifact from the recent `celebrations.functions.ts` / `dashboard.workspace.$clientId.tsx` edits).

No source-code changes are expected — this is a stuck dev-server process, not a code bug.