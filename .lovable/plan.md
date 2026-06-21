## Plan

1. **Make Nectar validate the certificate type before accepting it**
   - Expand the existing certificate OCR step so it extracts: staff name, certificate/training type, issue/completion date, expiration/renewal date, and key text evidence found on the document.
   - Add per-training validation rules so a CPR/First Aid certificate cannot be attached to 30-Day Training.
   - If validation fails, stop the attach step and show a clear reason such as:
     - Wrong certificate: expected 30-Day Training, found CPR/First Aid
     - Missing staff first/last name
     - Name does not match staff profile
     - Missing completion date
     - Missing CPR and First Aid wording
     - Missing expiration date when the training requires renewal tracking

2. **Add training-specific rules**
   - **CPR & First Aid:** must include staff first and last name, CPR wording, First Aid wording, completion/issue date, and an expiration date.
   - **30-Day Training:** must include staff first and last name, 30-day/new-hire training wording, and a certificate/completion date.
   - **Person-Centered Thinking:** must include staff name, person-centered thinking/PCT wording, and completion date.
   - **De-escalation:** must include staff name, an accepted de-escalation program name such as MANDT, SOAR, CPI, PART, or Safety Care, completion date, and expiration when present/required.
   - **ABI Training:** must include staff name, ABI/acquired brain injury wording, and completion date.
   - **Ongoing Training (12 Hours):** must include staff name, ongoing/annual training wording, completion date, and evidence of 12 hours or enough extracted text for admin review.

3. **Store Nectar’s review result**
   - Add database fields for validation status, failure reasons, extracted certificate type, extracted completion date, and extracted text/evidence summary.
   - Keep uploaded files in HR documents, but only attach them to the training row if Nectar validation passes.
   - Re-uploading a valid certificate clears prior admin sign-off, so admin must review the new certificate.

4. **Enforce admin sign-off as the final pass-off**
   - Update the sign-off function so it refuses to sign off when Nectar validation failed or is missing.
   - Keep the row amber “Awaiting sign-off” after Nectar passes validation until admin signs off.
   - Only show green “Completed” after both Nectar validation passed and admin sign-off is recorded.

5. **Improve the review UI**
   - Show a Nectar review panel for every uploaded baseline training certificate with:
     - Pass/fail result
     - Extracted staff name
     - Extracted certificate type
     - Extracted completion date
     - Extracted expiration date when applicable
     - Specific reasons if rejected
   - On failed upload, show the reason immediately and leave the training red “Incomplete.”

6. **Technical notes**
   - Update `src/lib/staff-training-requirements.ts` with validation metadata per baseline training.
   - Update `src/lib/staff-training-requirements.functions.ts` to perform structured AI extraction, deterministic validation, and sign-off gating.
   - Update `src/lib/hr-staff.functions.ts` so checklist rows return the new Nectar validation fields and status logic uses them.
   - Update `src/components/hr/staff-hr-checklist-card.tsx` to display validation results and failed-upload reasons.
   - Add a schema migration for the new review fields on `staff_baseline_training_completions` with proper grants/RLS preserved.