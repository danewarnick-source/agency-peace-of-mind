## What's actually happening

- Login is working. Auth logs show successful sign-ins for `admin@tnsutah.com` (email at 15:56 UTC, Google at 16:00 UTC), both returning HTTP 200. You reached `/dashboard/hive-exec` — you couldn't have if login were broken.
- The "Something went wrong / Failed to fetch dynamically imported module …/assets/dashboard-CHgxu-ZX.js" message is a **stale-asset error**: the page's HTML is referencing a JavaScript chunk hash from a previous build that no longer exists.
- The preview tab in the screenshot is labeled "Previewing last saved version" and is on `id-preview--…lovable.app`. That URL serves a **frozen saved snapshot** whose HTML is pinned to old asset hashes. A hard refresh re-downloads the same pinned HTML, so it keeps requesting the missing chunk.
- No code change will fix the saved snapshot — it's immutable. The current dev build and the next saved version are fine.

## Code audit (confirming nothing is actually broken)

- `staff_certifications` was dropped from the database, but the two remaining string references in `src/lib/internal-audit.functions.ts` and `src/routes/dashboard.internal-audit.tsx` are just an audit-category label; the underlying query reads `external_certifications`. No broken import.
- Dev-server log shows only the standard "route file exports won't be code-split" warnings — no build failures.
- No service worker / PWA in `public/` to cause a phantom cached chunk.

## Fix (no code changes)

1. Switch the preview off "last saved version" — click the version dropdown at the top-left of the chat panel and pick **"Latest"** (or just open the live preview from the chat header). The live dev preview rebuilds chunks on every change, so it won't 404.
2. If you specifically need a stable URL to share, **save a new version** (or republish). The new snapshot will be built against the current code and its HTML will reference fresh, valid chunk hashes.
3. Optional sanity check: open `/dashboard/hive-exec` on the live preview URL after switching — it should render without the error screen.

## What I will NOT change

- No edits to auth code, the hive-exec route, the dropped-table cleanup, or any chunking/build config — none of those are the cause.

If after switching to the latest preview you still get the same error on `/dashboard/hive-exec`, send me a fresh screenshot from the live URL and I'll investigate as a real runtime issue (likely a runtime throw in a child component) rather than a stale-snapshot one.