
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meal_actuals_assignee uuid REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Org members insert meal actuals" ON public.client_meal_actuals;
DROP POLICY IF EXISTS "Org members update meal actuals" ON public.client_meal_actuals;

CREATE POLICY "Eligible staff insert meal actuals"
ON public.client_meal_actuals
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.client_meal_plans p
    JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND (
        public.is_org_admin_or_manager(p.organization_id, auth.uid())
        OR c.meal_actuals_assignee = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.scheduled_shifts s
          WHERE s.client_id = c.id
            AND s.staff_id = auth.uid()
            AND (s.starts_at AT TIME ZONE 'UTC')::date <= client_meal_actuals.actual_date
            AND (s.ends_at   AT TIME ZONE 'UTC')::date >= client_meal_actuals.actual_date
        )
        OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = c.team_id
            AND t.manager_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.respite_stays r
          JOIN public.hhp_cue_cards h ON h.id = r.host_home_id
          WHERE r.respite_client_id = c.id
            AND h.linked_staff_user_id = auth.uid()
            AND client_meal_actuals.actual_date >= r.start_date
            AND client_meal_actuals.actual_date <= COALESCE(r.end_date, client_meal_actuals.actual_date)
        )
      )
  )
);

CREATE POLICY "Eligible staff update meal actuals"
ON public.client_meal_actuals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_meal_plans p
    JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND (
        public.is_org_admin_or_manager(p.organization_id, auth.uid())
        OR c.meal_actuals_assignee = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.scheduled_shifts s
          WHERE s.client_id = c.id
            AND s.staff_id = auth.uid()
            AND (s.starts_at AT TIME ZONE 'UTC')::date <= client_meal_actuals.actual_date
            AND (s.ends_at   AT TIME ZONE 'UTC')::date >= client_meal_actuals.actual_date
        )
        OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = c.team_id
            AND t.manager_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.respite_stays r
          JOIN public.hhp_cue_cards h ON h.id = r.host_home_id
          WHERE r.respite_client_id = c.id
            AND h.linked_staff_user_id = auth.uid()
            AND client_meal_actuals.actual_date >= r.start_date
            AND client_meal_actuals.actual_date <= COALESCE(r.end_date, client_meal_actuals.actual_date)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.client_meal_plans p
    JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND (
        public.is_org_admin_or_manager(p.organization_id, auth.uid())
        OR c.meal_actuals_assignee = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.scheduled_shifts s
          WHERE s.client_id = c.id
            AND s.staff_id = auth.uid()
            AND (s.starts_at AT TIME ZONE 'UTC')::date <= client_meal_actuals.actual_date
            AND (s.ends_at   AT TIME ZONE 'UTC')::date >= client_meal_actuals.actual_date
        )
        OR EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = c.team_id
            AND t.manager_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.respite_stays r
          JOIN public.hhp_cue_cards h ON h.id = r.host_home_id
          WHERE r.respite_client_id = c.id
            AND h.linked_staff_user_id = auth.uid()
            AND client_meal_actuals.actual_date >= r.start_date
            AND client_meal_actuals.actual_date <= COALESCE(r.end_date, client_meal_actuals.actual_date)
        )
      )
  )
);
