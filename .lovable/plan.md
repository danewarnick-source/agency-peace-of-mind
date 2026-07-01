## Goal
Make the one review item on this page understandable to a provider who has never heard the phrase "codes_held." No behavior change — same advisory, same Dismiss, same one-click fix. Just plain English + a clearer path.

## What changes
Two small text edits in existing files. No new components, no schema, no logic.

### 1. `src/lib/smart-import-review.functions.ts` (line ~97)
Rewrite the `message` on the `org.codes_held_missing` issue to plain language:

> **Old:** "Awarded service codes aren't set for this org — code routing falls back to provider-name matching. Configure codes_held to enable automatic billing/coordination split."
>
> **New:** "Your agency hasn't told HIVE which DSPD service codes it's contracted to bill. Without that list, NECTAR can't automatically tell which codes on this PCSP are yours to bill vs. another provider's — it has to guess from the provider name printed on the plan."

### 2. `src/routes/dashboard.smart-import.$jobId.review.tsx` (getIssueHelp, ~line 592)
Rewrite the `whatToDo` and add a second action so admins have two obvious paths:

- **whatToDo (new):** "Two ways to clear this: (a) Open Company Profile and check off the DSPD codes your agency is awarded — this is a one-time setup and every future import benefits, or (b) if you've already reviewed the billing codes on this client and they're correct as shown, click Dismiss. This warning never blocks saving the client."
- **action label (new):** "Set awarded codes in Company Profile" (unchanged destination).

Also change the label of the header line in the ValidationPanel from "1 thing to review before saving" to "1 optional item — nothing is blocking this client" when `blocking === 0`, so it's obvious the page can be completed as-is.

## Out of scope
- The Company Profile awarded-codes UI itself (already exists at `/dashboard/nectar-company-profile#codes-held`).
- Logic that decides when to fire this warning.
- Any other validation keys (only `org.codes_held_missing` and the header copy).

## Why this is safe
Text-only edits in the two files that own the message and the help copy. The Dismiss and Set-awarded-codes buttons already work — this just makes it obvious what they do and that the admin isn't stuck.
