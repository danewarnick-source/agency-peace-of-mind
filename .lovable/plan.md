
# Host Home Certification — relocate to Host Home Providers board

The previous build put certification on the HHS client hub. The contract reality is that it belongs to the **host home** at the moment of placement (with the specific person being placed), then recertifies annually. This plan moves it to the Host Home Providers board, ties each certification to a host + person, and tightens the attestation/signature/notes rules.

## 1. Schema (one migration)

Extend `host_home_certifications`:
- `hhp_cue_card_id uuid references hhp_cue_cards(id) on delete set null` — the host home this cert is for. Indexed.
- `attestation_confirmed boolean not null default false` — required attestation checkbox state.
- `attestation_text text` — frozen attestation wording stored with the record.
- Trigger: when `determination = 'certified'` and `hhp_cue_card_id` is set, update the matching `hhp_cue_cards.status` to `'placed'`.
- DB CHECK: when `determination` in (`certified`, `certified_with_corrections`), require `attestation_confirmed = true` AND `inspector_not_host_confirmed = true` AND `signature_name <> ''` AND `signature_title <> ''`.

Concerns table (`host_home_cert_concerns`) is already correct — no change.

RLS: existing admin/manager-only insert/update/delete policies stay; SELECT stays org-member (cards rendered only inside admin/manager UI surfaces).

## 2. Server functions (`src/lib/host-home-certifications.functions.ts`)

- Extend `createHostHomeCertification` input: `hhp_cue_card_id`, `attestation_confirmed`, `attestation_text`.
- Server-side guard: reject when certifying and any of (attestation, not-host, signature name/title) is missing, or when any `does_not_meet` checklist item is missing a note.
- New `listHostHomeCertificationsForHost({ organization_id, hhp_cue_card_id })` for the host card history view.
- Keep existing `setHostHomeCertificatePdfPath` and `resolveHostHomeCertConcern`.

## 3. Hosts board UI (`src/components/hosts/hosts-page.tsx`)

In `HostDetailDialog`, add an **admin/manager-only** "Certification" panel (gated on `canManage` already in scope; staff never see it):
- Status pill: Never certified / Overdue Xd / Due in Xd / Certified through YYYY-MM-DD (derived from latest cert for this host).
- "New certification" / "Renew" button → opens the form dialog, prefilled with host address and host name.
- History list: every cert ever done on this host (across people), showing person name, date, type, determination, concerns, PDF download.

A small status badge also surfaces on the host card in the kanban (Cert ✓ / Due / Overdue).

## 4. Form dialog (move + extend the existing component)

Move `host-home-certification-section.tsx` logic into `src/components/hosts/host-home-certification-dialog.tsx`. Behavior changes:

- **Person selector at the top**: required dropdown of org HHS clients (active, service_codes contains `HHS`). The cert is saved with that `client_id`. Required to submit.
- Host home auto-filled (name, address) from the `hhp_cue_card`.
- Checklist content unchanged; **note becomes required for every "Does Not Meet" item** — submit disabled until each note is non-empty.
- Required attestation checkbox with the exact contract wording:
  > "I attest that I personally conducted this inspection, that I am not the host home staff, and that the findings recorded here are true and accurate to the best of my knowledge."
- E-signature fields: printed name (required), title (required), date (auto = today). Already collected; now hard-required in submit gate and on the server.
- Optional person/guardian acknowledgement line (already present).
- Submit gate, all required: person selected, all checklist items answered, every DNM has a note, `inspector_not_host_confirmed`, `attestation_confirmed`, sigName, sigTitle, determination chosen.

## 5. Certificate PDF (`src/lib/host-home-certificate-pdf.ts`)

Add to the rendered PDF:
- Host home name + address header.
- Person certified for (client name).
- Full attestation paragraph.
- "Signed by" block (name, title, date) + acknowledgement line if present.
- Each "Does Not Meet" item with its required note.
- Concerns table with corrective action and target date.

Existing private bucket `host-home-certificates` and signed-URL download flow stay.

## 6. Deadlines integration (`src/hooks/use-deadlines.tsx`)

Source already includes `host_home_cert`. Adjust so:
- The deadline row is keyed by (host, client) and only listed for active HHS clients with a placement (host's `status = 'placed'` and a latest cert).
- "Missing certification" rows surface only when an HHS client has an assigned host with no cert on file.
- Label: "HHS Certification — {client} @ {host}".

## 7. HHS Hub cleanup

Remove the `HostHomeCertificationSection` from `dashboard.hhs-hub.$clientId.tsx`. Leave a small read-only "Latest certification" badge that links the admin/manager over to the host on the Host Home Providers board.

## 8. RBAC

All cert UI (host card panel, dialog, history, PDF link) is rendered only when `usePermissions().can('manage_referrals')` is true (same gate already used for the Hosts board write actions, which is admin/manager). Staff routes and HHS staff views never render any cert affordance.

## Acceptance checks (must all be true before reply)

1. Cert lives inside the Host Home Providers board → host detail dialog. Hidden for staff.
2. Each cert row stores both `hhp_cue_card_id` and `client_id`.
3. Form renders every section; each checklist item supports Meets / Does Not Meet / N/A.
4. Submit blocked until every "Does Not Meet" has a note (client + server).
5. Submit blocked until `inspector_not_host_confirmed` is checked.
6. Submit blocked until attestation checkbox + signature name + signature title are all set.
7. Concerns editor with finding, corrective action, target date, and post-submit resolution.
8. On submit: row inserted, PDF generated, uploaded, path stored; PDF shows checklist, DNM notes, attestation, signature.
9. `Certified` determination moves the host's kanban status to `placed` via trigger; new deadline appears one year out in the Deadlines page (HHS only).
10. Per-host history list shows every past cert with PDF download.

## Build order

1. Migration (schema + trigger + check).
2. Server fns update.
3. New `host-home-certification-dialog.tsx` (moved + extended).
4. Wire into `HostDetailDialog` + host kanban card badge.
5. PDF renderer update.
6. Deadlines query update.
7. Remove cert section from HHS Hub, add small link badge.
8. Manual self-check against the 10 acceptance items.
