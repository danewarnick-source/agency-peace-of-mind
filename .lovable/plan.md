## Change

Remove the explanatory span message **"DHHS EVV export hidden (mixed/non-EVV codes in result)"** that appears in the Documentation Records page (`src/components/records/records-tab.tsx`) when the current filtered results contain mixed EVV/non-EVV codes. The button will simply show/not show the Utah DHHS EVV export option without the extra explanation text.

## Export button differences

- **Export Master Agency Ledger CSV** — one row per visible shift/case. Columns: Caregiver, Client, Member ID, Service code, Date, Clock in/out, Duration (min), Edited by admin, Geofence status, Exceptions, Home/Team. This is the agency's internal audit ledger.
- **Export Hours** — a payroll-shaped CSV focused on caregiver hours. Opens a popover with three options:
  - Total (billable + non-billable)
  - Billable only
  - Non-billable only
  Columns: Caregiver, Type (Billable/Non-billable), Category/Code, Date, Clock in/out, Hours.

## File to change
- `src/components/records/records-tab.tsx`
