# Fix "Access denied" on Set hire dates + add bulk hire-date editor

## What's wrong (verified)

Two separate problems:

1. **Permissions are not seeded for True North Supports.** The org's permission matrix contains only two rows (`manage_users` and `send_emails`, for admin and super_admin). Every other permission — including `View staff records` — is missing, and the app deliberately has no fallback to the built-in default matrix. So an admin (your account is admin, not super_admin) is denied on the Employees page, which is where the "Set hire dates" link points.

2. **There is no bulk hire-date screen.** The link goes to the Employees list, where hire dates can only be set one person at a time through each profile.

## Plan

### 1. Seed the full permission matrix for every organization
Run a migration that inserts the built-in default role/permission set for all organizations that are missing rows, so admins, managers, employees and committee members get the access they're supposed to have. Existing rows are left untouched (nobody's custom configuration is overwritten). This fixes the access-denied error everywhere it's hiding, not just on this page.

### 2. Add a bulk "Set hire dates" screen
New page at `/dashboard/employees/hire-dates`:
- Lists every active staff member in the org with their current hire/start date.
- A "Missing hire date" filter, on by default, so the people blocking due-date calculation are front and center.
- An editable date field per row; edit as many as you want, then one **Save all** button writes them in a single batch.
- Shows a count of pending changes and confirms how many were saved.

### 3. Point the warning banner at it
The "N staff members have no hire date — Set hire dates" link on the obligation card will link to the new page instead of the general Employees list.

## Technical notes

- Migration: insert-select from the default matrix into `role_permissions` with `ON CONFLICT DO NOTHING`, scoped per organization.
- New route file `src/routes/dashboard.employees.hire-dates.tsx`, gated by `view_staff_records` + a write check for editing.
- Writes go through a server function that verifies org membership and manager-or-above role, then updates `profiles.start_date` and mirrors to `hire_date` (matching existing employee-creation behavior).
- Saving invalidates the obligation instance queries so due dates recalculate immediately.
