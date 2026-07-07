Widen the Rate and Provider columns in the Smart Import billing-codes table so full dollar amounts and full provider names are visible, while keeping the table fitting the page.

### What we'll change
- In `src/routes/dashboard.smart-import.$jobId.review.tsx`:
  - **Rate column**: increase from `w-[80px]` to `w-[110px]` (or `min-w-[110px]`) so `$XXX.XX` is fully visible.
  - **Provider column**: add `min-w-[180px]` (and possibly `w-[25%]` or `w-[200px]`) so longer provider names are not clipped.
  - **Row inputs**: ensure the provider `<Input>` and rate input use the full column width (`w-full`).
  - **Table fit**: review surrounding column widths (Code, Ownership, Unit, Annual, Monthly, Term, Status, actions) and trim or allow flex widths so the overall table still fits the container without excessive horizontal scroll on common viewport widths. The table is already wrapped in `overflow-x-auto`, but the goal is to minimize scrolling.

### Out of scope
- No changes to data model, extraction logic, server functions, or commit behavior.
- No changes to the rate/annual/monthly semantics already implemented.

### Acceptance
- Full provider name is readable without truncation.
- Rate displays as `$XXX.XX` without clipping.
- Table still fits within the review page card on a typical desktop viewport (≤1280px) without a horizontal scrollbar, or with only a small one.