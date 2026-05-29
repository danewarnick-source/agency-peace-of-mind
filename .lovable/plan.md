Add the ™ symbol to all visible public-facing mentions of "NECTAR" on the marketing site.

**Scope**
- `src/routes/index.tsx` — landing page (nav tagline, hero badge, hero copy, section label, spotlight heading/copy, live feed label, FAQ answer)
- `src/components/landing/footer.tsx` — footer tagline
- `src/routes/login.tsx` — auth shell tagline

**What will change**
Every user-visible string that reads "NECTAR" will become "NECTAR™". CSS variable names and code identifiers remain unchanged.

**Out of scope**
- Dashboard routes, admin panels, or authenticated-app copy (behind sign-in)
- CSS custom properties (`--nectar-gold-*`, etc.)
- File names or function names