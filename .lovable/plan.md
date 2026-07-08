Plan to fix the HR Admin crash on `/dashboard/hub/employees?tab=hr-admin`:

1. Reproduce the exact page
   - Open the Employees hub with `tab=hr-admin` in a browser session.
   - Capture the React error stack / console component stack so the exact component is identified, not guessed.

2. Audit the active render path only
   - Check `EmployeesHub` → `HubShell` → `HrAdminPage` → `HrComplianceMatrix` → `HeaderLabel` / `CellView` / `AnnualHoursCell` / `OtherAssignmentsRollup`.
   - Look specifically for hooks called after early returns, inside conditional branches, inside loops, or only after data loads.

3. Apply the smallest hook-order fix
   - Move any remaining hooks to the top level of the offending component.
   - If the stack points to the matrix header labels, remove per-column stateful tooltip hooks from `HeaderLabel` and let the tooltip render uncontrolled, preserving the short-label header and full-sentence hover behavior.
   - Keep the HR Admin UI and data logic unchanged.

4. Validate the fix
   - Re-open `/dashboard/hub/employees?tab=hr-admin`.
   - Confirm the dashboard shell no longer shows “Rendered more hooks than during the previous render”.
   - Confirm the HR Compliance Matrix renders and still shows topic-style column titles with full requirement sentences on hover.

Report back with the exact component/hook that caused the violation and confirmation that the HR Admin tab loads.