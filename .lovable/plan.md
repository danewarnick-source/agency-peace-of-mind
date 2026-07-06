## What I actually found

I scanned all 789 currently active drafted requirements across every source document with progressively looser matching. Here's the honest picture:

### Cross-document near-duplicates: **0**

No requirement in one source document has a near-duplicate in another. I tried three passes:
1. Exact title (case/whitespace-insensitive) → 0 cross-doc pairs
2. Punctuation-stripped, whitespace-collapsed → 0 cross-doc pairs
3. Same first 8 significant words → 0 cross-doc pairs

There is currently only one document whose drafted requirements are still live (SOW 2026); the older ones were retired when their source documents were deleted, which is why nothing lands cross-document.

### Intra-document near-duplicates the last fix missed: **3 pairs (6 rows), all in SOW 2026**

These are pairs the previous fix didn't catch because it compared titles as-is (only lowercased + truncated) — no punctuation normalization — so a stray colon, apostrophe, or quote made the keys differ:

| # | Title A | Title B | Citation | Only differences |
|---|---|---|---|---|
| 1 | `CMS/CMP Staff: Complete DSPD New Caregiver Compensation training with 80% pass score` | `CMS/CMP Staff: Complete DSPD 'New Caregiver Compensation' training with 80% pass score` | SOW 2026 — Section 32.5 | Quotes around program name |
| 2 | `SJP limited to once every 12 months per Person` | `SJP: Limited to once every 12 months per Person` | SOW 2026 — Section 34.4(2) | Colon + capital L |
| 3 | `SJR: Limited to once every 12 months per Person` | `SJR limited to once every 12 months per Person` | SOW 2026 — Section 35.4(2) | Colon + capital L |

Same document, same citation, same applies_to — clearly the AI phrasing the same clause twice inside the SOW.

### What this tells you about "440 vs 500"

Those numbers are not duplicates. **500 = review queue**, **440 = the subset without an applicability proposal yet.** Same underlying 789 requirements viewed two ways. Nothing to delete there.

## Recommendation — nothing to build until you decide

Given the actual data, there are two very small choices to make:

1. **The 3 intra-doc pairs above** — do you want me to plan a cleanup + tighten the dedup normalization (strip punctuation, collapse whitespace) so future re-drafts don't re-create them? Or leave the 3 pairs alone for now?
2. **Cross-document dedup rule for future uploads** — moot at the moment (0 candidates), but the rule still matters the next time you upload another SOW / contract / DHHS doc. You said you'd decide this after seeing the candidates; since the candidate list is empty, my read is you can defer this until it actually happens.

**I made no changes.** Reply with what you want to do about the 3 pairs (and whether to skip or defer the cross-doc rule) and I'll come back with a build plan.
