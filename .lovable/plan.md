In the NECTAR smart-import review page (`src/routes/dashboard.smart-import.$jobId.review.tsx`), the "Certs / training" tab currently appears for both employee and client imports. Since certifications and trainings only apply to employees/staff, hide this tab when the import subject is a client.

Changes:
- In `SubjectReview`, conditionally render the "Certs / training" `TabsTrigger` only when `jobMode !== "client"`.
- Adjust `TabsList` grid class from fixed `grid-cols-5` to dynamic: `grid-cols-4` for client mode, `grid-cols-5` for employee mode.
- Conditionally render the `TabsContent value="certs"` block only when `jobMode !== "client"`.

No other files touched.