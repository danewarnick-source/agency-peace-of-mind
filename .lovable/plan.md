## Scope

Three connected features on the org/PHI seam:

1. **Org logo upload** (platform-wide branding)
2. **Client & staff photos** at intake / on file
3. **Client Face Sheet** printable emergency PDF

All storage in existing private, org-scoped buckets. All rendered fields either come from real records or literally say **"Not on file"** — no fabrication.

---

## 1. Org Logo

### Schema (migration)
```
public.organization_branding
  organization_id  uuid PK -> organizations.id
  logo_path        text        -- storage key in bucket 'org-branding'
  logo_uploaded_at timestamptz
  updated_by       uuid
  updated_at       timestamptz
```
RLS: members read; admin/manager write via `is_org_admin_or_manager`. Standard GRANTs.

### Storage
New private bucket `org-branding`. Path convention: `{organization_id}/logo.{ext}`. RLS on `storage.objects` restricts read/write to org members / admins.

### Server fns (`src/lib/org-branding.functions.ts`)
- `getOrgBranding({ organizationId })` → `{ logoPath, signedUrl | null }` (signed URL, 1h)
- `setOrgBrandingLogo({ organizationId, logoPath })` (admin/manager only)
- `clearOrgBrandingLogo({ organizationId })`

### UI
- New card in `dashboard.settings` area (Company/Branding section): upload → preview → save.
- Fallback rule (documented in one shared `<OrgLogo>` component): if no logo, render org name in large title font. Never a broken img.

---

## 2. Client & Staff Photos

### Client photo
Table `clients` already has `client_photo_url` and `profile_photo_url`. Repurpose `client_photo_url` as the storage path; add `client_photo_taken_at date` (face sheet needs "date of photo") via migration.

### Staff photo
`profiles` has no photo. Migration: `profiles.photo_path text`, `profiles.photo_updated_at timestamptz`.

### Storage
Reuse `client-photos` bucket (already private, org-scoped). New bucket `staff-photos` (private, org-scoped) for staff. Path: `{organization_id}/{userId}/photo.{ext}`.

### Server fns
- `setClientPhoto({ clientId, path, takenOn })` — admin/manager or assigned staff
- `setStaffPhoto({ staffId, path })` — self or admin
- `getSignedPhotoUrl({ kind, id })` — 1h signed URL

### UI
- Client intake form + client profile page: photo upload block with take-date picker; falls back to initials avatar.
- Staff/profile edit page: photo upload; falls back to initials avatar.
- Shared `<PersonAvatar>` component (client + staff) — initials fallback with existing pill/name layout preserved.

---

## 3. Client Face Sheet PDF

### Button
On `dashboard.workspace.$clientId` (client profile), add "Client Face Sheet" button in the header. Click → opens new tab to `/api/public/client-face-sheet/:clientId?token=...` — actually **authenticated route**: use a server function that streams the PDF, opened in new window via a signed short-lived download URL, OR simpler: server route under `src/routes/api/client-face-sheet.$clientId.ts` gated by `requireSupabaseAuth` (bearer via attached middleware). Server routes don't run through function middleware, so we'll pass a short-lived signed token minted by a server fn and verified by the route (single-use JWT with clientId + userId + exp 60s).

Route path (private, not `/api/public/`): `src/routes/api/client-face-sheet.$clientId.ts`. Verifies token → loads data → returns `application/pdf`.

Wait — server routes not under `/api/public/` **are** auth-gated at the platform level in this stack? Simpler and safer: **generate PDF via `createServerFn`** returning a base64 blob, and open it client-side via `URL.createObjectURL(new Blob(...))` in a new tab. No token dance, no public route. This is the chosen approach.

### PDF library
`pdf-lib` (pure JS, Worker-safe, ~200KB, works in Cloudflare workerd). Already a project pattern-fit vs reportlab/puppeteer. Install: `bun add pdf-lib`.

### Server fn `generateClientFaceSheet({ clientId })`
Returns `{ pdfBase64, filename }`. Loads via `requireSupabaseAuth`:
- clients row (all identity/address/insurance columns)
- org row + `organization_branding` (fetch signed logo URL, download bytes for embed)
- `client_emergency_contacts` (2 rows: primary/secondary)
- guardian columns on clients OR `client_external_services` (physician/dentist/psych/day-program/residential/support-coordinator)
- `support_coordinators` (phone/email)
- client photo bytes (if any)

Renderer builds a single letter-size page with the mandated layout. **Every field that resolves to null/empty/undefined renders as the string "Not on file"** — enforced by a single helper `field(v)` used for every value.

### Face sheet fields — data source per field

| Field | Source | Migration needed? |
|---|---|---|
| Org logo | organization_branding.logo_path | new |
| Org address, phone | organizations columns (existing) | no |
| Intake date | clients.created_at or intake_completed_at | no |
| Client name | clients.first/last_name | no |
| Client photo + date | clients.client_photo_url + client_photo_taken_at | add taken_at |
| PCSP date | clients.pcsp_expiration_date (or new pcsp_signed_date) | add pcsp_signed_date |
| PID# | clients.external_id or new client_pid | add client_pid if not present |
| Address, phone, DOB | existing | no |
| Place of birth | new clients.place_of_birth | add |
| SSN | existing (masked last-4 only on face sheet) | no |
| Ethnic origin, religion | new clients.ethnic_origin, clients.religion | add |
| Medicaid case #, Medicaid #, Medicare #, private insurance | clients.medicaid_id + new medicaid_case_number, medicare_number, private_insurance | add missing |
| Utah ID / exp | new clients.state_id_number, state_id_expires_on | add |
| Payment / income sources | new clients.payment_sources text[], income_sources text[] | add |
| Legal guardian(s) | existing clients.guardian_name/phone or client_emergency_contacts flagged is_guardian | check + add flag if needed |
| Emergency contacts | client_emergency_contacts | no |
| Support coordinator | support_coordinators | no |
| Residential / day program | client_external_services (service_type filter) | no |
| Physician / dentist / psychiatrist | client_external_services | no |
| Pertinent health, allergies, dietary | new clients.pertinent_health_notes, allergies, dietary_needs | add |
| Height, weight, hair, eyes | new clients.height, weight, hair_color, eye_color | add |
| Places frequented | new clients.places_frequented text | add |

Migration will add exactly the missing columns after inspecting the current `clients` schema (94 columns — some may already exist; migration will be `ADD COLUMN IF NOT EXISTS`).

### Fabrication guard
Central `field(v)` helper: `String(v ?? '').trim() || 'Not on file'`. Every value drawn through it. Arrays render items or "Not on file" if empty. No AI/NECTAR inference on the face sheet — only literal DB values.

---

## Verification report

After build:
- List migrations shipped (new tables/columns/buckets)
- Confirm logo fallback: `<OrgLogo>` renders org name text when path is null
- Confirm avatar fallback on client + staff files
- Confirm face-sheet "Not on file" for every unpopulated field
- Confirm no field is autofilled from any inferred source

---

## Files to add/edit

**Migrations** (one file):
- `organization_branding` table + policies + GRANTs
- Missing `clients` columns (`ADD COLUMN IF NOT EXISTS`)
- `profiles.photo_path`, `photo_updated_at`

**Storage tool calls**:
- create bucket `org-branding` (private)
- create bucket `staff-photos` (private)
- RLS on `storage.objects` for both

**New code**:
- `src/lib/org-branding.functions.ts`
- `src/lib/person-photos.functions.ts`
- `src/lib/client-face-sheet.functions.ts` (server fn: builds PDF via `pdf-lib`)
- `src/components/branding/org-logo.tsx` (with text fallback)
- `src/components/person/person-avatar.tsx` (initials fallback)
- `src/components/settings/org-branding-card.tsx`
- `src/components/clients/client-photo-upload.tsx`
- `src/components/clients/face-sheet-button.tsx`

**Edits**:
- Settings route: mount `OrgBrandingCard`
- Client profile route (`dashboard.workspace.$clientId`): mount photo upload + face-sheet button
- Client intake surface: mount photo upload
- Staff/profile edit: mount photo upload + avatar

**Deps**: `bun add pdf-lib`

---

## Explicit non-goals

- No public share links for the face sheet (auth-only, in-app render)
- No AI-assisted field guessing on the face sheet
- No changes to real-client cutover: intake data + PCSP fields are the source, matching existing seam
