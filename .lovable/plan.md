
## Goal
Rework the Employee Face Sheet PDF (`src/lib/employee-face-sheet.ts`) so text no longer overlaps and the document reads as a polished, professional one-pager.

## Problems in the current renderer

1. **Header right column overlaps.** Org name, address, and phone are drawn at hard-coded y offsets (−8, −22, −46) with no awareness of wrapped-line height, so a two-line address collides with the phone line.
2. **Identity band collides with photo.** "EMPLOYEE FACE SHEET" / name / title / role are drawn at the same top y as the 96px photo box on the right, and the vertical rhythm (14/24/14/12) is inconsistent, letting long names or long staff-type strings crowd the photo.
3. **`drawKV` spacing is too tight.** Label size 7.5 at y and value size 9.5 at y−11 leaves ~1pt clearance; the "Emergency contact" value also embeds a literal `\n` that `wrap()` never splits on, so the newline glyph renders as junk and pushes the line into the next field.
4. **Table rows drop wrapped content.** `drawRow` calls `wrap()` but only draws `lines[0]`, so long credential names silently truncate mid-word and any KV that wraps overwrites the row below (fixed row height of 12).
5. **Section headers** are 14pt filled bars with 8pt text baselined at y−10, giving uneven internal padding and touching the KV label above.
6. **Footer** is one long run-on sentence at 7pt including a redundant "empty values render as —" disclaimer — reads as clutter.

## Fix (presentation-only, no data-shape changes)

Edit `src/lib/employee-face-sheet.ts`:

- **Type scale + rhythm.** Standardize on 3 sizes: 18 (name), 9.5 (body), 7.5 (label/eyebrow). Introduce a `LINE = 13` baseline grid and a `GAP = 10` between blocks; use them everywhere instead of ad-hoc offsets.
- **Header.** Stack org name/address/phone using measured line heights (advance y by `size * 1.3 * lineCount`). Cap address to 2 lines with ellipsis. Keep the horizontal rule 16pt below the tallest of {logo, right column}.
- **Identity band.** Move the photo down so its top aligns with the "EMPLOYEE FACE SHEET" eyebrow; recompute `idW` from the actual photo box left edge minus a 20pt gutter. Advance y by measured line counts so long names wrap cleanly without crashing into the role line.
- **`drawKV`.** Bump inter-field padding to 8pt, label→value gap to 12pt. Replace the embedded `\n` in the emergency-contact value with a proper two-call render (name/relationship on one line, phone on the next) so nothing relies on `wrap()` seeing newlines.
- **Section headers.** Slim the fill bar to 12pt, left-pad text 8pt, center vertically, and add 4pt of breathing room above the first KV.
- **Tables.** Make `drawRow` render *all* wrapped lines, compute `rowH = max(lines) * lineHeight + 4`, and alternate a very light zebra fill (`rgb(0.98,0.98,0.99)`) on odd rows. Right-align the two date columns. Widen the "Credential"/"Document" column and shrink date columns to 72pt.
- **Footer.** Two-line, muted: line 1 = `Employee Face Sheet · {name} · {orgName}`, line 2 = `Generated {date} · Page X of Y`. Drop the disclaimer sentence (the `—` convention is self-evident).
- **Color polish.** Nudge `ACCENT` slightly darker (`rgb(0.06,0.28,0.5)`), keep INK/MUTED/BORDER, and use ACCENT only for the eyebrow + section titles for a consistent hierarchy.

Everything else (data fetch, ship-to-file, filenames, call sites) stays untouched.

## Verification
After the edit, generate a face sheet for the same employee shown in the screenshot, convert page 1 to an image with `pdftoppm`, and visually confirm: no overlapping glyphs, consistent gutters, tables that wrap instead of truncating, and a clean two-line footer.
