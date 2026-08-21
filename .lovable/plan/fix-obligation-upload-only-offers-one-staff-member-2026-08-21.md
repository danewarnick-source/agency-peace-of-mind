# Fix: obligation upload only offers one staff member

## What's wrong

Under Compliance > Obligations, the "File for staff / Upload evidence" panel offers a
single staff member, and which one differs by obligation.

Confirmed cause (verified against the live data): for staff obligations that are due
per-person (hire-date/anniversary driven — CPR, Background Screening, Medicaid
Disclosure, Annual 12-Hour CE, etc.) the system creates a **separate instance per
staff member**, each holding exactly one assignee row. Every one of these obligations
shows `assignees = 1` per instance in the database.

The obligation card, however, only loads the **most recently created instance** for the
obligation and builds the staff picker from that instance's assignee snapshot. So the
picker can only ever contain one person — whichever staff member's instance was
generated last.

## What to build

1. **Load all open instances, not just the latest.** For staff-scoped obligations whose
   instances are per-person, fetch every open (pending/overdue) instance for the
   obligation plus its assignee and completion rows, and build a roster of
   `{ staff_id, staff_name, instance_id }` for everyone who hasn't completed yet.
   The existing per-client (`staff_per_client`) detail query already does exactly this
   grouping and is the pattern to follow.

2. **Multi-select staff picker with Select all.** Replace the single-select popover in
   the "file for staff" panel with a checkbox list of all outstanding staff, a
   "Select all" / "Clear" control, and a count of who's selected. Same treatment for
   the per-client obligations so multiple staff+client pairs can be filed at once.

3. **Upload once, file for many.** Keep one file input. On submit, upload the file once
   per selected person to that person's own instance path and record a completion
   against each selected staff member's instance, so each person's row is satisfied
   individually. Show progress and a summary toast ("Filed for 6 staff"), and report
   per-person failures without losing the successes.

4. **Manual completion drawer.** The same multi-select + select-all treatment so an
   admin can record a manual completion for several staff at once; its target instance
   must be resolved per selected staff member rather than the card's single instance.

5. Keep the existing rules intact: attestations remain first-person (admins can't attest
   for staff), and completed staff stay out of the outstanding list.

## Technical notes

- Files: `src/components/company-obligations/obligation-card-actions.tsx`
  (`FileForStaffPanel`, `FileForInstanceButton`, `useInstanceAssignees`),
  `src/components/company-obligations/manual-completion-drawer.tsx`,
  and a shared hook for the multi-instance roster.
- `recordCompletion` already takes `instanceId` + `staffId`/`staffName`, so no server
  function or database changes are needed — the fix is entirely in how instances are
  gathered and how many completions get recorded.
- Invalidate `company-obligations`, `obligation-instance-detail`, and
  `obligation-per-client-detail` after a batch submit.
