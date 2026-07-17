Replace the optional "File Incident Report" button in the shift-end compliance form with a required Yes/No question so staff cannot skip it without making a deliberate choice. Keep the existing `IncidentReportDialog` exactly as-is — only its trigger changes.

### What we will change
File: `src/components/evv/punch-pad.tsx`

1. **Add explicit incident-answer state**
   - Introduce `incidentAnswer: 'yes' | 'no' | null` state.
   - Reset it to `null` in `openCompliance()` alongside the other form fields.

2. **Make the question a hard compliance gate**
   - Add `incidentAnswer !== null` to the `canSubmitCompliance` expression.
   - This forces staff to choose Yes or No before the Submit Timeclock button becomes active.

3. **Replace the single button with a Yes/No question block**
   - Replace the current "Something happen this shift? File the §1.27 Incident Report now" + button row with a clear question such as:  
     **"Did anything happen this shift that needs an incident report?"**
   - Render two pill-style buttons using the existing `selectedPill` / `unselectedPill` classes.
   - **No**: record `incidentAnswer = 'no'`, `incidentFlag = false`, and close the dialog. The answer is stored in the timesheet update as `incident_flag: false` for auditability.
   - **Yes**: record `incidentAnswer = 'yes'`, `incidentFlag = true`, and call `setIncidentDialogOpen(true)` exactly as the current button does.
   - If `incidentReportIds.length > 0`, lock the answer to Yes and show a "Incident report filed" summary, while still allowing the staff to open the dialog again to add another report if needed.

4. **Preserve existing incident-report hard gate on submit**
   - The existing `if (incidentFlag && incidentReportIds.length === 0)` block stays unchanged: it blocks the timesheet if they chose Yes but never submitted a report, and reopens the dialog.
   - The existing `onSubmitted` callback for the dialog continues to append the report ID and set `incidentFlag = true`.

### What we will NOT change
- `IncidentReportDialog` component, its props, or its open/close behavior.
- Any database schema or server functions; the existing `incident_flag` boolean column is used to record the answer.
- Nectar NoteTriggerPrompt behavior — it can still open the incident dialog independently when a narrative trigger is detected.

### Acceptance criteria
- The shift-end form shows a clear Yes/No incident question instead of a single optional button.
- Selecting No resolves the section and lets the user submit the timeclock when other sections are complete.
- Selecting Yes opens the existing incident report dialog and the user cannot submit the timeclock until a report is actually filed.
- The Submit Timeclock button is disabled until an answer is selected.