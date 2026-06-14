# Host Home Certification — Plan

## Scope
Add a "Host Home Certification" section to the HHS client hub (`src/routes/dashboard.hhs-hub.$clientId.tsx`) only. Inspector fills a structured form → row saved → PDF certificate generated → next-due date (inspection + 1 year) surfaces in Deadlines page for HHS clients only. Full history retained per client/home.

## Database (one migration)

**`public.host_home_certifications`** — one row per completed certification.
- Identity/org: `id`, `organization_id`, `client_id` (FK clients), `team_id` (host home, nullable), `created_at`, `updated_at`.
- Header: `cert_type` (`'initial'|'annual'`), `inspection_date` (date), `inspector_user_id` (FK profiles), `inspector_name`, `host_home_address`, `inspector_not_host_confirmed` (bool, must be true to certify).
- Checklist results stored as one JSONB column `checklist` keyed by item code (e.g. `settings.choice`, `safety.smoke`, `ops.drills`) with `{ status: 'meets'|'does_not_meet'|'na', note?: string }`. Item codes enumerated in `src/lib/host-home-cert-items.ts` (single source of truth for the form).
- PCSP: `pcsp_status` (`'meets'|'does_not_meet'`), `pcsp_notes` (text).
- Determination: `determination` (`'certified'|'certified_with_corrections'|'not_certified'`), `signature_name`, `signature_title`, `signed_at` (timestamptz), `guardian_acknowledgement_name` (nullable).
- Lifecycle: `next_due_date` (date, generated `(inspection_date + interval '1 year')::date`), `certificate_pdf_path` (text, storage path).

**`public.host_home_cert_concerns`** — 0..N per certification.
- `id`, `organization_id`, `certification_id` (FK cascade), `finding`, `corrective_action`, `target_date` (date), `resolved_at` (date, nullable), `resolution_notes` (text, nullable), `created_at`.

Standard pattern for both: GRANT to authenticated + service_role, enable RLS, policies via `is_org_member` for SELECT and `is_org_admin_or_manager` for write. Indexes on `(organization_id, client_id, inspection_date desc)` and concerns `(certification_id)`.

**Storage bucket**: `host-home-certificates` (private). RLS policy: org members can read objects whose path starts with `${organization_id}/`; service_role writes from server fn.

## Server functions (`src/lib/host-home-certifications.functions.ts`)
All use `requireSupabaseAuth` + org-membership check + admin/manager role check for writes.
- `listCertifications({ clientId })` → with concerns, newest first.
- `getCertification({ id })` → row + concerns + signed download URL for PDF.
- `createCertification({ clientId, payload })` → insert cert + concerns in a transaction-equivalent (server fn ordering with rollback by deleting cert on PDF failure), then call `renderCertificatePdf`, upload to bucket, store `certificate_pdf_path`. Returns `{ id, signedUrl }`.
- `updateConcernResolution({ concernId, resolved_at, resolution_notes })`.
- `getCertificateDownloadUrl({ certificationId })` → fresh signed URL.

PDF rendering: server-side using `pdf-lib` (already present in project if available — confirm in build mode; otherwise add). Renders header (client, home address, inspector, dates, cert type), each section with item label + result + note, PCSP block, concerns table, determination, signature block. No external services.

## UI

**`src/components/hhs/host-home-certification-section.tsx`** — section card embedded in `dashboard.hhs-hub.$clientId.tsx`. Renders:
- Status pill: Certified through {next_due_date} / Due in N days / Overdue / Never certified.
- "Start new certification" button → opens dialog form.
- History list: each prior cert as a row with date, type, determination badge, "Download PDF" button, and expandable concern resolutions.

**`src/components/hhs/host-home-cert-form-dialog.tsx`** — large multi-section form (single Dialog with scrollable body, sticky footer). Sections built from `host-home-cert-items.ts`:
1. Header (client auto-filled, address prefilled from team, type radio, date, inspector name auto from profile, **required** "inspector is not host" checkbox — gates submit).
2. Settings Rule checklist (8 items, Meets/Does Not Meet/N/A toggle group + optional note).
3. Home Safety checklist (~11 items).
4. PCSP block (Meets/Does Not Meet + notes).
5. HHS Operational — for `drills`, `inventory` items, render a small "Latest on file: {date}" pulled from existing `hhs_evacuation_drills` / `hhs_client_inventories` queries with a "Confirm current" toggle; occupancy + host-age plain toggles.
6. Concerns — repeater (add/remove rows: finding, corrective action, target date).
7. Determination + e-signature (typed name + title + auto timestamp on submit) + optional guardian ack.

Submit validation:
- All checklist items must have a status.
- If determination is `certified`, `inspector_not_host_confirmed` MUST be true, and no item may be `does_not_meet` without a concern attached (soft warn → allow `certified_with_corrections`).
- Determination `not_certified` allowed without all green; concerns still capturable.

**Gating**: section + button render only when client has an active HHS billing code (reuse pattern from existing HHS hub checks). On non-HHS client workspaces, nothing changes.

## Deadlines integration

Extend `src/hooks/use-deadlines.tsx` with a 7th query: latest `host_home_certifications.next_due_date` per HHS client (and clients with HHS code but zero certs → due immediately / "Never certified", surfaced as overdue with `inspection_date = null`). New `DeadlineSource = "host_home_cert"` with icon `Home`, label "Host home certification", href to `/dashboard/hhs-hub/{clientId}#certification`. Only generated for clients that appear in the existing `hhsQ.activeIds` set — guarantees HHS-only.

No edits to existing billing, EVV, daily, or HHS attendance logic.

## Build order
1. Migration (table, concerns table, GRANTs, RLS, storage bucket + policies).
2. `src/lib/host-home-cert-items.ts` (checklist schema).
3. `host-home-certifications.functions.ts` (CRUD + PDF render + upload).
4. Form dialog + section component.
5. Mount section in `dashboard.hhs-hub.$clientId.tsx`.
6. Extend `use-deadlines.tsx` with host-home-cert source.
7. Self-check reply confirming each acceptance bullet.

## Acceptance self-check (will verify before reporting done)
- Section visible on HHS hub, absent elsewhere (no route changes for non-HHS clients).
- Form renders every listed section/item with Meets/Does Not Meet/N/A.
- "Inspector is not host" is a hard gate for `certified`/`certified_with_corrections`.
- Concerns repeater supports add/edit/resolve.
- Submit writes row + concerns and generates a downloadable PDF.
- Deadlines page shows a new "Host home certification" row dated inspection + 1y for that HHS client only.
- History list shows all prior certifications with PDF download.
