## Problem
The static preview build (`preview--agency-peace-of-mind.lovable.app`) is failing with **"JavaScript heap out of memory"** during `vite build`. Node's default ~3 GB heap is exhausted while bundling the project: **154 route files** + the full Cloudflare worker bundle for Tanstack Start.

The live sandbox preview (the iframe in Lovable) works because `vite dev` is incremental and never bundles everything at once. The static preview URL serves a built artifact — when the build OOMs, you get the "Preview has not been built yet" screen.

There's no code-level bug. The project just grew large enough that the bundler needs more memory.

## Fix
Bump the Node heap for the build by setting `NODE_OPTIONS=--max-old-space-size=8192` in `package.json` build scripts:

```json
"build":     "NODE_OPTIONS=--max-old-space-size=8192 vite build",
"build:dev": "NODE_OPTIONS=--max-old-space-size=8192 vite build --mode development",
```

This is the standard remediation for large TanStack Start / Vite projects and what's needed for ~150+ routes. No code changes, no route changes.

## Verify
After the change, run `bun run build` in the sandbox to confirm the production build completes; once it succeeds, the static preview rebuilds on the next push and stops showing the "not built yet" screen.

## Out of scope
- I am NOT removing routes, splitting the app, or refactoring imports — the existing route layout is intentional.
- I am NOT touching the live sandbox preview (it's already working).
- No SQL, no schema, no UI changes.
