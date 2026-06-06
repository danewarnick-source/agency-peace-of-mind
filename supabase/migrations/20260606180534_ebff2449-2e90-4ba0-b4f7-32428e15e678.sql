
CREATE TABLE public.hrc_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_date DATE,
  attendees TEXT,
  minutes TEXT,
  decisions TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrc_meetings TO authenticated;
GRANT ALL ON public.hrc_meetings TO service_role;
ALTER TABLE public.hrc_meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hrc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  restriction_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','needs_update')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrc_reviews TO authenticated;
GRANT ALL ON public.hrc_reviews TO service_role;
ALTER TABLE public.hrc_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hrc_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrc_committee_members TO authenticated;
GRANT ALL ON public.hrc_committee_members TO service_role;
ALTER TABLE public.hrc_committee_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_hrc_committee_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hrc_committee_members
    WHERE organization_id = _org AND user_id = _user AND active
  )
  OR EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND active
      AND role = 'committee_member'
  );
$$;

CREATE POLICY "HRC meetings: admin/manager manage"
ON public.hrc_meetings FOR ALL TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "HRC meetings: committee read"
ON public.hrc_meetings FOR SELECT TO authenticated
USING (public.is_hrc_committee_member(organization_id, auth.uid()));

CREATE POLICY "HRC reviews: admin/manager manage"
ON public.hrc_reviews FOR ALL TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "HRC reviews: committee read"
ON public.hrc_reviews FOR SELECT TO authenticated
USING (public.is_hrc_committee_member(organization_id, auth.uid()));

CREATE POLICY "HRC roster: admin/manager manage"
ON public.hrc_committee_members FOR ALL TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "HRC roster: committee read self org"
ON public.hrc_committee_members FOR SELECT TO authenticated
USING (public.is_hrc_committee_member(organization_id, auth.uid()));

CREATE TRIGGER trg_hrc_meetings_updated_at
  BEFORE UPDATE ON public.hrc_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_hrc_reviews_updated_at
  BEFORE UPDATE ON public.hrc_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_hrc_committee_members_updated_at
  BEFORE UPDATE ON public.hrc_committee_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_hrc_meetings_org ON public.hrc_meetings(organization_id);
CREATE INDEX idx_hrc_reviews_org ON public.hrc_reviews(organization_id);
CREATE INDEX idx_hrc_reviews_client ON public.hrc_reviews(client_id);
CREATE INDEX idx_hrc_committee_members_org ON public.hrc_committee_members(organization_id);
