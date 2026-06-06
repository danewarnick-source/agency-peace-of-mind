
DO $$ BEGIN
  CREATE TYPE public.other_assignment_type AS ENUM ('training','task','requirement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.other_assignment_status AS ENUM ('not_started','in_progress','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.other_assignment_proposer AS ENUM ('admin','manager','nectar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.staff_other_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  assignment_type public.other_assignment_type NOT NULL DEFAULT 'training',
  title text NOT NULL,
  description text,
  due_date date,
  is_safety_critical boolean NOT NULL DEFAULT false,
  status public.other_assignment_status NOT NULL DEFAULT 'not_started',
  completed_at timestamptz,
  completion_source text,
  completion_provenance jsonb,
  requires_admin_confirmation boolean NOT NULL DEFAULT false,
  proposed_by public.other_assignment_proposer NOT NULL DEFAULT 'admin',
  proposed_by_user uuid,
  proposal_rationale text,
  confirmed boolean NOT NULL DEFAULT true,
  confirmed_at timestamptz,
  confirmed_by uuid,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_soa_org_staff ON public.staff_other_assignments(organization_id, staff_id);
CREATE INDEX idx_soa_open ON public.staff_other_assignments(organization_id, status) WHERE status <> 'completed';
CREATE INDEX idx_soa_pending_confirm ON public.staff_other_assignments(organization_id) WHERE confirmed = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_other_assignments TO authenticated;
GRANT ALL ON public.staff_other_assignments TO service_role;

ALTER TABLE public.staff_other_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers manage org assignments"
  ON public.staff_other_assignments FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND auth.uid() <> staff_id
  );

CREATE POLICY "Staff view their own confirmed assignments"
  ON public.staff_other_assignments FOR SELECT TO authenticated
  USING (auth.uid() = staff_id AND confirmed = true);

CREATE POLICY "Staff update their own assignment status"
  ON public.staff_other_assignments FOR UPDATE TO authenticated
  USING (auth.uid() = staff_id AND confirmed = true AND requires_admin_confirmation = false)
  WITH CHECK (auth.uid() = staff_id AND confirmed = true);

CREATE TRIGGER trg_soa_updated_at
  BEFORE UPDATE ON public.staff_other_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
