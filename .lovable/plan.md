I found the previous fix was too narrow: the Face Sheet generator still has several `.maybeSingle()` / `.single()` calls that can throw the same “JSON object requested, multiple (or no) rows returned” error if supporting data is missing or duplicated. The live data for Jake confirms he belongs to two organizations, and the current-org server helper is not available as expected, so relying on that helper is not enough.

Plan:
1. Update the Face Sheet server function input to include the active `organizationId` from the employee profile page.
2. Pass `orgId` from `src/routes/dashboard.employees.$staffId.tsx` into `EmployeeFaceSheetButton`, and from the button into `generateEmployeeFaceSheetFn`.
3. Update `src/lib/employee-face-sheet.ts` so it uses that explicit organization id for the employee membership lookup instead of calling the current-org RPC.
4. Make the single-row reads resilient:
   - use `.limit(1)` on organization, branding, profile, and team reads where duplicates/missing rows should not block PDF generation;
   - keep “employee membership in this org” as the only required lookup;
   - change ship-to-file insert to tolerate a normal single returned id without surfacing the PostgREST object error.
5. Verify the Face Sheet path by loading Jake’s employee page and clicking Preview/Download where possible, confirming the previous toast no longer appears.