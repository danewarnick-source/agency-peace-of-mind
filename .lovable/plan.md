# Historical daily notes — scrollable list + real attestation

## 1. Layout change: scroll instead of one-at-a-time

Today the page shows a single note with Previous/Next buttons. Replace that with a scrollable feed:

- Header + "waiting for your attestation: N" count stays at the top.
- Below it, render every pending note stacked vertically in the same card style as today.
- Each card is fully independent: its own editable narrative, its own Save-changes button, its own attestation block, its own Sign button.
- Remove the Previous/Next controls and the cursor state — the browser scrolls the page normally.
- When a note is signed, it disappears from the list on the next refresh (same behavior as today); the other cards keep their in-progress edits.

Nothing about the server functions, permissions, or "signing one doesn't sign the rest" rule changes.

## 2. Real attestation: checkbox + legal text

Right now "Sign this note" is a bare button with no explicit attestation. Replace it with:

- A **checkbox** the staff member must tick before the Sign button becomes enabled.
- The full attestation text shown directly next to the checkbox, referencing the specific client's name and the specific service date for that note.
- The Sign button stays disabled until (a) the narrative is non-empty AND (b) the checkbox is ticked. Unticking the checkbox re-disables it.
- On submit, we pass an `attested: true` flag (and the exact attestation text version) alongside the existing narrative to `attestMyHistoricalDailyNote`, and record it server-side on the row so we have proof of what the person actually agreed to. (Small server-fn + column additions covered below.)

### Proposed attestation wording — please review before I build

> **I attest that this daily note, as it now reads, is a true, accurate, and complete account of the services I personally provided and the events I personally observed for {Client Name} on {Service Date}.**
>
> I understand this note is being entered as a historical service record that supports billing to and oversight by the Utah Division of Services for People with Disabilities (DSPD) and other payors, and that it will become part of this individual's permanent service record.
>
> I acknowledge that knowingly submitting a false, misleading, or incomplete service record may constitute Medicaid fraud under state and federal law — including 42 U.S.C. § 1320a-7b (federal anti-kickback / false claims), 31 U.S.C. §§ 3729–3733 (federal False Claims Act), and Utah Code Ann. § 26B-3-1101 et seq. (Utah Medicaid False Claims Act) — and may result in disciplinary action up to and including termination, civil liability, and/or criminal prosecution.
>
> I confirm that I am the staff member who provided this service, that no one has instructed me to alter this record to be inaccurate, and that my electronic signature (this checked box together with the Sign action) has the same legal force and effect as a handwritten signature under the federal E-SIGN Act (15 U.S.C. § 7001) and the Utah Uniform Electronic Transactions Act (Utah Code Ann. § 46-4-101 et seq.).

Tell me:
1. Approve this wording as-is, or
2. Reply with edits (add/remove/soften/harden), or
3. Ask me to swap the statute citations for something shorter/plainer.

I will **not** change the wording without your confirmation.

## 3. Technical details

**Files touched**
- `src/routes/dashboard.my-historical-daily-notes.tsx` — replace cursor UI with a `.map` over `rows`; extract per-card state into a small `HistoricalDailyNoteCard` sub-component so each card owns its own `draft`, `dirty`, `attested` state without cross-contamination.
- `src/lib/historical-daily-note-attestation.functions.ts` — extend `attestMyHistoricalDailyNote` input validator to require `attested: true` and accept the frozen attestation text + version string; reject if `attested !== true`.
- New migration on `daily_logs` (or wherever historical rows live — I'll confirm from the existing function before writing): add `historical_attestation_text text` and `historical_attestation_version text` columns, written at sign time alongside the existing signature fields. No RLS changes; existing per-row policies already cover it.

**Out of scope** — not touching:
- Timesheets side of the combined "Historical Records" page (unchanged).
- Import wizard, admin-side submission flow, or NECTAR checks.
- Any earlier fixes (import_jobs_mode_check, sidebar merge, etc.).
- The "signed one at a time" semantics — that stays.

## 4. Order of work once approved

1. You confirm (or edit) the attestation wording above.
2. I write the migration for the two new columns and wait for approval.
3. After the migration runs, I update the server function and the route in one build step.
