-- ── Staff groups (for targeting company obligations at a subset of staff) ──
CREATE TABLE IF NOT EXISTS public.staff_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  color            text,
  linked_team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_groups_org ON public.staff_groups(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_groups TO authenticated;
GRANT ALL ON public.staff_groups TO service_role;

ALTER TABLE public.staff_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read staff groups"
  ON public.staff_groups FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage staff groups"
  ON public.staff_groups FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS staff_groups_set_updated_at ON public.staff_groups;
CREATE TRIGGER staff_groups_set_updated_at
  BEFORE UPDATE ON public.staff_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Staff group membership ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.staff_groups(id) ON DELETE CASCADE,
  staff_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at  timestamptz DEFAULT now(),
  UNIQUE (group_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_group_members_group ON public.staff_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_staff_group_members_staff ON public.staff_group_members(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_group_members TO authenticated;
GRANT ALL ON public.staff_group_members TO service_role;

ALTER TABLE public.staff_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read staff group members"
  ON public.staff_group_members FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_member(g.organization_id, auth.uid())
    )
  );

CREATE POLICY "admins manage staff group members"
  ON public.staff_group_members FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_admin_or_manager(g.organization_id, auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff_groups g
      WHERE g.id = staff_group_members.group_id
        AND is_org_admin_or_manager(g.organization_id, auth.uid())
    )
  );

-- ── Company obligation definitions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title                     text NOT NULL,
  description               text,
  source_policy_section     text,
  cadence                   text NOT NULL CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'annually', 'per_event', 'one_time')),
  due_day_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  reminder_days_before      integer[] NOT NULL DEFAULT '{}',
  evidence_type             text NOT NULL CHECK (evidence_type IN ('attestation', 'upload', 'upload_and_attestation', 'form')),
  linked_form_id            uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  attestation_text          text,
  requires_individual_completion boolean NOT NULL DEFAULT false,
  assigned_to_groups        uuid[] NOT NULL DEFAULT '{}',
  assigned_to_users         uuid[] NOT NULL DEFAULT '{}',
  assignee_role             text NOT NULL DEFAULT 'any_assigned' CHECK (assignee_role IN ('any_assigned', 'managers_only', 'admin_only')),
  notify_manager_on_complete boolean NOT NULL DEFAULT true,
  notify_manager_on_overdue  boolean NOT NULL DEFAULT true,
  active                    boolean NOT NULL DEFAULT true,
  created_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_obligations_org ON public.company_obligations(organization_id);
CREATE INDEX IF NOT EXISTS idx_company_obligations_form ON public.company_obligations(linked_form_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligations TO authenticated;
GRANT ALL ON public.company_obligations TO service_role;

ALTER TABLE public.company_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read company obligations"
  ON public.company_obligations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage company obligations"
  ON public.company_obligations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS company_obligations_set_updated_at ON public.company_obligations;
CREATE TRIGGER company_obligations_set_updated_at
  BEFORE UPDATE ON public.company_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Company obligation instances (one per due period) ───────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligation_instances (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id               uuid NOT NULL REFERENCES public.company_obligations(id) ON DELETE CASCADE,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_key                  text NOT NULL,
  due_at                      timestamptz NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue', 'waived')),
  completed_at                timestamptz,
  completed_by_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by_name           text,
  evidence_type_used          text,
  upload_path                 text,
  upload_filename             text,
  attestation_signed_at       timestamptz,
  attestation_signed_by_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attestation_signed_by_name  text,
  attestation_text_snapshot   text,
  form_submission_id          uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  event_description           text,
  waive_reason                text,
  admin_notes                 text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE (obligation_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_org_status_due
  ON public.company_obligation_instances(organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_obligation
  ON public.company_obligation_instances(obligation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_instances TO authenticated;
GRANT ALL ON public.company_obligation_instances TO service_role;

ALTER TABLE public.company_obligation_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read company obligation instances"
  ON public.company_obligation_instances FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage company obligation instances"
  ON public.company_obligation_instances FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS company_obligation_instances_set_updated_at ON public.company_obligation_instances;
CREATE TRIGGER company_obligation_instances_set_updated_at
  BEFORE UPDATE ON public.company_obligation_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Per-instance assignee snapshot ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_obligation_instance_assignees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      uuid NOT NULL REFERENCES public.company_obligation_instances(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  staff_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name       text NOT NULL,
  staff_role       text,
  UNIQUE (instance_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_instance_assignees_instance
  ON public.company_obligation_instance_assignees(instance_id);
CREATE INDEX IF NOT EXISTS idx_company_obligation_instance_assignees_staff
  ON public.company_obligation_instance_assignees(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_instance_assignees TO authenticated;
GRANT ALL ON public.company_obligation_instance_assignees TO service_role;

ALTER TABLE public.company_obligation_instance_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read obligation instance assignees"
  ON public.company_obligation_instance_assignees FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage obligation instance assignees"
  ON public.company_obligation_instance_assignees FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ── Individual completions (for obligations requiring per-staff completion) ─
CREATE TABLE IF NOT EXISTS public.company_obligation_completions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                 uuid NOT NULL REFERENCES public.company_obligation_instances(id) ON DELETE CASCADE,
  organization_id             uuid NOT NULL,
  staff_id                    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name                  text NOT NULL,
  evidence_type_used          text NOT NULL,
  upload_path                 text,
  upload_filename             text,
  attestation_signed_at       timestamptz,
  attestation_text_snapshot   text,
  form_submission_id          uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  completed_at                timestamptz NOT NULL DEFAULT now(),
  is_manual_entry             boolean NOT NULL DEFAULT false,
  manual_entry_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manual_entry_by_name        text,
  notes                       text
);

CREATE INDEX IF NOT EXISTS idx_company_obligation_completions_instance
  ON public.company_obligation_completions(instance_id);
CREATE INDEX IF NOT EXISTS idx_company_obligation_completions_staff
  ON public.company_obligation_completions(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_obligation_completions TO authenticated;
GRANT ALL ON public.company_obligation_completions TO service_role;

ALTER TABLE public.company_obligation_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read obligation completions"
  ON public.company_obligation_completions FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff insert own obligation completions"
  ON public.company_obligation_completions FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  );

CREATE POLICY "admins manage obligation completions"
  ON public.company_obligation_completions FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ── Storage bucket for obligation evidence uploads ──────────────────────────
-- Path structure: {organization_id}/{obligation_id}/{instance_id}/{original_filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'obligation-evidence',
  'obligation-evidence',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "obligation evidence select org members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
      OR owner = auth.uid()
    )
  );

CREATE POLICY "obligation evidence insert org members"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "obligation evidence update admins"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "obligation evidence delete admins"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'obligation-evidence'
    AND (
      is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR is_super_admin(auth.uid())
    )
  );
