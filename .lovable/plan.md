## Problem

On Justin's profile the "Records & documents" bar shows two separate rows that the user considers the same thing:

- **Human Rights documentation** — listed as **N/A**
- **HRC / Rights Restriction** — shows an **Upload** button

Meanwhile an HRR (Human Rights Restriction) file is already sitting in the client's Files → Client Documents. Nothing lights up because:

1. **The upload dropdown has no HRR/HRC option.** `client-documents-card.tsx` only offers PCSP, 1056, referral, intake, assessment, guardian, consent, or "Other". So the HRR was saved with `document_type = 'other'` (or similar). The profile checklist matches by exact `document_type` (`hrc_approval`, `human_rights`), so it never finds the file.
2. **Two rows for one concept.** `hrc_approval` and `human_rights` are surfaced as separate items in `RECORD_LABELS`. Product-wise they are the same DSPD artifact — an HRC approval covering a Human Rights restriction.
3. **N/A logic is too narrow.** `human_rights` shows N/A unless `hr_applicable === true`; `hrc_approval` shows N/A unless `rights_restrictions` has entries. Uploading an HRR document alone doesn't flip either flag, so the row stays greyed out.

## Plan

Frontend-only, no schema changes.

### 1. `src/components/clients/client-documents-card.tsx`

Add a Human Rights option to `CLIENT_DOC_TYPES` so the file can be tagged correctly at upload time:

- `{ value: "hrc_approval", label: "HRR / HRC / Rights Restriction" }`

(Uses the existing `hrc_approval` document_type that the setup checklist and profile bar already look for — no new type to migrate.)

### 2. `src/components/clients/profile-tab.tsx`

Collapse the two rows into one and make the matcher tolerant:

- Remove the standalone `human_rights` entry from `RECORD_LABELS` and from the `keys` list.
- Rename the `hrc_approval` row to **"Human Rights / HRC restriction"** with sub-copy "Required when rights are restricted or Human Rights applies".
- In `stateFor('hrc_approval')`:
  - Consider a match if `document_type` is `hrc_approval` **or** `human_rights` **or** a file whose `file_name` matches `/hrr|hrc|human[\s_-]*rights|rights[\s_-]*restriction/i` (covers files uploaded before the dropdown existed).
  - **Applicability:** the row is applicable when ANY of: `hr_applicable === true`, `rights_restrictions` has entries, OR a matching document already exists on file. Otherwise N/A.
  - If applicable and no matching doc → `missing`; if matching doc → `ok` with a View button opening the file.

### 3. Keep the Flags card unchanged

The "Human Rights documentation applicable" switch on the Identity card stays — it's still the way to declare applicability when no doc is on file yet.

## Verification

On Justin's profile:
- With the existing HRR file (currently stored as `other`): after re-uploading via the new dropdown option as "HRR / HRC / Rights Restriction", or immediately via the filename-match fallback, the single **Human Rights / HRC restriction** row flips to green with a **View** button.
- Only ONE row appears for this concept — no more N/A + Upload duplicate.
- A client with no HRR file and `hr_applicable = false` and no `rights_restrictions` still shows N/A (unchanged).

## Out of scope

- No changes to `client_documents` rows already in the DB (the filename fallback handles legacy uploads).
- No changes to setup checklist HRC review flow, PCSP tab, or backend schema.
