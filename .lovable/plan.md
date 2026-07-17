## Problem

At the review step, `findContradictions()` (src/lib/nectar-quality.ts) runs a keyword scan on the narrative and shows two warnings that block Submit:

- "You mentioned a possible injury — describe it or confirm none."
- "Medical help was mentioned — record what was provided."

These fire whenever the narrative contains any of the trigger words (`hit`, `hurt`, `fell`, `bruise`, `injury`, `bit`, or `911`, `ambulance`, `er`, `hospital`) AND the internal `injuries` / `medical_attention` fields look "empty" to the heuristic. They produce false positives because:

1. Not every incident category adds the dedicated Injuries / Medical Attention steps, so those two fields stay blank even on a fully filled report.
2. The narrative itself and Nectar's follow-up questions already capture that detail — the redundant keyword check has no way to see it.
3. `submitBlocked` treats any contradiction as a hard block, so the user cannot submit.

Nectar's AI follow-up questions on the narrative step (which the user confirmed are working well and must stay) already surface real gaps about injuries and medical care, so this second deterministic check is redundant.

## Change

Edit `src/lib/nectar-quality.ts`:

- Remove the injury keyword branch (INJURY_TERMS + the "possible injury" push).
- Remove the medical keyword branch (MEDICAL_TERMS + the "Medical help was mentioned" push).
- Keep the peer / "another person" contradiction check as-is — that one keys off `people_involved`, which is a required field on every category, and doesn't produce the same false positives.
- Drop the now-unused `INJURY_TERMS` and `MEDICAL_TERMS` constants.

No changes to `incident-report-dialog.tsx`: `findContradictions` still runs, `submitBlocked` still respects it, and the Nectar follow-up flow / narrative drafting are untouched.

## Result

Reports where the narrative mentions an injury or medical care no longer block Submit on the review step. Nectar follow-up questions continue to catch real gaps.
