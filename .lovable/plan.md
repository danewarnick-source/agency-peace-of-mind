## Add ability to delete Smart Imports and archived Clients

Two related destructive actions, both admin-only, both behind explicit confirm dialogs.

### 1. Delete a Smart Import mid-flow

**Where the button lives**
- On the Pending Clients list (`dashboard.clients.pending.tsx`) — a trash icon on each pending row.
- On the Smart Import review page (`dashboard.smart-import.$jobId.review.tsx`) — a "Discard import" button in the header, available at any wizard step before finalization.

**Confirm dialog copy**
> "Discard this smart import? This permanently removes the uploaded PCSP, all extracted fields, the draft profile, and any staff assignment mapping. This does NOT affect any finalized clients. This cannot be undone."

**What actually gets deleted (new server fn `discardImportJob`)**
Scoped to the caller's org, only if the job is not yet committed:
- `import_subjects` (+ cascade: `extracted_fields`, `import_field_provenance`, `import_merge_flags`, `import_nectar_questions`)
- `assignment_map` rows for the job
- `import_documents` + `import_cert_documents` + storage objects
- `import_audit` entry recording the discard (who, when, reason=user_discarded)
- `import_jobs` row last

Refuses (returns typed error) if the job is already `status = 'committed'` — at that point the client exists and must be deleted through the client-delete flow instead.

### 2. Delete an archived Client

**Where the button lives**
- Roster "Archived" tab only (never Active). Row-level "Delete permanently" action + confirm dialog.
- Also surfaced on the client profile when the client is archived.

**Confirm dialog — two-step**
Step 1 shows a full plain-English list of what gets erased, sourced from the actual row counts for that client (goals, medications, MAR logs, daily logs, incident reports, shifts, documents, PCSP file, emergency contacts, billing codes, staff assignments, progress summaries, client-specific trainings + completions, etc.).

> "Deleting **{client name}** permanently erases every record tied to this person's supports across your organization. This includes their PCSP, goals, medications and MAR history, daily logs, incidents, shifts, billing authorizations, staff assignments, trainings, and uploaded documents. Audit-trail entries and completed training certificates already earned by staff are retained (compliance requirement) but will show the client as 'deleted'. This cannot be undone."

Step 2: user types the client's full name to enable the red "Delete permanently" button.

**What actually gets deleted (new server fn `deleteClientPermanently`)**
- Requires: caller is org admin AND `clients.archived_at IS NOT NULL` for that client in the caller's org.
- Deletes from ~30 client-scoped tables in FK-safe order (client_medications, emar_logs, client_progress_summaries, client_billing_codes, client_billing_code_rate_history, client_emergency_contacts, client_documents + storage, client_specific_trainings, client_intake_completion, client_approved_locations, client_ratios, client_weekly_targets, client_belongings, client_loans + entries, client_spending_log, client_discharges, client_external_services, daily_logs, incident_reports, scheduled_shifts, evv_timesheets, shift_mar_entries, shift_completeness_flags, staff_assignments for this client, assignment_map rows, referrals, etc.).
- Retains for audit/compliance (nulls `client_id` or keeps client name as a text snapshot):
  - `training_completions` (staff kept their certs; already has `content_snapshot` with client name)
  - `billing_submissions` history
  - `import_audit`
- Writes an `import_audit`-style deletion record: who deleted, when, client name/DOB snapshot, table row counts erased.
- Deletes the `clients` row last.

### Technical notes

- New file: `src/lib/client-lifecycle.functions.ts` — `discardImportJob`, `deleteClientPermanently`, `getClientDeletionImpact` (row counts for the confirm dialog).
- All three use `requireSupabaseAuth` + `has_role('admin')` check. No service-role client needed — RLS + org-scoped queries.
- UI additions:
  - `DiscardImportDialog` in `src/components/smart-import/`
  - `DeleteClientDialog` in `src/components/clients/`
- No schema migration required; all deletes go through existing RLS.
- Toasts on success; navigate back to the respective list on success.

### Out of scope
- Bulk delete.
- Undo / soft-delete recovery window (explicit "cannot be undone" per your ask).
- Deleting Active (non-archived) clients — still requires archive first.
