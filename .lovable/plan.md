1. Reset the preview entry away from the webhook route `/api/public/hooks/nectar-schedules` and back to a user-facing route such as `/login`, `/admin`, or `/dashboard`.
2. Verify whether the portal loads normally once the preview starts on an app route instead of a public hook endpoint.
3. Reproduce the `Invariant failed` runtime error on the actual portal route and capture the exact route/component responsible.
4. Inspect the portal entry chain only: `src/routes/admin.tsx`, `src/lib/role-entry.tsx`, auth/bootstrap redirects, and any route navigation logic involved in entering HIVE.
5. If the issue is preview/session routing only, apply the smallest route/preview-safe fix so the editor opens into the portal again.
6. If the issue is real app code, identify the exact file and error source before any broader changes.

Technical details
- Current session replay shows the preview opening at `https://id-preview--.../api/public/hooks/nectar-schedules`, which is a webhook endpoint, not the HIVE portal.
- The portal routes still exist in the codebase: `/login`, `/admin`, and `/dashboard`.
- Separate signal present: a client runtime error `Invariant failed` in the preview bundle, which likely needs to be traced from the portal entry path after the preview is pointed at the correct route.