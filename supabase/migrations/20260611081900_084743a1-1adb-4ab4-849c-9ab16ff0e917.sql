-- Allow unassigned (open) shifts. staff_id becomes nullable so an org can post
-- a shift without an assignee; staff can later claim it.
ALTER TABLE public.scheduled_shifts ALTER COLUMN staff_id DROP NOT NULL;

-- Track who proposed to claim an open shift while admin approval is pending.
ALTER TABLE public.scheduled_shifts ADD COLUMN IF NOT EXISTS claim_requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_claim_requested ON public.scheduled_shifts(claim_requested_by) WHERE claim_requested_by IS NOT NULL;

-- Week template store for Batch D (whole-week snapshots).
CREATE TABLE IF NOT EXISTS public.week_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_templates TO authenticated;
GRANT ALL ON public.week_templates TO service_role;

ALTER TABLE public.week_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read week_templates"
ON public.week_templates FOR SELECT TO authenticated
USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins write week_templates"
ON public.week_templates FOR ALL TO authenticated
USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_week_templates_org ON public.week_templates(organization_id, created_at DESC);

CREATE TRIGGER update_week_templates_updated_at
BEFORE UPDATE ON public.week_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();