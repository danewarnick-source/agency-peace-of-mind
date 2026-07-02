## Root cause

The RLS policies on `public.hhp_cue_cards` call `is_org_member(auth.uid(), organization_id)`, but the function signature is `is_org_member(_org uuid, _user uuid)` — the arguments are **swapped**. Every membership check evaluates as "is this user_id an organization, and is this organization_id a user?" — always false.

Result:
- INSERT → `new row violates row-level security policy for table "hhp_cue_cards"` (the exact error in your screenshot).
- SELECT → silently returns zero rows (which is why every status column shows 0 hosts).

## Fix

Single migration that drops and recreates both policies with the correct argument order.

```sql
DROP POLICY IF EXISTS hhp_read  ON public.hhp_cue_cards;
DROP POLICY IF EXISTS hhp_write ON public.hhp_cue_cards;

CREATE POLICY hhp_read ON public.hhp_cue_cards
FOR SELECT TO authenticated
USING (
  public.is_org_member(organization_id, auth.uid())
  AND (
    public.has_permission(auth.uid(), organization_id, 'view_referrals')
    OR public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    OR public.has_permission(auth.uid(), organization_id, 'manage_users')
  )
);

CREATE POLICY hhp_write ON public.hhp_cue_cards
FOR ALL TO authenticated
USING (
  public.is_org_member(organization_id, auth.uid())
  AND (
    public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    OR public.has_permission(auth.uid(), organization_id, 'manage_users')
  )
)
WITH CHECK (
  public.is_org_member(organization_id, auth.uid())
  AND (
    public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    OR public.has_permission(auth.uid(), organization_id, 'manage_users')
  )
);
```

## Verification

After the migration runs:
1. Reload the Hosts tab — any existing hosts in your org (previously hidden by the broken read policy) should now appear.
2. Click **New host** → fill in required fields → **Create host**. The RLS error should be gone and the host appears in the "Onboarding" column.

No code changes required — this is a database-only fix.
