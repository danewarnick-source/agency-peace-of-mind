
## Goal

Establish a single, warm-yet-professional design language that applies uniformly to every tab and section across both Staff and Admin views — taking visual cues from the clean, structured layout of the reference screenshot (Golden Care) blended with the iridescent teal→violet→peach palette of the CareAcademy logo.

## Design direction

**Palette (hybrid of both references)**
- Base surfaces: warm off-white `#FBF8F5` (light) / deep indigo-night `#0E1230` (dark) — borrowing the logo's cosmic backdrop
- Primary: deep indigo `#2A2F6B` (trust, structure — from screenshot's clean dark header)
- Accent gradient: teal `#3FC9D6` → violet `#8B7BE8` → soft peach `#F4B393` (from the logo)
- Supporting warmth: warm cream `#F4ECE0`, dusty rose `#E8C5C0` for "life" in empty states, badges, soft fills
- Semantic: success sage `#7BAE8E`, warning amber `#E8A857`, danger coral `#E07B6B` (warmer than current rose)

**Typography (one pair, everywhere)**
- Headings: **Sora** (modern, slightly humanist — pairs with logo's rounded geometry)
- Body / UI: **Inter** (proven legibility for dense data like the screenshot)
- One scale (xs/sm/base/lg/xl/2xl/3xl), one weight ramp (400/500/600/700) — no ad-hoc font sizes in components

**Structured "bubble" components (uniform primitives)**
Standardize the shapes used everywhere so every tab feels like the same product:
- `Card` — rounded-2xl, 1px warm border, soft elevated shadow (`shadow-card` token)
- `InfoTile` — the metric/stat bubble (radial ring + label + sublabel) used in agency health, dashboards, workspace summaries
- `SectionHeader` — icon chip + title + optional badge, consistent spacing
- `Tab` bar — underline style matching the screenshot (active = accent gradient underline)
- `Badge` — pill, soft tinted background using accent/semantic colors
- `EmptyState` — illustrated soft card with warm cream background + accent icon (adds "life")
- `Avatar` chip with gradient ring for active users

**Warmth without losing professionalism**
- Subtle gradient washes on hero/section headers (1–3% opacity teal→violet)
- Rounded-2xl as default radius (currently 0.75rem → bump to 1rem)
- Soft inner shadow on input fields
- Micro-interaction: 150ms ease transitions on hover/focus across all interactive primitives

## Implementation scope

1. **Tokens (`src/styles.css`)** — replace current navy/teal palette with the hybrid above; add `--gradient-life` (teal→violet→peach), `--surface-warm`, `--shadow-soft`; bump `--radius` to 1rem; register Sora + Inter via Google Fonts link in `__root.tsx`.

2. **Shared primitives** — audit & normalize:
   - `src/components/ui/card.tsx`, `badge.tsx`, `button.tsx`, `tabs.tsx`, `input.tsx` → align radii, shadows, focus rings to new tokens
   - Create `src/components/ui/info-tile.tsx` and `src/components/ui/section-header.tsx` as the canonical "bubble" + section header used by both portals
   - Create `src/components/ui/empty-state.tsx` for warm empty states

3. **Staff workspace** (`src/components/workspace/*`, `src/routes/dashboard.workspace.*`) — swap ad-hoc Cards/headers to the new primitives so Notes, Goals, Meds, Incidents, Forms tabs look identical in chrome.

4. **Admin views** (`src/routes/dashboard.*` admin pages, `src/components/agency-health-snapshot.tsx`) — same primitive swap; agency-health radial tiles become `InfoTile` instances so they match dashboards elsewhere.

5. **Sidebar + header** — apply the new sidebar tokens (deep indigo with warm accent), gradient active-state underline matching tabs.

6. **Cleanup pass** — remove hard-coded color classes (`text-emerald-*`, `bg-rose-*`, etc.) found in scan and route them through semantic tokens (`text-success`, `bg-destructive/10`).

## Out of scope

- No business-logic changes, no data model changes, no route changes.
- No dark-mode redesign in this pass (tokens updated, but visual QA stays on light mode).
- Animation library additions — micro-interactions use Tailwind transitions only.

## Verification

- Visual QA via preview screenshots of: Staff workspace (each tab), Admin dashboard, Agency Health snapshot, Sidebar.
- Confirm no component imports raw Tailwind color classes (rg sweep).
- Confirm font loads (network tab) and that headings render in Sora.

## Open question before building

Before I start: do you want me to **keep the current dark sidebar** (matches the screenshot reference) or **make the sidebar light/warm cream** to lean more into the logo's airy feel? Both work with the palette — they give different overall moods.
