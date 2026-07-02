## Promote Employee Loans to a top-level Employees tab

Employee Loans is currently a sub-tab nested inside HR Admin. Move it up one level so it sits as its own tab in the Employees hub, next to Compliance/HR Admin.

### Changes
1. **`src/routes/dashboard.hub.employees.tsx`**
   - Extend the `tab` search-param enum to include `"loans"`.
   - Add a fourth `HubTab`: `{ key: "loans", label: "Employee Loans" }`, rendering `<EmployeeLoansPanel />` wrapped in `<RequirePermission perm="manage_users">`.

2. **`HrAdminPage`** (the component behind the HR Admin tab)
   - Remove the inner "Employee Loans" sub-tab so the panel isn't shown twice. HR Admin keeps only "Compliance & training".

### Final Employees hub tab order
Roster · Hosts · HR Admin · Employee Loans

Pure UI reorganization — no schema, RLS, or business-logic changes.