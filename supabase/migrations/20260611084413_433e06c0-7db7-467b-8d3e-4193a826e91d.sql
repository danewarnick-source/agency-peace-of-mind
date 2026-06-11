CREATE TABLE public.recurring_shift_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid,
  service_code_id uuid,
  location_id uuid,
  staff_id uuid,
  rotation_group_id uuid,
  weekday_mask smallint NOT NULL DEFAULT 0,
  start_time_local time NOT NULL,
  end_time_local time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  name text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_shift_patterns TO authenticated;
GRANT ALL ON public.recurring_shift_patterns TO service_role;
ALTER TABLE public.recurring_shift_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view recurring patterns"
ON public.recurring_shift_patterns FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = recurring_shift_patterns.organization_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins manage recurring patterns"
ON public.recurring_shift_patterns FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = recurring_shift_patterns.organization_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = recurring_shift_patterns.organization_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')));

CREATE INDEX idx_rsp_org_active ON public.recurring_shift_patterns(organization_id, active);
CREATE INDEX idx_rsp_client ON public.recurring_shift_patterns(client_id);

CREATE TABLE public.staff_rotation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  last_assigned_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_rotation_groups TO authenticated;
GRANT ALL ON public.staff_rotation_groups TO service_role;
ALTER TABLE public.staff_rotation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view rotation groups"
ON public.staff_rotation_groups FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = staff_rotation_groups.organization_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins manage rotation groups"
ON public.staff_rotation_groups FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = staff_rotation_groups.organization_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om
  WHERE om.organization_id = staff_rotation_groups.organization_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')));

CREATE TABLE public.staff_rotation_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.staff_rotation_groups(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, staff_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_rotation_group_members TO authenticated;
GRANT ALL ON public.staff_rotation_group_members TO service_role;
ALTER TABLE public.staff_rotation_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view rotation members"
ON public.staff_rotation_group_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff_rotation_groups g
  JOIN public.organization_members om ON om.organization_id = g.organization_id
  WHERE g.id = staff_rotation_group_members.group_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins manage rotation members"
ON public.staff_rotation_group_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff_rotation_groups g
  JOIN public.organization_members om ON om.organization_id = g.organization_id
  WHERE g.id = staff_rotation_group_members.group_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff_rotation_groups g
  JOIN public.organization_members om ON om.organization_id = g.organization_id
  WHERE g.id = staff_rotation_group_members.group_id
    AND om.user_id = auth.uid() AND om.role IN ('admin','manager','super_admin')));

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER set_updated_at_rsp BEFORE UPDATE ON public.recurring_shift_patterns
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER set_updated_at_srg BEFORE UPDATE ON public.staff_rotation_groups
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();