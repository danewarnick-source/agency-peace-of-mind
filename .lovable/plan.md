
## Goal

Replace the current warm cream + iridescent teal/violet/peach theme with a strict "Trust & Precision" professional blue system. Pure visual skinning — no logic, hooks, queries, routing, or handlers touched.

## Design tokens (the source of truth)

Rewrite `src/styles.css` `:root` and `.dark` blocks only. All other files inherit automatically.

- Structural anchor (sidebar, dark surfaces): Deep Indigo Navy `#0F172A` / `#1E293B`
- Primary action (buttons, focus rings, active toggles): Electric Cobalt `#2563EB`, hover `#3B82F6`
- Secondary text / borders / dividers: Slate `#475569` / Steel `#64748B`
- Canvas: Off-White Ice `#F8FAFC`, raised surface `#F1F5F9`, card `#FFFFFF`
- Semantics retuned to cooler hues: success `#059669`, warning `#D97706`, destructive `#DC2626`
- Gradients: replace `--gradient-life` / `--gradient-brand` / `--gradient-hero` with subtle navy→cobalt washes (kept so existing utility class references don't break)
- Radius: unify `--radius` to `0.625rem` (10px) so `rounded-lg` = 8px and `rounded-xl` = 12px land in the 8–12px target
- Shadows: `--shadow-card` / `--shadow-soft` rewritten as low-opacity navy ambient (e.g. `0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)`); `--shadow-elegant` becomes a soft cobalt glow
- Sidebar tokens: keep dark (already aligned) but switch hues to `#0F172A` base, cobalt `--sidebar-primary`, slate borders

## Typography

- Drop Sora; standardize on **Inter** (already loaded) for both `--font-sans` and `--font-display`. Headings stay heavier weight (600) instead of a different family.
- Tighten heading tracking (`-0.015em` kept), body stays default.
- Sweep for `uppercase` Tailwind classes used as decorative all-caps section labels and convert to normal case + medium weight. Scope: header chips in `agency-health-snapshot.tsx`, badge labels, section header eyebrows. (Functional badges like status pills keep their casing.)

## Component primitives (visual props only)

Skin-only edits to:

- `src/components/ui/card.tsx` — `rounded-lg`, 1px steel border, `shadow-card`
- `src/components/ui/button.tsx` — primary = cobalt; keep `life` variant but repoint its gradient to navy→cobalt; unify radius to `rounded-lg`
- `src/components/ui/badge.tsx` — cooler tints; drop the iridescent `life` gradient in favor of cobalt-tinted soft fill (variant name preserved to avoid breaking imports)
- `src/components/ui/input.tsx` — `rounded-lg`, steel border, cobalt focus ring
- `src/components/ui/tabs.tsx` — active underline = solid cobalt (replacing the gradient)
- `src/components/ui/section-header.tsx` — icon chip background = cobalt/10, icon = cobalt
- `src/components/ui/empty-state.tsx` — icon chip uses cobalt instead of `bg-gradient-life`
- `src/components/ui/info-tile.tsx` — retune tone variants to the new palette
- `src/components/ui/separator.tsx`, `table.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `popover.tsx` — verify they consume `--border` / `--radius` tokens and don't need overrides (most already do)

## Agency Health Snapshot refactor (`/dashboard/overview`)

`src/components/agency-health-snapshot.tsx` — visual only:

- Replace `tierFor()` Tailwind color literals (`emerald-*`, `amber-*`, `rose-*`) with semantic tokens (`text-success`, `text-warning`, `text-destructive`, etc.) so they pick up the new palette.
- Drop emoji prefixes in tier labels (`🟢 OPTIMAL` → `OPTIMAL`) and on column titles; replace with `lucide-react` micro-icons already imported (`CheckCircle2`, `AlertTriangle`, `ShieldAlert`) sitting in a small cobalt/slate chip beside the title.
- Radial ring: reduce `strokeWidth` from 12 → 6 for the thin/high-density look; keep geometry, scoring math, query, and props untouched.
- Bulleted metric rows: replace inline status icons with consistent slate micro-icons; body text → slate, numbers → semantic color only on the percentage badge.
- Note: route is `/dashboard` (no `/dashboard/overview` file exists). Component is rendered from `dashboard.index.tsx` — confirm during build and apply edits in place; do not add/rename routes.

## Cleanup sweep

Ripgrep for hard-coded Tailwind color classes (`text-emerald-`, `bg-rose-`, `text-amber-`, `bg-teal-`, `text-violet-`, `bg-peach`, etc.) across `src/components/**` and `src/routes/**` and route them through semantic tokens. No behavior changes — class swaps only.

## Explicitly out of scope (functional shield)

- No edits to: `src/lib/**`, `src/hooks/**`, `src/integrations/**`, `src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/routes/**` route configs, loaders, server functions, Supabase queries, EVV / time clock / geofence / auth code.
- No prop signature changes on UI primitives — variant names preserved even when their visual implementation changes (`life` variant stays callable so existing usages don't break).
- No new routes, no removed routes, no auto-generated `routeTree.gen.ts` edits.
- No font swap requiring new network requests beyond what's already loaded.

## Verification

- Preview /dashboard, /dashboard/compliance-desk, /dashboard/workspace, and a staff tab to confirm uniform chrome.
- Ripgrep confirms no remaining `emerald-|rose-|amber-|teal-|violet-` color literals in app code.
- Confirm radii, borders, and shadows are visually consistent across Card, Button, Input, Tabs, Dialog.
