
## Goal

A brand-new employee with nothing on file must show required trainings as **Overdue** or **To-Do** — never "0 overdue." Today `getStaffChecklist` only checks the admin-built `nectar_requirements` list, which is usually empty, so a fresh hire silently passes. We fix that with a fixed baseline list plus behavior/ABI conditional rules, completion-by-date OR cert-upload paths, and Nectar OCR for expiration dates.

Build order is Step 1 → 5 exactly as you specified.

---

### Step 1 — Fixed baseline list

New file `src/lib/staff-training-requirements.ts` exporting `BASELINE_STAFF_TRAININGS`:

| key | title | due (days from hire) | renews | expiration tracked | conditional |
|---|---|---|---|---|---|
| `thirty_day` | 30-Day Training | 30 | annual after yr 1 → see `annual_12h` | no | all |
| `first_aid` | First Aid | 90 | every 2 yr (typical) | yes | all |
| `cpr` | CPR | 90 | every 2 yr | yes | all |
| `pct` | Person-Centered Thinking | 90 | one-time | no | all |
| `deescalation` | De-escalation Certification (MANDT / SOAR / CPI / PART / Safety Care) | 180 | per cert (default 1 yr) | yes | **only if behavior client** |
| `abi` | ABI Training | 90 | one-time | no | **only if ABI client** |
| `annual_12h` | Annual Training (12 hours) | 365 from hire, recurring yearly | yearly | no | all (after yr 1) |

Each entry has: `key`, `title`, `due_days`, `tracks_expiration`, `default_validity_months | null`, `conditional: "all" | "behavior" | "abi" | "after_year_one"`, `category: "training"`.

Pure module — no DB, no imports from server code — so client and server can both consume it.

### Step 2 — Always check every employee

Edit `getStaffChecklist` in `src/lib/hr-staff.functions.ts`:

1. After loading `base` from `get_hr_staff_checklist_base`, also load:
   - `profiles.hire_date`, `profiles.requires_deescalation` (new column, see Step 3), `profiles.requires_abi`
   - `certifications` rows for this staff (we already store completions there) so completion/expiry can be sourced from real certs as a fallback when no `staff_checklist_completion` row exists
   - assignment_map → derive `hasBehaviorClient` (any assigned client where `behavior_support_clients.features_enabled` OR client has a BC code) and `hasAbiClient` (clients flagged ABI)
2. Synthesize `ChecklistRow`s for each baseline entry whose `requirement_id` is stable: `baseline:<key>` (string ID — keep the type as `string`, no DB row required). Skip conditional entries unless the staff qualifies (`requires_deescalation || hasBehaviorClient` → include `deescalation`; same for ABI; `annual_12h` only after 1 yr from hire).
3. Merge with admin-defined `nectar_requirements` rows by deduping titles — admin list always wins on conflict so an org that defines its own version is unaffected.
4. For each row compute status using hire_date + due_days + cert/completion data:
   - cert/completion missing & `today > hire_date + due_days` → **overdue**
   - cert/completion missing & still in window → **to_do**
   - cert present & `expires_at` within 30 days → **expiring**
   - cert present & valid → **current**

Return the same `ChecklistRow[]` shape — UI changes are minimal.

### Step 3 — Behavior question on add/edit employee

- DB: add `profiles.requires_deescalation boolean default false`, `profiles.requires_abi boolean default false` (migration; will request approval).
- Form: edit the add/edit employee form (used by `src/lib/employees.functions.ts createEmployeeManually` and the matching edit screen). Add one yes/no toggle: *"Does this employee work with clients who have behavior codes (BC1, BC2, BC3) or a Behavior Support Plan?"* Persist to `profiles.requires_deescalation`. Same field/UI for ABI alongside it.
- Auto-on: in `getStaffChecklist` the behavior/ABI requirement is also enabled when assignment scan finds a qualifying client — the toggle is a manual override that can only *add*, never remove, a requirement that assignments imply.

### Step 4 — Two completion paths per training

In the existing certs/training section (`src/components/training/` — the staff-detail "Certs & Trainings" panel rendered from `src/routes/dashboard.employees.$staffId.tsx`), add two buttons per row:

- **Mark complete** → small dialog: completed date (required), expiration date (required only if `tracks_expiration`). Writes a row to `certifications` (staff_id, type=baseline key, issued_on, expires_on) AND upserts `staff_checklist_completion` so the checklist flips green.
- **Upload certificate** → file input (PDF / JPG / PNG, 10 MB cap). Uploads to existing cert storage bucket, creates the `certifications` row, links the file as `evidence_document_id`, then calls the Nectar OCR step.

Both flows clear the row's red flag because Step 2 reads from `certifications` as a fallback.

### Step 5 — Nectar reads expiration off uploads

New server function `extractCertExpiration` in `src/lib/staff-training-requirements.functions.ts`:

- Inputs: uploaded file URL + training key.
- Calls Lovable AI Gateway (`google/gemini-2.5-flash`, multimodal, image or PDF block) with a tight prompt: *"Find the expiration date on this certificate. Reply with JSON `{expires_on: 'YYYY-MM-DD' | null, confidence: 0..1}` and nothing else."*
- Writes `expires_on` to the new `certifications` row and to the checklist completion row. Sets a `nectar_suggested = true` flag in `certifications.metadata` so the UI can show *"Nectar set this — edit if wrong"* next to the date and let admin override with the existing edit control.

---

## Files touched

- **new** `src/lib/staff-training-requirements.ts` (pure config)
- **new** `src/lib/staff-training-requirements.functions.ts` (Nectar OCR server fn + mark-complete + upload-cert server fns)
- **edit** `src/lib/hr-staff.functions.ts` — `getStaffChecklist` merge + status compute
- **edit** `src/lib/employees.functions.ts` + employee add/edit form component — behavior/ABI toggles
- **edit** `src/components/training/` (the staff-detail certs panel) + `src/routes/dashboard.employees.$staffId.tsx` — add Mark complete / Upload buttons, show expiration + Nectar tag
- **migration** add `profiles.requires_deescalation`, `profiles.requires_abi`; add `certifications.metadata jsonb` if not present

No schema change to `staff_checklist_completion` is needed — baseline rows use synthetic `requirement_id` strings, which the table already accepts as text.

## Acceptance check

- New employee, zero certs → checklist shows 30-Day, First Aid, CPR, PCT, Annual all as **To-Do** with due dates from hire_date; once a due date passes they flip **Overdue**.
- Toggle "works with behavior clients" YES → De-escalation row appears.
- Assign that employee to any client with a BC code → De-escalation row appears automatically even with the toggle off.
- Mark CPR complete with date → row goes **Current**, expires_on shown.
- Upload a CPR PDF → row goes **Current**, expires_on auto-filled by Nectar with an "edit" affordance.
