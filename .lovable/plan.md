# Root cause — client creation

It is **not** RLS, not membership, not org_id, and not a swallowed error. The insert is being rejected by a `BEFORE INSERT` trigger on `public.clients`.

Evidence I pulled from the live DB:

- RLS on `clients`:
  - `WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))` — passes for the signed-in admin.
- GRANTs on `clients`: `authenticated` has full `arwdDxtm` — fine.
- Trigger on `clients`:
  ```
  clients_validate_guardian BEFORE INSERT OR UPDATE OF is_own_guardian, guardian_name, ...
  EXECUTE FUNCTION validate_client_guardian()
  ```
  which raises:
  ```
  IF NEW.is_own_guardian THEN ... ELSE
    IF guardian_name IS NULL OR '' THEN RAISE 'Guardian name is required ...';
    IF guardian_phone IS NULL OR '' THEN RAISE 'Guardian phone is required ...';
  ```
- Column defaults: `is_own_guardian NOT NULL DEFAULT false`; `guardian_name`/`guardian_phone` nullable, no default.
- `AddClientDialog` insert payload in `src/routes/dashboard.clients.tsx` (lines 272–290) **does not send** `is_own_guardian`, `guardian_name`, or `guardian_phone`.
- Last successful row in `clients` is dated 2026-06-14 — matches when this regression became visible.

So every Add-Client call lands with `is_own_guardian=false` + null guardian fields → trigger raises `Guardian name is required when the client is not their own guardian.` → PostgREST returns 400. The mutation throws, `onError` fires `toast.error(...)`. The "HTTP 200, no row" reading is a misread — the toast is brief and the dialog closes via separate state; nothing is silently swallowed by RLS.

The `EditClient` form already handles this correctly (lines 331–336), which is why edits to existing clients work and only **new** creates fail.

# Fix

Update **`src/routes/dashboard.clients.tsx`** only — no migration, no RLS change.

1. `AddClientDialog` (the component used at line 407): add a small Guardianship block matching the EditClient UX:
   - Checkbox **"Client is their own guardian"** (default checked).
   - When unchecked: required inputs for **Guardian name** and **Guardian phone**, plus optional relationship / email.
   - Block the Submit button when not own-guardian and either required field is empty (mirror `guardianInvalid` from EditClient at line 1704).
2. Extend `ClientFormValues` usage in the add form to include `is_own_guardian`, `guardian_name`, `guardian_phone`, `guardian_relationship`, `guardian_email` (the type already declares them optional, lines 112–116).
3. In `addMutation.mutationFn` (lines 270–293), add to the insert payload:
   ```ts
   is_own_guardian: input.is_own_guardian ?? true,
   guardian_name: input.is_own_guardian === false ? (input.guardian_name?.trim() || null) : null,
   guardian_phone: input.is_own_guardian === false ? (input.guardian_phone?.trim() || null) : null,
   guardian_relationship: input.is_own_guardian === false ? (input.guardian_relationship?.trim() || null) : null,
   guardian_email: input.is_own_guardian === false ? (input.guardian_email?.trim() || null) : null,
   ```
   Defaulting to `is_own_guardian: true` keeps the trigger happy when a creator skips the guardianship section, and makes the field explicit instead of relying on a column default that conflicts with the trigger.

# Staff edits (separate look)

You also said staff edits don't persist. I want to confirm that's a real second bug before changing anything there. From the schema:

- `profiles` UPDATE policies are USING-only (no WITH CHECK), which is fine for an admin updating another staff member.
- Trigger `profiles_block_owner_admin_field_writes` only raises when `auth.uid() = OLD.id` (i.e., a user editing **their own** rate / SSN / hire_date / etc.). For an admin editing another staffer it is a no-op.

So either (a) the symptom is actually an admin editing **their own** profile and the trigger is correctly blocking restricted fields, or (b) it's a different mutation than I'd guess. After approval, I'll:

- Open `src/routes/dashboard.employees.$staffId.tsx`, find the update mutation, and confirm the payload + target row.
- If it's the self-edit case, surface the trigger's reason in the toast (today it's just `Forbidden: hourly_rate is admin-controlled`, which reads as a silent failure) and gate the restricted inputs in the UI for non-admins.
- If it's a different write path (e.g. `organization_members`, `staff_assignments`), trace and fix that specifically.

No changes to that area in this plan until the Add-Client fix is in and you tell me which exact staff edit is failing (which field, on whose profile).

# Files touched

- `src/routes/dashboard.clients.tsx` — AddClientDialog UI + `addMutation` payload.

No SQL handoff needed.
