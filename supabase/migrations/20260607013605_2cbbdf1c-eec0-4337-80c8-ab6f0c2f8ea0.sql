
-- ============================================================
-- 1) Extend notifications to deliver to individual staff users
-- ============================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_unread
  ON public.notifications (recipient_user_id, read_at)
  WHERE read_at IS NULL AND recipient_user_id IS NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_role_check
  CHECK (recipient_role = ANY (ARRAY['admin','manager','super_admin','staff']));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'incident_report_filed','incident_deadline_warning','timesheet_exception',
    'daily_log_exception','open_shift_warning','medication_error',
    'form_assigned','form_reminder','form_due'
  ]));

-- Allow a staff member to read notifications targeted to them.
DROP POLICY IF EXISTS "staff read own targeted notifications" ON public.notifications;
CREATE POLICY "staff read own targeted notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "staff update own targeted notifications" ON public.notifications;
CREATE POLICY "staff update own targeted notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- ============================================================
-- 2) forms — admin-built custom forms
-- ============================================================
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  category text NOT NULL DEFAULT 'general',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency text NOT NULL DEFAULT 'as_needed'
    CHECK (frequency IN ('as_needed','daily','weekly','monthly','quarterly','annually')),
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_groups text[] NOT NULL DEFAULT '{}'::text[],
  assigned_users uuid[] NOT NULL DEFAULT '{}'::uuid[],
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forms_org_status ON public.forms (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_forms_assigned_users ON public.forms USING gin (assigned_users);
CREATE INDEX IF NOT EXISTS idx_forms_assigned_groups ON public.forms USING gin (assigned_groups);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Admins/managers/super_admins can fully manage forms in their org.
CREATE POLICY "admins manage org forms" ON public.forms
  FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    )
  );

-- Staff can SELECT a published form they're assigned to (by group OR individually).
CREATE POLICY "staff read assigned published forms" ON public.forms
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND public.is_org_member(organization_id, auth.uid())
    AND (
      'all_staff' = ANY(assigned_groups)
      OR auth.uid() = ANY(assigned_users)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.staff_type_keys && assigned_groups
      )
    )
  );

CREATE TRIGGER trg_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) form_submissions — staff submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_key text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_subs_form ON public.form_submissions (form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_subs_user_period ON public.form_submissions (form_id, submitted_by, period_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Admins/managers read all submissions in their org.
CREATE POLICY "admins read org submissions" ON public.form_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    )
  );

-- Staff can read their own.
CREATE POLICY "staff read own submissions" ON public.form_submissions
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

-- Staff can insert their own submission against a published form they're assigned to.
CREATE POLICY "staff insert own submissions" ON public.form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_id
        AND f.organization_id = organization_id
        AND f.status = 'published'
        AND (
          'all_staff' = ANY(f.assigned_groups)
          OR auth.uid() = ANY(f.assigned_users)
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.staff_type_keys && f.assigned_groups
          )
        )
    )
  );

-- Staff can update their own submission only when settings.allow_edit = true.
CREATE POLICY "staff update own submissions when allowed" ON public.form_submissions
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.forms f
      WHERE f.id = form_id
        AND COALESCE((f.settings->>'allow_edit')::boolean, false) = true
    )
  )
  WITH CHECK (submitted_by = auth.uid());

CREATE TRIGGER trg_form_subs_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4) form_notifications — admin-edited notification text per form
-- ============================================================
CREATE TABLE IF NOT EXISTS public.form_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_notifications_form ON public.form_notifications (form_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_notifications TO authenticated;
GRANT ALL ON public.form_notifications TO service_role;

ALTER TABLE public.form_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage form notifications" ON public.form_notifications
  FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    )
  );
