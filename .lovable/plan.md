# Clock-out screen — consistent selection styling + scroll fix

Scope: the "Shift Verification & Medicaid Compliance Form" dialog opened from Submit Final Timesheet (`src/components/evv/punch-pad.tsx`) plus the shared `src/components/evv/behavior-observations-block.tsx` used inside it. Presentation only — no submit logic, gates, billing, or copy meaning changes.

## Problem 1: inconsistent selected vs unselected states

The dialog mixes several different visual languages for "on/off":

- Behavior Observations block already has a good, consistent pattern for its Yes/No, frequency chips, and trend segmented control:
  selected → `border-[color:var(--amber-600)] bg-[color:var(--amber-100)] text-[color:var(--navy-900)]`
  unselected → `border-border bg-background hover:bg-accent`
- Elsewhere in the same dialog the same idea is styled differently:
  - Mic "Speak shorthand / Stop voice" toggles to a rose border/text when active — rose is used everywhere else as destructive, so it reads as an error, not "on".
  - Completeness Check "Run check" is solid amber, then flips to `variant="outline"` after running — that visually reads as a state toggle even though it's really the same action with a new label.
  - Goal checkboxes, baseline checkbox, "these times are accurate", and "I've reviewed this note" checkboxes are a mix of `accent-primary` and `accent-[color:var(--amber-600)]`, and none of them highlight the row when selected (unlike the behavior-block checkboxes).
  - "Request time correction" is an outline amber button; the sibling "recorded times are wrong — request a correction" is a plain ghost link. Same action, two shapes.

## Problem 2: layout / scroll

The dialog is `flex-col` with a sticky header, a `flex-1 overflow-y-auto` middle, and a sticky footer. The footer currently holds:

- Long-shift acknowledgement banner (when applicable)
- Ghost "recorded times are wrong" button
- The full correction request panel (two datetime inputs + reason textarea + cancel)
- GPS status pill
- Primary submit button
- Secondary "submit anyway" exception button

On phones (`max-h-[100dvh]`), opening the correction panel plus a long-shift banner grows the footer past half the viewport and squeezes the scrollable middle so goals/narrative are barely reachable. On short viewports the exception button can be pushed off-screen entirely.

## Fix

### A. One shared "toggle" look

Introduce two tiny local class helpers at the top of `punch-pad.tsx` (no new file):

```
const selectedPill   = "border-[color:var(--amber-600)] bg-[color:var(--amber-100)] text-[color:var(--navy-900)]";
const unselectedPill = "border-border bg-background hover:bg-accent";
```

Apply them to every selectable control inside the dialog:

1. Mic button — drop the rose styling; use `selectedPill` when `isRecording`, `unselectedPill` otherwise. Keep the MicOff icon + "Stop voice" label as the affordance for "click to turn off".
2. Completeness Check button — stop switching variants. Keep a single visual (outline amber) and only change the label between "Run check" and "Re-check". This removes the false "selected" read.
3. Goal + baseline checkboxes, "These times are accurate", "I've reviewed this note", and behavior-block Q6 checkbox — standardize on `accent-[color:var(--amber-600)]` and wrap each row so the whole row picks up `selectedPill` when checked (matching how the behavior block already treats Yes/No). This ties every checkbox in the dialog to the same visual grammar.
4. "Request time correction" (in the long-shift banner) and the ghost "recorded times are wrong" link — collapse to a single outline-amber button placement; the long-shift banner shows it inline, the non-long-shift path shows the same button right-aligned above the submit row.

Behavior block file needs no logic edits; only the shared class strings change so the same tokens live in both files (or we import the two strings from a small `src/components/evv/toggle-styles.ts` — cleaner, and the plan uses this).

### B. Layout / scroll

1. Move the long-shift banner and the correction panel out of the sticky footer and into the bottom of the scrollable middle (`flex-1 overflow-y-auto`). They are shift-context inputs, not submit controls, so they belong with the rest of the form and are free to grow without eating the viewport.
2. Keep the sticky footer minimal and predictable: GPS status pill + primary submit + (when shown) exception button. That footer is now a fixed ~2 rows tall regardless of state.
3. Tighten the dialog shell:
   - `DialogContent` → `max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] overflow-hidden`
   - Middle scroller → add `min-h-0` (needed for `flex-1 overflow-y-auto` to actually scroll inside a flex column on iOS) and bump bottom padding (`pb-6`) so the last field isn't hugging the footer border.
4. Ensure the sticky footer stacks vertically on narrow widths so the exception button never gets clipped next to the primary submit.

### Files touched

- `src/components/evv/punch-pad.tsx` — the whole compliance `Dialog` (header stays, middle grows, footer shrinks) and the toggle-class swaps.
- `src/components/evv/behavior-observations-block.tsx` — swap the inline "selected" class strings for the shared ones.
- `src/components/evv/toggle-styles.ts` — new tiny module exporting the two class strings.

### Out of scope

- No changes to submit gates, NECTAR checks, med-due logic, correction submit path, billing, or dialog copy.
- No changes to the incident dialog or the pending-forms dialog.
- No changes outside the clock-out dialog surface.
