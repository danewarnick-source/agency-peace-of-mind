# HIVE rebrand — light-chrome / dark-hero system

Goal: a calm, premium, healthcare-grade SaaS look. Light, legible content; navy + amber reserved for hero, nav/footer accents, and key moments. Hexagon used only as the logo mark and as a faint atmospheric motif on dark hero sections.

## 1. Design tokens (`src/styles.css`)

Add a HIVE rebrand token layer on top of the existing brand ramps so every component consumes the same variables.

- Surfaces (light): `--surface` `#ffffff`, `--surface-2` `#f7f8fb`, `--surface-3` `#eef0f5`
- Surfaces (dark): `--navy-900` `#0d112b`, `--navy-800` `#141a3d`, `--navy-700` `#1c2350`
- Accent (amber): `--amber-500` `#f4a93a`, `--amber-600` `#f59324`, gradient `--gradient-amber: linear-gradient(135deg, #f4a93a, #f59324)`
- Text on light: `--text` `#0d112b`, `--text-muted` `#4a5168`
- Text on dark: white / `rgba(255,255,255,0.6)`
- Borders: `--border-light` `#e4e7ef`, `--border-dark` `rgba(255,255,255,0.11)`
- Radii: `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 16px`
- Shadows: soft elevation scale (`shadow-card`, `shadow-elevated`)
- Font: Plus Jakarta Sans set as `--font-sans` and `--font-display` (700–800 display, 400–600 body), already loaded in `__root.tsx`

Semantic tokens (`--background`, `--foreground`, `--primary`, `--accent`, `--ring`, `--border`, etc.) get remapped so shadcn primitives (`Button`, `Input`, `Card`) automatically render in the new palette.

## 2. Shared components (build once, reuse everywhere)

Standardize the pieces every page reuses so applying the rebrand later is mostly swapping wrappers.

- `Button` (existing, `src/components/ui/button.tsx`): add/adjust variants
  - `primary` = amber gradient + dark text + subtle shadow
  - `secondary` = outlined navy on light
  - `ghostOnDark` = white text + hairline border for dark hero CTAs
- `Card` primitives: light variant (white, `--border-light`, soft shadow); `GlassCard` wrapper for dark sections (translucent + hairline + blur)
- `SiteHeader` (`src/components/site-header.tsx`): light, sticky, hex logo mark, navy links, single amber CTA ("Book a demo"). Used on every marketing page.
- `Footer` (`src/components/landing/footer.tsx`): dark navy, muted links, faint hex texture, logo + tagline
- `HexBackdrop` (new): the SVG hex pattern + amber glow used only in dark hero bands
- `Pill` / `Badge` and form `Input` / `Label`: amber focus ring, hairline borders, consistent radius

## 3. Per-page application

Marketing pages first (highest visibility), then auth, then dashboard chrome.

- **Home (`/`)**: keep light nav + dark hero (already close); rebuild hero with `HexBackdrop`, amber pill, amber CTA, ghost secondary. Below-fold sections switch to light cards.
- **Pricing (`/pricing`)**: light surfaces, navy headings, amber only on the recommended plan ring + CTA
- **Contact (`/contact`)**: light form using rebranded `Input`s, amber submit
- **Sign-in & auth shell (`/login`, `/signup`, `/forgot-password`, `/reset-password`)**: already dark-branded from prior step — re-point hardcoded hex values to the new tokens so it stays in sync
- **Dashboard chrome (`src/routes/dashboard.tsx`, sidebar, top bar)**: light background, navy text, amber for active nav item + primary actions. Existing dashboard pages keep working because they consume shadcn tokens.

Pages not explicitly listed (Compliance, FAQ, Platform/NECTAR) are not yet routes in the project — if they don't exist I won't create them in this pass; the token + component system will be ready when they're added.

## 4. Out of scope for this pass

- New marketing pages that don't exist yet (Compliance, FAQ, Platform/NECTAR)
- Restructuring dashboard feature pages — only the chrome (header/sidebar/spacing) is rebranded
- Animation / motion work beyond simple hover/focus transitions

## Technical notes

- Tokens go in `src/styles.css` under `:root` and the `@theme inline` block so Tailwind v4 utilities like `bg-navy-900`, `text-amber-500`, `border-border-light` resolve at build time.
- `Button` variant changes are additive; existing `variant="default"` keeps working but renders in the new palette via tokens.
- Plus Jakarta Sans is already loaded; switching `--font-sans` propagates site-wide without per-component edits.
- I'll verify after each phase: tokens compile, shared components render, each rebranded page screenshots cleanly at desktop + mobile.

## Suggested execution order

1. Tokens + font wiring
2. Button / Card / Input / GlassCard / HexBackdrop primitives
3. SiteHeader + Footer
4. Home hero + below-fold sections
5. Pricing + Contact
6. Auth shell token cleanup
7. Dashboard chrome
8. QA pass at 1194px and 390px
