
CREATE POLICY "bc_flags_behaviorist_write" ON public.bc_flags
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.behavior_support_clients bsc
  WHERE bsc.client_id = bc_flags.client_id AND bsc.assigned_behaviorist_user_id = auth.uid()
));

CREATE POLICY "bc_flags_behaviorist_update" ON public.bc_flags
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.behavior_support_clients bsc
  WHERE bsc.client_id = bc_flags.client_id AND bsc.assigned_behaviorist_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.behavior_support_clients bsc
  WHERE bsc.client_id = bc_flags.client_id AND bsc.assigned_behaviorist_user_id = auth.uid()
));
