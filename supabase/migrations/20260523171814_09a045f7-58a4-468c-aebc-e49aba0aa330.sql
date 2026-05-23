
-- Allow org admins/managers to assign training (insert/update user_training_progress) for users in their organization
CREATE POLICY "managers assign training progress"
ON public.user_training_progress
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = user_training_progress.user_id
      AND is_org_admin_or_manager(m.organization_id, auth.uid())
  )
);

CREATE POLICY "managers update training progress"
ON public.user_training_progress
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = user_training_progress.user_id
      AND is_org_admin_or_manager(m.organization_id, auth.uid())
  )
);

CREATE POLICY "managers read training progress"
ON public.user_training_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = user_training_progress.user_id
      AND is_org_admin_or_manager(m.organization_id, auth.uid())
  )
);
