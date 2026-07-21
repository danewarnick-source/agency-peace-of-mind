# Fix incident Yes/No default-state color

## Cause
The two incident buttons in `src/components/evv/punch-pad.tsx` (lines ~2903 and ~2916) use the shadcn `<Button>` component with no `variant` prop, so they inherit the default `variant="default"` styling (solid primary fill). The `unselectedPill` class (`bg-background`) is appended via `className`, but the default variant's background utilities win due to `cn` merge order, so both buttons render solid orange until one is picked.

The Yes/No pair in `behavior-observations-block.tsx` doesn't have this problem because it uses plain `<button>` elements.

## Change
In `src/components/evv/punch-pad.tsx`, add `variant="outline"` to both incident buttons. That drops the primary fill so `unselectedPill` (white/background with border) shows correctly, and `selectedPill` (solid orange) still applies when picked.

Scope: presentation only, two prop additions, no logic changes.

## Files
- `src/components/evv/punch-pad.tsx` — add `variant="outline"` to the No and Yes `<Button>` elements in the incident question block.
