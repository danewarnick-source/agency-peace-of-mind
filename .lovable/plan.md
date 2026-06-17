## Scope

Replace the public `/pricing` page contents with the DSPD-specific pricing page described. **Only touch `src/routes/pricing.tsx`** plus one new self-contained component file for the page body. Do not modify the landing page, login, header, footer, or anything in the authenticated app. The nav link to `/pricing` already exists in `SiteHeader` — no nav changes needed.

Note: no `hive-conventions` or `dspd-domain` skill files exist in `.workspace/skills/`. I'll apply the equivalent in-repo conventions instead: the project-knowledge brain (DSPD vocabulary — DSPD, DHHS EVV CSV, NECTAR, eMAR, etc.) and the existing design tokens in `src/styles.css` (`--navy-*`, `--amber-*`, `--gradient-amber`, `bg-gradient-hero`) used by the landing pages. Same chrome as the current pricing route: `<SiteHeader />` + `<Footer />`.

## Files

1. **New** `src/components/landing/dspd-pricing.tsx` — the entire pricing page body as one self-contained client component. Keeps `pricing.tsx` route file thin. Sections inside:
   - Header: H1 "Simple, transparent pricing" + subhead "One plan. Every feature. Price drops as your agency grows."
   - Monthly/Annual toggle (segmented control, amber-accented). Annual shows a "Save 20%" badge.
   - Two plan cards (Hive Standard — amber border, highlighted; Enterprise — neutral). All copy and feature lists exactly as specified. Prices recompute when annual is selected.
   - Volume pricing callout: three tiers ($125 / $109 / $99) recomputed under annual.
   - Cost estimator: single staff slider (1–500), live monthly + annual side by side, $500 floor, "saves $X/year" annotation.
   - "Staff training" section label + two training cards (Full program $300; À la carte with three rows — CPR $75, Mandt $200, DSPD $100 — plus savings note). Training prices are NOT affected by the monthly/annual toggle (one-time fees).
   - FAQ accordion with the 5 exact Q/A items.
   - Closing CTA strip: navy gradient band, headline + "Book a demo" (amber primary) and "Get started" (outline) buttons.

2. **Edit** `src/routes/pricing.tsx` — swap the body for `<DspdPricing />`, refresh `head()` meta (title/description/og to match the new positioning, e.g. title "Pricing — HIVE", description "One plan. Every feature. Volume pricing drops your per-staff rate automatically as your agency grows.").

## Technical details

- All state local to `DspdPricing` (`useState` for billing cycle and staff count). No data fetches, no server functions, no mocks — copy is hardcoded as instructed.
- Price math in a single helper: `const rate = annual ? base * 0.8 : base;` formatted via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`. Annual estimator total = `max(monthly, 500) * 12 * 0.8`; savings = `monthlyTotal * 12 - annualTotal`.
- Tier rates table: `[{minClients:1,maxClients:19,rate:125},{...20-49,109},{...50+,99}]` — annual variants derived, not hardcoded twice.
- Use shadcn primitives already in the project: `Button`, `Card`, `Slider`, `Accordion`, `Badge`, `Switch` or a simple two-button toggle. Buttons route via `<Link to="/signup">` and `<Link to="/contact">` (both routes exist).
- Styling: dark navy hero band reusing `bg-gradient-hero` for the top, white/soft-surface body for the rest to match `landing/pricing.tsx` aesthetic. Amber accent uses `var(--amber-500)` / `var(--amber-600)` tokens and `border-[color:var(--amber-500)]` for the highlighted Hive card. No hard-coded colors; only design tokens.
- Mobile: cards stack via `grid grid-cols-1 md:grid-cols-2 gap-6`. Tap targets ≥44px. Toggle and slider both ≥44px on mobile per core memory rule.
- SEO: keep single H1, semantic `<section>` blocks with sr-only headings where needed, FAQ wrapped in JSON-LD `FAQPage` script for richer indexing.

## What I will NOT do

- Not touching `src/components/landing/pricing.tsx` (the old reusable section) — leaving it in place in case the landing page or other routes still reference it. (`rg` confirms only the current `pricing.tsx` route uses it.)
- Not editing `SiteHeader`, `Footer`, `hero.tsx`, or anything outside the pricing route.
- No new dependencies.
- No price changes from the brief — all numbers verbatim.
