## Change 1 — Remove redundant Shifts tab (staff profile)

File: `src/routes/dashboard.employees.$staffId.tsx`

- Drop the `<TabsTrigger value="shifts">` and its `<TabsContent value="shifts">` (lines 155, 275-278). Final tabs: Overview · Certs & trainings · Activity · HR docs · Deadlines.
- Delete the now-orphan `StaffShiftsPanel` function.
- Bring the columnar shift detail into `ActivityFeed` so nothing is lost:
  - Fix the existing query: it currently selects only `id, status, clock_in_timestamp, clock_out_timestamp` but reads non-existent `r.service_code`, `r.units`, `r.client_id`. Update the select to match StaffShiftsPanel's columns (`id, client_id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, billed_units`) and resolve client names with the same secondary `clients` lookup StaffShiftsPanel uses.
  - Extend `ActivityItem` for `Shift` rows with `clientId`, `clientName`, `serviceCode`, `units`.
  - When the active filter is `Shift`, render the same Date · Client · Code · Status · Units table (Client cell links to the client profile). All other filters keep the existing list rendering.

## Change 2 — "+ Upload" buttons that reuse existing flows

### A. Client profile — Documents tab
File: `src/routes/dashboard.clients.$clientId.tsx`

The existing `DocumentsPanel` reads from a different/legacy `client_documents` table. The canonical, fully-built client upload component is already in the repo: **`src/components/clients/client-documents-card.tsx`** (`ClientDocumentsCard`). It wraps the NECTAR ingest flow (`ingestDocument` → `queryDocuments` → `deleteDocument` server fns in `src/lib/nectar-documents.functions.ts`), so uploads automatically show up in `dashboard.nectar-docs`.

- Replace the `<DocumentsPanel/>` render in the Documents tab with `<ClientDocumentsCard clientId={clientId} clientName={…} />`. Pull `clientName` from the existing client query already loaded on this route.
- Remove the now-unused `DocumentsPanel` function. The card already provides the "+ Upload document" button, PDF/text/CSV accept set, NECTAR parse, and the appears-in-Company-Docs behavior described in its own subtitle.

### B. Staff profile — Certs & trainings tab
File: `src/routes/dashboard.employees.$staffId.tsx`

Reuse the existing `UploadDialog` from `src/routes/dashboard.external-certifications.tsx` (uploads to `certificates` storage bucket + inserts into `external_certifications`, with `expires_at` already feeding the Deadlines spine).

- Refactor that dialog (lightly) so it accepts an optional `targetUserId` prop and uses it for `user_id` instead of always `user.id`. Default = self (preserves current page behavior). Export it from the same file.
- In `RequirementsTab` header (Certs & trainings tab), render a `+ Upload certificate` button that opens that dialog with `targetUserId={staffId}`. Admin/manager gated via existing `usePermissions().can("manage_users")` pattern used elsewhere on this route.
- HR docs tab: add a small `+ Upload HR document` button in `StaffHrDocsPanel`'s `CardHeader` that links to the existing HR checklist upload flow (`/dashboard/employees` → HR checklist), matching the existing "Manage in HR checklist →" link. No new uploader — HR docs are sensitive and stay in the existing gated flow.

## Reused components / flows (no parallel uploader)

| Surface | Reuses |
|---|---|
| Client profile Documents tab | `ClientDocumentsCard` → `ingestDocument`/`queryDocuments` server fns → NECTAR `documents` storage (visible in `/dashboard/nectar-docs`) |
| Staff profile Certs & trainings upload | `UploadDialog` from `dashboard.external-certifications.tsx` → `certificates` storage bucket → `external_certifications` table → Deadlines via `expires_at` |
| Staff profile HR docs upload | Link to existing HR checklist flow (gated PII path) |
| Activity → Shifts detail | Same `evv_timesheets` query shape used by current `StaffShiftsPanel` |

## Out of scope
Billing, EVV rules, Records tab, scheduling, RLS/schema changes. No new tables, buckets, or server functions.
