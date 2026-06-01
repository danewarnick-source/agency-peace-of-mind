
-- ========================================================================
-- Block 1: HIVE Executive (platform-owner) oversight
-- Block 2: NECTAR escalation tickets + saved/scheduled reports
-- ========================================================================

-- ── Enums ───────────────────────────────────────────────────────────────
CREATE TYPE public.sub_plan AS ENUM ('starter','pro','enterprise','custom');
CREATE TYPE public.sub_status AS ENUM ('trial','active','past_due','canceled','paused');
CREATE TYPE public.ticket_status AS ENUM ('submitted','in_progress','waiting_customer','resolved','closed');
CREATE TYPE public.ticket_severity AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.report_cadence AS ENUM ('weekly','monthly');

-- ── HIVE Executives table (whitelist) ───────────────────────────────────
CREATE TABLE public.hive_executives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_executives TO authenticated;
GRANT ALL ON public.hive_executives TO service_role;
ALTER TABLE public.hive_executives ENABLE ROW LEVEL SECURITY;

-- Security definer helper: is the user an active HIVE executive?
CREATE OR REPLACE FUNCTION public.is_hive_executive(_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hive_executives
    WHERE user_id = _user AND active = true
  )
$$;

CREATE POLICY "executives view themselves and peers"
  ON public.hive_executives FOR SELECT TO authenticated
  USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "super admin manages executives"
  ON public.hive_executives FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ── Audit log (HIVE exec access trail) ──────────────────────────────────
CREATE TABLE public.hive_executive_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_org_id UUID,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hive_exec_audit_created ON public.hive_executive_audit_log(created_at DESC);
CREATE INDEX idx_hive_exec_audit_actor ON public.hive_executive_audit_log(actor_user_id);
GRANT SELECT, INSERT ON public.hive_executive_audit_log TO authenticated;
GRANT ALL ON public.hive_executive_audit_log TO service_role;
ALTER TABLE public.hive_executive_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "executives read audit"
  ON public.hive_executive_audit_log FOR SELECT TO authenticated
  USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "executives write audit"
  ON public.hive_executive_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_hive_executive(auth.uid()) AND actor_user_id = auth.uid());

-- ── Org subscriptions (HIVE's billing of customer companies) ────────────
CREATE TABLE public.org_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan public.sub_plan NOT NULL DEFAULT 'starter',
  status public.sub_status NOT NULL DEFAULT 'trial',
  mrr_cents INTEGER NOT NULL DEFAULT 0,
  renewal_date DATE,
  trial_ends_at DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_subscriptions TO authenticated;
GRANT ALL ON public.org_subscriptions TO service_role;
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "executives read all subs"
  ON public.org_subscriptions FOR SELECT TO authenticated
  USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "executives manage subs"
  ON public.org_subscriptions FOR ALL TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE POLICY "org admin reads own sub"
  ON public.org_subscriptions FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_org_sub_updated_at
  BEFORE UPDATE ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Support tickets (also used by NECTAR Help escalation) ───────────────
CREATE TABLE public.org_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'nectar_help'
  subject TEXT NOT NULL,
  body TEXT,
  status public.ticket_status NOT NULL DEFAULT 'submitted',
  severity public.ticket_severity NOT NULL DEFAULT 'normal',
  assignee_user_id UUID,
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_tickets_org ON public.org_support_tickets(organization_id);
CREATE INDEX idx_tickets_status ON public.org_support_tickets(status);
CREATE INDEX idx_tickets_opened_by ON public.org_support_tickets(opened_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_support_tickets TO authenticated;
GRANT ALL ON public.org_support_tickets TO service_role;
ALTER TABLE public.org_support_tickets ENABLE ROW LEVEL SECURITY;

-- Org admins & ticket opener see tickets for their org
CREATE POLICY "org admin reads org tickets"
  ON public.org_support_tickets FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR opened_by = auth.uid()
  );
CREATE POLICY "org admin opens tickets"
  ON public.org_support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );
CREATE POLICY "org admin updates own org tickets"
  ON public.org_support_tickets FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
-- HIVE executives see and update all tickets
CREATE POLICY "executives read all tickets"
  ON public.org_support_tickets FOR SELECT TO authenticated
  USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "executives update all tickets"
  ON public.org_support_tickets FOR UPDATE TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE TRIGGER trg_ticket_updated_at
  BEFORE UPDATE ON public.org_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── NECTAR saved reports ────────────────────────────────────────────────
CREATE TABLE public.nectar_saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  plan JSONB,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_reports_org ON public.nectar_saved_reports(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_saved_reports TO authenticated;
GRANT ALL ON public.nectar_saved_reports TO service_role;
ALTER TABLE public.nectar_saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins manage saved reports"
  ON public.nectar_saved_reports FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_saved_report_updated_at
  BEFORE UPDATE ON public.nectar_saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── NECTAR report schedules ─────────────────────────────────────────────
CREATE TABLE public.nectar_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_report_id UUID NOT NULL REFERENCES public.nectar_saved_reports(id) ON DELETE CASCADE,
  cadence public.report_cadence NOT NULL,
  day_of_week INTEGER,    -- 0..6 (weekly)
  day_of_month INTEGER,   -- 1..28 (monthly)
  hour INTEGER NOT NULL DEFAULT 8,
  deliver_email BOOLEAN NOT NULL DEFAULT true,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  deliver_save BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedules_next_run ON public.nectar_report_schedules(next_run_at) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_report_schedules TO authenticated;
GRANT ALL ON public.nectar_report_schedules TO service_role;
ALTER TABLE public.nectar_report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins manage schedules"
  ON public.nectar_report_schedules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.nectar_saved_reports r
    WHERE r.id = saved_report_id
      AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nectar_saved_reports r
    WHERE r.id = saved_report_id
      AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ));

CREATE TRIGGER trg_schedule_updated_at
  BEFORE UPDATE ON public.nectar_report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── NECTAR report runs (history) ────────────────────────────────────────
CREATE TABLE public.nectar_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_report_id UUID NOT NULL REFERENCES public.nectar_saved_reports(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER,
  csv_url TEXT,
  error TEXT
);
CREATE INDEX idx_runs_saved_report ON public.nectar_report_runs(saved_report_id, ran_at DESC);
GRANT SELECT, INSERT ON public.nectar_report_runs TO authenticated;
GRANT ALL ON public.nectar_report_runs TO service_role;
ALTER TABLE public.nectar_report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read runs"
  ON public.nectar_report_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.nectar_saved_reports r
    WHERE r.id = saved_report_id
      AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ));
CREATE POLICY "org admins log runs"
  ON public.nectar_report_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nectar_saved_reports r
    WHERE r.id = saved_report_id
      AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ));
