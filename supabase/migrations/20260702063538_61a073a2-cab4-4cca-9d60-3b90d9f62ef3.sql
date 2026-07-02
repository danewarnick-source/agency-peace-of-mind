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