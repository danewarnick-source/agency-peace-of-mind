
-- Compliance rules: NECTAR proposes, provider confirms
CREATE TABLE public.nectar_compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('billing_conflict','staff_prerequisite','deadline','activity')),
  rule_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','dismissed')),
  proposed_by TEXT NOT NULL DEFAULT 'nectar',
  proposed_rationale TEXT,
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ncr_org_status ON public.nectar_compliance_rules(organization_id, status);
CREATE INDEX idx_ncr_req ON public.nectar_compliance_rules(requirement_id);
CREATE INDEX idx_ncr_type ON public.nectar_compliance_rules(organization_id, rule_type, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_compliance_rules TO authenticated;
GRANT ALL ON public.nectar_compliance_rules TO service_role;
ALTER TABLE public.nectar_compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read compliance rules" ON public.nectar_compliance_rules
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "org admins insert compliance rules" ON public.nectar_compliance_rules
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "org admins update compliance rules" ON public.nectar_compliance_rules
  FOR UPDATE TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "org admins delete compliance rules" ON public.nectar_compliance_rules
  FOR DELETE TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_ncr_updated
  BEFORE UPDATE ON public.nectar_compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Append-only history for rule lifecycle
CREATE TABLE public.nectar_compliance_rule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.nectar_compliance_rules(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('proposed','edited','confirmed','dismissed','reopened')),
  actor_id UUID REFERENCES auth.users(id),
  actor_label TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ncrh_rule ON public.nectar_compliance_rule_history(rule_id, created_at DESC);
GRANT SELECT, INSERT ON public.nectar_compliance_rule_history TO authenticated;
GRANT ALL ON public.nectar_compliance_rule_history TO service_role;
ALTER TABLE public.nectar_compliance_rule_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read rule history" ON public.nectar_compliance_rule_history
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members insert rule history" ON public.nectar_compliance_rule_history
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id, auth.uid()));

-- Flags: framework table used by all detection types
CREATE TABLE public.nectar_compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.nectar_compliance_rules(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  detection_type TEXT NOT NULL CHECK (detection_type IN ('billing_conflict','staff_prerequisite','deadline','activity')),
  subject_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, -- verbatim requirement text + citation at time of flag
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raised_to UUID REFERENCES auth.users(id),
  resolution TEXT CHECK (resolution IN ('acknowledged_continued','stopped')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);
CREATE INDEX idx_ncf_org_open ON public.nectar_compliance_flags(organization_id, resolution) WHERE resolution IS NULL;
CREATE INDEX idx_ncf_rule ON public.nectar_compliance_flags(rule_id);
CREATE INDEX idx_ncf_req ON public.nectar_compliance_flags(requirement_id);

GRANT SELECT, INSERT, UPDATE ON public.nectar_compliance_flags TO authenticated;
GRANT ALL ON public.nectar_compliance_flags TO service_role;
ALTER TABLE public.nectar_compliance_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read flags" ON public.nectar_compliance_flags
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members raise flags" ON public.nectar_compliance_flags
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members resolve flags" ON public.nectar_compliance_flags
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id, auth.uid()));

-- Prevent editing an already-resolved flag's resolution fields (append-only decision)
CREATE OR REPLACE FUNCTION public.nectar_flags_freeze_resolution()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.resolution IS NOT NULL THEN
    IF NEW.resolution IS DISTINCT FROM OLD.resolution
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.resolution_note IS DISTINCT FROM OLD.resolution_note
       OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
       OR NEW.subject_context IS DISTINCT FROM OLD.subject_context
       OR NEW.raised_at IS DISTINCT FROM OLD.raised_at THEN
      RAISE EXCEPTION 'Compliance flag % is already resolved and immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ncf_freeze
  BEFORE UPDATE ON public.nectar_compliance_flags
  FOR EACH ROW EXECUTE FUNCTION public.nectar_flags_freeze_resolution();
