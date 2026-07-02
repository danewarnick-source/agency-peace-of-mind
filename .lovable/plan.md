
## What the Review step does today

The Smart Import wizard walks an admin through 8 steps for each pending person:

1. **Person & contacts** — name, DOB, Medicaid ID, address, guardians
2. **Health & medical** — diagnoses, allergies, ABI/DNR/Human Rights flags, providers
3. **Medications / MAR** — the medication list that feeds MAR/eMAR
4. **PCSP goals** — goals + rationale, responsibilities, data-capture
5. **Services** — billing codes (Ours vs External, HIVE approvals, "Not my org")
6. **Plan & documents** — PCSP + supporting documents
7. **Staff & training** — caseload assignment + code-scoped training rows
8. **Review** — *this is the final step*

Right now Step 8 shows only three things:

- **NECTAR asks** — any outstanding clarification questions Nectar generated
- **Provisioning forecast** — a preview of which app features will be turned on for this person (e.g. "time clock will create — matched DSI", "daily logs will create — matched HHS"), with per-item override dropdowns
- **"Ready to create"** confirmation card pointing back up at the **Complete client setup** button in the header

It does **not** recap what was actually captured in Steps 1–7. That's the gap your screenshot is pointing at — the final page should be the single scannable "here's everything about this person that's about to be committed" view.

## What I'll add to the Review step

Rebuild Step 8 as a **full read-only outline** of the import, grouped by wizard step, with counts, values, and a "Jump back to edit" link on each section. Keep NECTAR asks + Provisioning forecast + Ready-to-create where they are; the summary sits above them.

### Sections (in order)

1. **Header strip** — Person name, org, source (upload / white-glove), # source documents, extraction confidence, and a "Missing to finalize" chip (last name / required blockers only).
2. **Person & contacts** — first/last, DOB, Medicaid ID, mailing address, phone, support coordinator (name + company), guardians (name/relationship/phone). Amber inline "missing" badges for empty required fields.
3. **Health & medical** — diagnoses list, allergies list, ABI / DNR / Human Rights flags, PCP + specialists.
4. **Medications** — count + a compact table (name, dose, route, frequency, PRN reason). "0 medications — none extracted" when empty.
5. **PCSP goals** — count + per-goal one-line summary (title · completeness "X of 8 fields") with amber "needs input" if any goal is incomplete.
6. **Services / billing codes** — table of committed rows:
   - **Ours** codes → will create billing authorizations (rate, unit, cap, plan dates)
   - **External** codes → will file to client_external_services OR are pending HIVE approval (status shown)
   - **Not my organization** codes → shown greyed, labeled *Informational only — not billed or tracked*
7. **Plan & documents** — PCSP file + any supporting documents (name, type, page count).
8. **Staff & training** — caseload roster (staff scoped by service code) and per-code training requirements that will be assigned.
9. **Provisioning forecast** — kept as-is (features that will be enabled).
10. **NECTAR asks** — kept as-is (open clarification questions).
11. **Ready to create** — kept, but reworded to reference the summary above ("Everything above will be created for {name} when you click Complete client setup").

Each section header has:

- A count / status chip (e.g. `4 diagnoses`, `2 goals · 1 incomplete`, `3 billing rows · 1 external pending HIVE`)
- A small **"Edit in Step N"** link that switches the wizard back to the source step

Empty sections render a muted `— none captured —` line rather than being hidden, so nothing silently disappears from the review.

### Behavior rules

- Read-only. All editing still happens in Steps 1–7; Review never mutates.
- Uses data already loaded by `getReviewSubject` — no new server functions, no extra round trips.
- Rows marked `ownership_ack === "not_ours"` are shown in the Services section as informational only and excluded from the "will create" counts (matches the finalize pipeline we already have).
- Amber "needs input" chips reuse the same completeness logic as the individual step panels so counts match.

## Technical section

- File touched: `src/routes/dashboard.smart-import.$jobId.review.tsx` only.
- New component `ImportSummaryPanel({ subjectId, fields, subject, onJumpToStep })` rendered at the top of the `step === "review"` branch (around line 624).
- Field grouping helpers reuse existing `parseMedicationReviewRow`, `parseBillingRow`, `parseGoalReviewRow`, and `labelForField` — no new parsers.
- Section rows are plain `<dl>` / compact table markup using existing Tailwind utility classes and shadcn `Badge` / `Button` variants; density matches the rest of the wizard (`text-[11px]`, `h-7` controls) so it stays on one screen on a MacBook.
- "Jump back" buttons call the existing `setStep(id)` used by the StepRail — no router navigation.
- No schema, no server-function, no migration changes.
