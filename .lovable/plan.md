# Fully-orange selected state for shift-verification pills

## What's happening now
Both the "Did anything happen this shift…" Yes/No (in `punch-pad.tsx`) and the "Any behaviors of concern observed…" Yes/No (in `behavior-observations-block.tsx`) already share the same `selectedPill` / `unselectedPill` classes from `src/components/evv/toggle-styles.ts`. But `selectedPill` today is only a pale amber tint (`bg-[color:var(--amber-100)]` with a darker border), so the selected state looks washed out instead of clearly "on."

## Change
Update the two shared constants in `src/components/evv/toggle-styles.ts` so a picked option renders as a solid orange chip with strong contrast, and unselected stays neutral:

- `selectedPill` → solid amber-600 fill, white text, matching border, and a subtle ring so it reads as bold and confidently "picked":
  `border-[color:var(--amber-600)] bg-[color:var(--amber-600)] text-white hover:bg-[color:var(--amber-600)]`
- `unselectedPill` → unchanged neutral chip.

Because both Yes/No pairs (incident question + behavior question) already funnel through these constants and are already sized identically (`min-h-[44px]`, flex-1 in the behavior block; equivalent width in the incident block), a single token change lands consistently on both. Yes and No end up visually identical when selected — same fill, same text color, same border — differing only by label.

## Scope
Frontend/presentation only. No logic, data, or state changes. The other clock-out dialog controls that already reuse `selectedPill` (baseline check, recording toggle, behavior frequency, reportable incident, trend, long-shift ack) will also render in the same solid orange when picked, which matches the "clean and organized look" the user asked for.

## Files
- `src/components/evv/toggle-styles.ts` — update the two class strings.

No other files need edits; `punch-pad.tsx` and `behavior-observations-block.tsx` already consume these constants.
