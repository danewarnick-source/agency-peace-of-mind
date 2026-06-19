## What's actually broken

**1. Signup page (first screenshot — `/signup` inside the editor preview)**
The header on `src/routes/signup.tsx` is a single non-wrapping flex row:

```tsx
<header className="mb-8 flex items-center justify-between">
  <Brand />                                  // "HIVE — powered by NECTAR™"
  <Link to="/login">Already have an account? Sign in</Link>
</header>
```

At the ~546px viewport in your screenshot, both children are too wide to sit side-by-side, so the right link collides into the brand and the line reads `HIVE — powered by NECTAR™Already have an account? Sign in`. This is a pure layout bug — nothing to do with the build.

**2. `preview--agency-peace-of-mind.lovable.app` (second screenshot)**
That hostname is the **published** site, not the live editor preview. "Preview has not been built yet" on that URL means the last publish either failed or has never happened for this project — the editor preview itself is healthy (confirmed in prior turns, and you can see it rendering in screenshot 1). There is no code fix for this; it has to be republished from the Publish dialog.

## Fix

### A. Make the signup header responsive (code change)
In `src/routes/signup.tsx`, change the header so it stacks on mobile and only sits inline at `sm:` and up. Per project mobile rule (stack with `flex-col`, switch to `sm:flex-row`).

```tsx
<header className="mb-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
  <Brand />
  <Link to="/login" className="text-sm text-white/60 hover:text-white">
    Already have an account?{" "}
    <span className="font-medium text-[#f4a93a]">Sign in</span>
  </Link>
</header>
```

Quick visual check after flush: header reads as two clean lines on mobile, single row on ≥640px. No other signup logic touched.

### B. Republish to fix the public URL (no code)
Open the **Publish** dialog (top-right) and click **Update** / **Publish**. Frontend changes only deploy to `*.lovable.app` after this — `preview--agency-peace-of-mind.lovable.app` will then serve the current build instead of the placeholder. If publish errors, share the error and I'll diagnose.

## Scope
- Edit: `src/routes/signup.tsx` (header element only, lines ~268–273).
- No backend, no other routes, no router/build changes.
