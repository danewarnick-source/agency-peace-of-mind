
CREATE TABLE public.chore_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  space_type text NOT NULL DEFAULT 'rhs' CHECK (space_type IN ('rhs','hhs','slh','sln','family','other')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_spaces TO authenticated;
GRANT ALL ON public.chore_spaces TO service_role;
ALTER TABLE public.chore_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_spaces_read" ON public.chore_spaces FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "chore_spaces_write" ON public.chore_spaces FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.chore_space_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_space_clients TO authenticated;
GRANT ALL ON public.chore_space_clients TO service_role;
ALTER TABLE public.chore_space_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_space_clients_read" ON public.chore_space_clients FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_space_clients_write" ON public.chore_space_clients FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())));

CREATE TABLE public.chore_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  space_id uuid REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  chore_name text NOT NULL,
  task_list text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_definitions TO authenticated;
GRANT ALL ON public.chore_definitions TO service_role;
ALTER TABLE public.chore_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_definitions_read" ON public.chore_definitions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "chore_definitions_write" ON public.chore_definitions FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.chore_client_rotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  definition_id uuid REFERENCES public.chore_definitions(id) ON DELETE SET NULL,
  is_free_day boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, client_id, day_of_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_client_rotation TO authenticated;
GRANT ALL ON public.chore_client_rotation TO service_role;
ALTER TABLE public.chore_client_rotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_client_rotation_read" ON public.chore_client_rotation FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_client_rotation_write" ON public.chore_client_rotation FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())));

CREATE TABLE public.chore_shift_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_time time,
  end_time time,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_shift_rows TO authenticated;
GRANT ALL ON public.chore_shift_rows TO service_role;
ALTER TABLE public.chore_shift_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_shift_rows_read" ON public.chore_shift_rows FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_shift_rows_write" ON public.chore_shift_rows FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())));

CREATE TABLE public.chore_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  shift_row_id uuid NOT NULL REFERENCES public.chore_shift_rows(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  task_text text NOT NULL DEFAULT '',
  helps_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  definition_id uuid REFERENCES public.chore_definitions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(space_id, shift_row_id, day_of_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_shift_assignments TO authenticated;
GRANT ALL ON public.chore_shift_assignments TO service_role;
ALTER TABLE public.chore_shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_shift_assignments_read" ON public.chore_shift_assignments FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_shift_assignments_write" ON public.chore_shift_assignments FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())));

CREATE TABLE public.chore_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('rotation','shift')),
  source_id uuid NOT NULL,
  completion_date date NOT NULL,
  completed_by uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE(space_id, source, source_id, completion_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_completions TO authenticated;
GRANT ALL ON public.chore_completions TO service_role;
ALTER TABLE public.chore_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chore_completions_read" ON public.chore_completions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_completions_insert" ON public.chore_completions FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_completions_delete" ON public.chore_completions FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_completions_update" ON public.chore_completions FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));

CREATE TRIGGER trg_chore_spaces_updated BEFORE UPDATE ON public.chore_spaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_chore_definitions_updated BEFORE UPDATE ON public.chore_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_chore_client_rotation_updated BEFORE UPDATE ON public.chore_client_rotation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_chore_shift_rows_updated BEFORE UPDATE ON public.chore_shift_rows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_chore_shift_assignments_updated BEFORE UPDATE ON public.chore_shift_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_chore_spaces_org ON public.chore_spaces(organization_id);
CREATE INDEX idx_chore_definitions_space ON public.chore_definitions(space_id);
CREATE INDEX idx_chore_client_rotation_space ON public.chore_client_rotation(space_id);
CREATE INDEX idx_chore_shift_assignments_space ON public.chore_shift_assignments(space_id);
CREATE INDEX idx_chore_completions_lookup ON public.chore_completions(space_id, completion_date);
