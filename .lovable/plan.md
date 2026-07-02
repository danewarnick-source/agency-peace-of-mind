
## Employee Loan Ledger (HR Admin tab) + built-in e-sign

Mirror the existing Client Loan feature for staff, add it as a tab inside HR Admin, and add a built-in ESIGN-Act-compliant e-signature flow (no DocuSign needed). Admin sends → staff gets an email with a secure magic link → staff reviews the full agreement, types/draws signature, clicks Sign → signed record locks with timestamp + IP + user-agent.

### Data model (new migration)

- `employee_loans` — same shape as `client_loans` but keyed to `staff_id (uuid, FK profiles.id)` instead of `client_id`. Fields: borrower_name, lender_name, agreement_date, purpose, advance_amount/cadence, direct_payment_amount/cadence/due_day/start_date/description, interest_rate/notes, repayment_conditions (jsonb), maturity_date, repayment_method, voluntary_ack, signature_parties (jsonb), notes, status (draft | sent_for_signature | signed | active | closed | void), organization_id, created_by, timestamps.
- `employee_loan_entries` — ledger entries (advance / direct_payment / repayment / adjustment), identical to `client_loan_entries`.
- `employee_loan_signatures` — one row per signing event: loan_id, signer_type ('employee' | 'org_rep'), signer_name, signer_email, signature_image (base64 PNG of drawn sig or rendered typed sig), signature_method ('typed' | 'drawn'), signed_at, signer_ip, signer_user_agent, agreement_snapshot (jsonb — frozen copy of the agreement text at signing time), token_id.
- `employee_loan_signature_tokens` — magic-link tokens: id, loan_id, signer_email, token_hash (sha256), expires_at (72h), used_at, created_by.
- RLS: admins/managers of the org can read/write loans, entries, and issue tokens. Staff can NEVER list or query these tables. Signature tokens are validated via a server function that bypasses RLS through `supabaseAdmin` after verifying the token hash — the staff signer is anonymous to RLS.
- GRANTs to `authenticated` and `service_role` on every new table.
- No org-wide attestation gate (per your answer).

### Server functions (`src/lib/employee-loans.functions.ts`)

Admin-only, guarded by `requireSupabaseAuth` + org admin/manager check:
- `listEmployeeLoans`, `getEmployeeLoan`, `upsertEmployeeLoan`, `deleteEmployeeLoan`
- `addEmployeeLoanEntry`, `deleteEmployeeLoanEntry`
- `sendEmployeeLoanForSignature({ loan_id, signer_email, signer_name })` — creates a token row (random 32-byte token, stores sha256), snapshots agreement into token payload, emails signer via existing `send-email` edge function with link `https://<host>/sign/employee-loan/{token}`. Marks loan `status='sent_for_signature'`.
- `getEmployeeLoanForSigning({ token })` — public server fn (no auth). Validates token hash, not expired, not used. Returns the agreement snapshot only (no other org data).
- `submitEmployeeLoanSignature({ token, signer_name, signature_image, signature_method })` — public server fn. Re-validates token, captures IP + UA via `getRequest()`, inserts `employee_loan_signatures` with frozen snapshot, marks token used, advances loan status to `signed`, then `active` once the org rep also signs (or immediately if the loan carries an org-side attestation already).
- `voidEmployeeLoanSignatureToken` — admin cancel of a pending link.

### Routes

- `src/routes/dashboard.hr-admin.tsx` — add new "Employee Loans" tab (existing HR Admin route already exists in the file list). Tab content = `EmployeeLoansPanel` component.
- `src/routes/sign.employee-loan.$token.tsx` — public route (NOT under `_authenticated`), full-screen signing page. Renders agreement snapshot verbatim, ESIGN consent checkbox ("I agree to sign electronically…"), signature pad (`react-signature-canvas`) with typed-name fallback, submit button. On success shows a confirmation with option to download PDF of signed agreement.

### Components (`src/components/employee-loans/`)

- `EmployeeLoansPanel.tsx` — mirrors the Client Loan Ledger screen you shared: staff picker + "New loan" button, "Agreements on file" table (staff, borrower name, date, status, signature status, updated). No feature-toggle banner (per your answer).
- `EmployeeLoanEditor.tsx` — same fields as `LoanEditor` for clients, borrower defaults to the selected staff member's full name and email.
- `SendForSignatureDialog.tsx` — confirm signer email (pre-fills staff email), preview of email body, "Send" action. Shows pending token status + "Resend" / "Void link" once sent.
- `SignedRecordCard.tsx` — displays signature image, method, IP, timestamp, downloads a locked PDF (rendered client-side with existing PDF utilities).
- `sign-employee-loan-page.tsx` — used by the public signing route.

### Email

Uses the existing `supabase/functions/send-email` Resend rail via a new helper in `src/lib/email.functions.ts` (`sendEmployeeLoanSignatureEmail`). Subject: "Loan agreement ready for your signature — {org name}". Body: plain HTML with agreement summary, "Review and sign" button, expiration note, and a plain-English ESIGN disclosure.

### Legal / audit posture

- ESIGN Act elements captured on every signature: intent (explicit consent checkbox), association (token → agreement snapshot), attribution (name + email + IP + UA), integrity (immutable snapshot + sha256 of rendered agreement stored alongside).
- Signed agreements are immutable — editor becomes read-only once `status='signed'` or `'active'`; changes require voiding and creating a new agreement.
- Admin audit log entry on every send/sign/void via existing audit patterns.

### Out of scope (call out to user before build)

- DocuSign integration — skipped since you chose built-in e-sign. Can be added later as an alternative sender.
- Payroll deduction automation — the ledger records repayments manually; wiring into payroll is a separate feature.
- Staff-facing "my loans" view — admins-only for now; add later if you want staff to see their signed copies in-app.
