DROP POLICY IF EXISTS hhp_write ON public.hhp_cue_cards;
CREATE POLICY hhp_write ON public.hhp_cue_cards
  FOR ALL
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (
      has_permission(auth.uid(), organization_id, 'manage_referrals')
      OR has_permission(auth.uid(), organization_id, 'manage_users')
    )
  )
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    AND (
      has_permission(auth.uid(), organization_id, 'manage_referrals')
      OR has_permission(auth.uid(), organization_id, 'manage_users')
    )
  );

DROP POLICY IF EXISTS hhp_read ON public.hhp_cue_cards;
CREATE POLICY hhp_read ON public.hhp_cue_cards
  FOR SELECT
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (
      has_permission(auth.uid(), organization_id, 'view_referrals')
      OR has_permission(auth.uid(), organization_id, 'manage_referrals')
      OR has_permission(auth.uid(), organization_id, 'manage_users')
    )
  );