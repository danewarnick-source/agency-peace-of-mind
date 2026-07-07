# Historical import — mapping accuracy + review-at-scale (shipped)

## Done in this pass
1. **Deep, stratified sampling** — wizards now pull up to 60 non-empty values evenly spaced across up to 2,000 rows per column AND report each column's actual fill rate.
2. **Server: mapping accuracy** — `smart-import-nectar-mapping.functions.ts` computes `fill_rate` per column, tells NECTAR to downgrade `mostly_empty` columns, rejects NECTAR's pick if the chosen column is mostly empty and a populated alternative exists, and uses roster overlap fractions as PRIMARY evidence for staff/client (not confirmation).
3. **Per-row mixed-person detection** — server returns `per_row_person_column` when one column mixes staff and client names row-by-row, and picks that column for BOTH fields so downstream logic can resolve each cell individually.
4. **Duplicate detection** — new `smart-import-duplicate-check.functions.ts`; called after review rows are built. Matches on (staff_id, client_id, date, ±5-min times) for timesheets and (staff_id, client_id, date) for daily notes. Hits are auto-skipped with a "Likely duplicate" badge; admin can un-skip.
5. **Summary counts with duplicates** — review screen shows Ready / Needs a choice / Not matched or Incomplete / Skipped / Likely duplicate counts.
6. **Bulk-fix panel** — when the same unresolved raw label appears on 2+ rows, admin picks the correct person once in a "Repeated issues" panel above the tabs; every row sharing that label updates in one click.
7. **Filter tabs** — Ready/Needs a choice/Not matched/Skipped tabs act as filter chips (Skipped tab shows the duplicate sub-count).

## Follow-ups intentionally deferred (call out to Ryan if wanted)
- **Multi-sheet workbooks** — pulling different fields from different sheets in a workbook is still single-sheet only. Requires new NECTAR call shape and (staff-name, date) join.
- **Fully editable grid** — every cell of the review table is not yet directly editable in place; the current review UI still uses per-row action rows plus the bulk-fix panel. A virtualized editable grid would replace both.
- **Per-row mixed-person resolution in wizard** — server flags the mixed column, but the wizard's row builder still uses one pool per column. Small follow-up.
