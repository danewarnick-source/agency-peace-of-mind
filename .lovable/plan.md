# Fix: Smart Import → Medications / MAR panel is cramped

## Problem observed
In `src/routes/dashboard.smart-import.$jobId.review.tsx` the `MedicationsReviewPanel` (line ~1299) renders a rigid 7-column table with `min-w-[980px]`. On the wizard's narrow content column that forces:
- horizontal scrolling to reach Prescriber / Support needed,
- fields like Dose, Route, Frequency and Prescriber squeezed to unreadable widths,
- the panel's height + tall stacked inputs push the Back / Step 3 of 8 / Next controls off-screen (no visible Next in the screenshot).

The intro paragraph and the amber "no medication rows" callout also waste vertical space at the top before the first med row appears.

## Fix (frontend only, MAR panel only)

Rebuild `MedicationsReviewPanel` and `MedicationReviewRowEditor` as a **compact card-per-medication list** instead of a horizontally-scrolling table. Same data, same server calls, same fields — just laid out to fit the wizard column.

### 1. Panel header (tighten)
- Collapse the long descriptive paragraph into a single one-line hint plus a small "Why this matters" `<details>` disclosure (default closed).
- Keep "Add medication" button aligned right on the same row as the title.
- Show the emerald "no meds per PCSP" / amber "none found" callouts as slim single-line banners (py-2, text-xs) only when relevant.

### 2. Row layout (new, no table)
Each medication becomes a bordered rounded card. Fields flow in a responsive grid that never overflows:

```text
┌─ Medication name (full width, prominent)  ──────── [Save] [⋯] ┐
│ Dose | Route | Time | Prescriber      (grid-cols-2 md:grid-cols-4)
│ Frequency  |  Schedule notes           (grid-cols-1 md:grid-cols-2)
│ Support level ▾  |  Support instructions  (grid-cols-1 md:grid-cols-[160px_1fr])
└──────────────────────────────────────────────────────────────┘
```

- Inputs drop to `h-8 text-xs`, remove `min-w-[…]` values so they shrink cleanly.
- Support level + instructions sit on ONE row (currently stacked), matching the row height of the other fields.
- Trash / Save / Cancel move to the card header on the right, always visible without scrolling within a row.
- Field labels appear as tiny `text-[10px] uppercase text-muted-foreground` above each input (better than table headers that scroll away).

### 3. List density
- Cards separated by `space-y-2` (not `space-y-4`), so 2–3 meds are visible without scrolling.
- Remove the outer `overflow-x-auto` wrapper entirely — nothing needs horizontal scroll now.
- Panel outer padding drops from `p-4` to `p-3`.

### 4. Footer visibility
No changes to the wizard step footer itself; freeing vertical space in the MAR body is what brings Back / Next back on-screen at 1165×696.

## Out of scope
- No backend / server-fn changes.
- No changes to other wizard steps (Person, Health, Goals, etc.).
- No changes to the finalized client profile Medications card.
- No new fields — same 8 attributes per row as today.

## Files touched
- `src/routes/dashboard.smart-import.$jobId.review.tsx` — replace `MedicationsReviewPanel` (≈1299–1356) and `MedicationReviewRowEditor` (≈1358–1418) with the compact card layout described above.
