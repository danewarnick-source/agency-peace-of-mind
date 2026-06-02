## Three-party approval chain: NECTAR → HIVE Exec → Provider

Defaults chosen (you skipped the questions): in-app notifications only; "assisted setup" is a flag on the existing source upload — provider toggles "Request HIVE-assisted setup" when uploading. Self-serve flow stays exactly as-is.

If login is still broken after this ships, tell me what you see (the recent auth logs show your sign-ins all returned 200) and I'll dig in next turn.

### What gets built

**1. Schema** (one migration)
- Add `approval_chain` column to the existing requirements table (or new `nectar_requirement_approvals` table if requirements live across multiple tables — I'll confirm during build by reading the schema).
- New enum `requirement_approval_state`: `nectar_drafted | hive_exec_approved | hive_exec_rejected | provider_confirmed | provider_rejected`.
- New table `requirement_approval_events` (append-only): `requirement_id, stage, actor_user_id, action (approved|rejected), reason, created_at`. Grants + RLS.
- Add `assisted_setup_requested boolean default false` to authoritative sources table — drives whether new extractions enter the chain (default) or the existing self-serve confirm flow.

**2. Server functions** (`src/lib/nectar-approvals.functions.ts`)
- `listPendingHiveExecApprovals({ org_id? })` — HIVE Exec queue, grouped by company + source.
- `hiveExecApproveRequirement({ requirement_id, note? })` / `hiveExecRejectRequirement({ requirement_id, reason })` — guarded by `is_hive_executive`; transitions state, writes event, notifies provider admins of the org.
- `providerConfirmRequirement` / `providerRejectRequirement` — guarded by `is_org_admin_or_manager` for that org; only allowed when state = `hive_exec_approved`. Confirm activates the requirement in the engine.
- `listProviderPendingConfirmations({ org_id })` — for the provider's Requirements tab badge/section.
- `getApprovalHistory({ requirement_id })` — full chain for the detail modal + attestation log.

**3. NECTAR draft hookup**
- Where NECTAR currently emits extracted requirements: if the source has `assisted_setup_requested = true`, set initial state to `nectar_drafted` instead of going straight to "needs review / confirm". Write a `nectar_drafted` event row.

**4. UI — HIVE Exec portal** (`src/routes/dashboard.hive-exec.nectar.tsx` extension or a new sub-route)
- "Pending HIVE Exec approval" queue: rows grouped by company → source, showing the drafted requirement text + source citation + raw excerpt. Approve / Send back (with reason) buttons. Empty state when clean.
- Liability banner at the top: "You're confirming NECTAR extracted this requirement accurately from the source. You are not confirming whether the provider must follow it — that's the provider's call."

**5. UI — Provider Authoritative Sources → Requirements tab**
- New "Awaiting your final confirmation" section above existing confirmed requirements, only showing items in `hive_exec_approved` state. Confirm / Reject (with reason) actions. Standard "confirmed" section stays as today.
- Per-row status chip + small "approval history" popover (NECTAR drafted → HIVE Exec approved by X on Y → awaiting you).

**6. Upload flow**
- Add a "Request HIVE-assisted setup" checkbox on the authoritative source upload dialog. Off by default. When on, sets `assisted_setup_requested = true` on the source row.

**7. Notifications**
- In-app only via existing `notifications` table:
  - HIVE Exec approves → notify org admins (recipient_role: `admin`) of that company: "Requirements ready for your final confirmation".
  - Provider rejects → notify HIVE Execs.
  - HIVE Exec sends back → no notify (NECTAR loop only).
- NotificationBell already handles rendering.

**8. Audit trail**
- Each event row from `requirement_approval_events` is rendered in the existing Attestation log component, alongside existing attestations. Reuse the current log feed.

### Technical notes

- All state transitions live in server functions with explicit role guards (`is_hive_executive`, `is_org_admin_or_manager`). RLS on `requirement_approval_events`: select by org members + HIVE Execs; insert only via server functions (service role).
- The existing self-serve confirm flow is untouched — it's gated by `assisted_setup_requested = false`.
- Reversibility preserved: a `provider_confirmed` requirement can be re-opened by the provider the same way confirm/remove works today; doing so writes a new event.
- Liability copy is locked in two places: the HIVE Exec queue header and the provider's "awaiting confirmation" section header.

### Out of scope (call out if you want them later)

- Email notifications (in-app only for now).
- Bulk approve/reject in the HIVE Exec queue (single-item only this pass).
- Versioning when a source is re-uploaded and produces drift against an already-confirmed requirement.

Approve and I'll start with the migration.