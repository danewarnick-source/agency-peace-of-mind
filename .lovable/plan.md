## Diagnosis

I checked the actual state of the project and found nothing broken:

- `bun run build:dev` completed successfully (`✓ built in 38.41s`, no errors, full SSR + client bundles emitted).
- The dev server at `http://localhost:8080/` returns **HTTP 200** with a fully rendered landing page (HIVE marketing site).
- Dev-server logs contain only deprecation warnings (`inputValidator` → `validator`) — no errors, no failed compilations, no exceptions.

There is no current build failure or runtime error to fix. The "preview not built" label is coming from Lovable's preview chrome, not from the app itself.

## Most likely cause

A transient Vite dev-server state (stale module graph or a wedged preview after recent edits to `routeTree.gen.ts` / `types.ts` / migration churn). The fix in that case is to bounce the dev server — not to change code.

## Plan

1. **Restart the Vite dev server** in the sandbox (using `code--restart_dev_server`). This re-runs the TanStack Router plugin, re-generates `routeTree.gen.ts`, and re-mounts the preview without touching any files.
2. **Re-probe** `http://localhost:8080/` to confirm it still returns 200 after restart.
3. **Report back** with the result. If after restart you still see "preview not built", I'll need one more piece of info from you to go further:
   - exact text shown on the preview, and
   - the route you're on when it appears.
   That tells me whether it's the Lovable preview chrome, a blank SSR response, a 500 error page, or stale published content — each has a different fix and I shouldn't guess.

## What I will NOT do in this step

- No code edits. The build is green; editing files to "fix" a non-existent build error risks breaking the things that currently work (recent attestation feature, `mar-emar-tab.tsx` scope fix, HIVE-exec org-name edit).
- No migration changes, no `routeTree.gen.ts` edits, no `types.ts` edits.
- No republish (the project is currently unpublished per project info).
