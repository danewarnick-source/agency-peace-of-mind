# PCSP AI Import — single entry point, full-profile extraction

## 1. Audit & remove per-section import buttons

Search and delete every per-section "NECTAR import / auto-fill / upload-to-fill" control on the client profile. Keep general file storage; remove parse-and-fill.

Known targets (will grep to confirm full list before editing):
- Identity & Contact — "NECTAR Import — Auto-fill from Document"
- `src/components/clients/billing-codes-detail.tsx` — "Upload PCSP to auto-fill rates"
- `src/components/medications-manager.tsx` — "NECTAR Import"
- `src/components/clients/client-documents-card.tsx` — "NECTAR Analyze — Index for AI Search" (the parse-to-fill action; keep plain upload + RAG indexing)
- Any other section card (Care, Funds, Goals, Behavior Support, Rights, Custom Attributes) with import/upload/auto-fill — grep `NECTAR Import|Auto-fill|Upload PCSP|extractClientFromPdf|parseClientBudgetDocument` across `src/components/clients`, `src/components/behavior-support`, `src/components/hr` and route files.

After this pass: zero per-section parse-to-fill buttons; only general-purpose file upload remains where appropriate.

## 2. Single entry point: NECTAR Bulk Import → AI PDF mode

Keep the existing button in the client admin (CSV/Excel/PDF). Only the PDF/AI branch expands. CSV/Excel roster mode is untouched.

Files: `src/components/ai-pdf-importer.tsx`, `src/components/bulk-importer.tsx` (or wherever NECTAR Bulk Import lives — confirm during edit).

## 3. Expand extraction (server)

File: `src/lib/pdf-import.functions.ts` — extend `extractClientFromPdf` schema + system prompt + commit fn.

New extracted fields (all nullable; never fabricate):
- Identity: first_name, last_name, preferred_name, medicaid_id, date_of_birth, phone
- Address: service_address (street, city, state, zip)
- Guardian/legal: name, phone, relationship, legal_status
- Emergency contacts: primary + secondary (name, phone, relationship)
- Authorized services table → rows of {service_code, units_per_year, rate, frequency, auth_start, auth_end}
- Medications → rows of {name, dose, route, schedule, indication, prescriber, prn_params}
- PCSP goals → rows of {objective, target_date}
- Clinical alerts: diet, swallowing, seizure_protocol, choking_aspiration, de_escalation
- Behavior: bc_tier, assigned_behaviorist
- Rights restrictions: list + hrc_approval_date, hrc_review_date
- Unmapped blocks → `additional_sections: [{ label, content }]` (diagnoses+ICD-10, allergies, immunizations, risk assessment, daily schedule, communication dictionary, financial/rep-payee, support team, review history — anything else the model finds)

System prompt is updated to instruct: extract verbatim, return `null` for anything not present, never invent.

New `commitClientFromPdf` behavior:
- Upsert client by medicaid_id then name (existing logic).
- Update top-level `clients` columns for identity/contact/guardian/emergency/clinical alerts (use existing columns; add migration only if columns truly don't exist — confirm via schema read before any migration).
- Upsert into `client_billing_codes` (one row per service_code; replace on conflict of client_id+service_code).
- Upsert into `client_medications` (match by name+dose; insert if new).
- Upsert PCSP goals into `clients.pcsp_goals` (already supported).
- Behavior tier + behaviorist → existing fields on clients/behavior_support_clients.
- `additional_sections` returned to client for the new prompt (NOT auto-saved).

## 4. PCSP file dedupe + storage

In the AI PDF import flow:
- Before upload, query `client_documents` for an existing `doc_type = 'PCSP'` for this client.
- If found, overwrite that storage object (same path) and update the existing row's `updated_at` + `parsed_at`. Do not insert a new row.
- Continue RAG-indexing the (single) stored PCSP.

## 5. Review & confirm UI

In `ai-pdf-importer.tsx` (after extraction, before commit):
- Show extracted summary grouped by section. Each populated field rendered with a "from PCSP" badge and an inline editable input.
- "Additional information found in this PCSP" panel: one card per `additional_sections[]` item with Create / Skip buttons. Create writes a row into `custom_field_values` (using a new or existing `custom_field_definitions` row keyed by label) for that client.
- Single "Confirm & save" action calls `commitClientFromPdf` with the (possibly edited) payload + the user's create/skip decisions for additional sections.
- After save: toast "NECTAR filled N fields from the PCSP."

## 6. Don't break

- Don't touch other hubs, employees, or unrelated backend.
- Profile/Care/Activity/Funds tabs preserved.
- RLS untouched; respect existing PHI gates (admin-only).
- CSV/Excel roster import unchanged.

## Technical notes

- Schema check first: read columns on `clients`, `client_medications`, `client_billing_codes`, `client_documents`, `custom_field_definitions`, `custom_field_values`. Only propose a migration if a field truly has no home and the user requests persistence; otherwise route unmapped content through custom fields.
- All extraction uses Lovable AI gateway (`google/gemini-2.5-pro`) via existing pattern in `pdf-import.functions.ts`.
- Strict: never fabricate. Schema validators allow null/empty; UI shows blank when null.
- Idempotent commit: re-running on the same PCSP must not duplicate billing codes, meds, goals, or document rows.

## Acceptance

- Re-uploading the sample PCSP populates: name, Medicaid ID, DOB, phone, service address, guardian, emergency contact, billing codes w/ units+rates, all meds, all goals, clinical alerts, BC tier, behaviorist.
- "Additional information" prompt appears for diagnoses, allergies, risk assessment, daily schedule, communication dictionary, financial, support team.
- Only one PCSP row in client documents after multiple uploads.
- Zero per-section parse-to-fill buttons on the profile.
- No fabricated values; auto-filled fields badged "from PCSP."
