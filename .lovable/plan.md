## What you want

Every document uploaded to Company Docs also appears in the Sources tab automatically — no promote step, no "mark as authoritative" gate. The `is_authoritative_source` flag stops being a visibility gate and just becomes a "kind is set" indicator.

## Why this fixes the SOW issue

"SOW 2026" is already in `nectar_documents` (owner_kind = company). It's just filtered out of the Sources list. Removing that filter makes it show up immediately, with a **Draft requirements** button.

## Changes

**1. Sources list = all company-owned docs**
- `src/lib/authoritative-sources.functions.ts` → `listAuthoritativeSources`: drop the `.eq("is_authoritative_source", true)` filter. Keep it scoped to the org and to `owner_kind = 'company'` so client/staff-specific docs don't leak in. Sort authoritative-flagged rows first, then the rest by `created_at desc`.

**2. Row UI reflects the two states**
- `src/components/pages/authoritative-sources-page.tsx` → `SourceRow`: if `authoritative_kind` is null, show a small **"Set kind"** inline picker (State SOW / Provider contract / DSPD / DHS / Other / Tool-template). Picking a kind calls the existing `markAsAuthoritativeSource` → flag flips to true, kind is stored. Rows without a kind still show **Draft requirements**; clicking it prompts to pick a kind first (so `NON_OBLIGATION_KINDS` short-circuit still works).

**3. Draft-requirements guard stays honest**
- `startRequirementsDraft` already early-exits with `reason: "non_obligation_kind"` for tool_template. Leave it. For rows with no kind yet, block the draft with a friendly "Pick a document kind first" toast instead of running blind.

**4. Backward compatibility**
- Everything else that queries `is_authoritative_source = true` (auditor shares, onboarding progress, discharge, ce, nectar-help, staff-types) keeps its current behavior. Only the Sources tab loosens its filter.

## Files touched

- `src/lib/authoritative-sources.functions.ts` — one-line filter change in `listAuthoritativeSources`, add ordering by `is_authoritative_source desc, created_at desc`.
- `src/components/pages/authoritative-sources-page.tsx` — inline "Set kind" control in `SourceRow`, small guard in the Draft button.

No DB migration. No changes to the Bedrock extraction pipeline. The already-uploaded "SOW 2026" will appear on the Sources tab as soon as this ships; setting its kind to **State SOW** unlocks Draft requirements.