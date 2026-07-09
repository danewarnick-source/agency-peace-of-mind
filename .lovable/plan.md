## Problem

`src/components/staff-mobile/staff-mobile-shell.tsx` (line 44) sizes the mobile shell with `fixed inset-0`. On mobile browsers, `fixed inset-0` resolves against the **large viewport** — a static snapshot taken as if the URL/toolbar were hidden. As the address bar collapses and re-expands during scroll, the shell doesn't resize, so the top bar drifts off-screen and the bottom tabs/content misalign.

Modern mobile browsers expose `dvh`/`dvw` (dynamic viewport units) that track the currently-visible area in real time — exactly what this shell needs.

## Fix (frontend CSS only)

In `src/components/staff-mobile/staff-mobile-shell.tsx`, change the outer container's sizing from `fixed inset-0` to a fixed anchor + dynamic viewport dimensions:

```tsx
className="md:hidden fixed left-0 top-0 z-30 h-[100dvh] w-[100dvw] flex flex-col overflow-hidden bg-background"
```

- `fixed left-0 top-0` — same top-left anchor as `inset-0`.
- `h-[100dvh]` — height tracks the browser's live visible area (shrinks/grows with the URL bar).
- `w-[100dvw]` — width tracks the live visible width.

No other files change. The internal flex layout (top bar → main → active-shift bar → bottom tabs) already flows from that container, so once the outer height becomes dynamic, every child aligns correctly on scroll. No JS listeners, no CSS custom-property hack, no changes to overlays or portals.

## Verification

- On a phone (or DevTools mobile emulator with a simulated address bar), scroll a long staff page: the top bar stays pinned to the visible top edge and the bottom tabs stay pinned to the visible bottom edge as the address bar collapses/expands.
- Desktop is unaffected (`md:hidden` still hides the shell above `md`).
- Overlays/bottom sheets still portal into the shell container — behavior unchanged.
