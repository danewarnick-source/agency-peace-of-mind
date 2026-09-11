-- Soft + Ask staff threads (Compliance revamp Step 9).
-- Additive. Idempotent. No DROP TABLE on product tables.
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- (clear the editor first). See docs/SQL_HANDOFF.md.

-- ── threads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject text NOT NULL,
  timesheet_id uuid,
  team_id uuid,
  client_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.threads
  DROP CONSTRAINT IF EXISTS threads_kind_chk;
ALTER TABLE public.threads
  ADD CONSTRAINT threads_kind_chk
  CHECK (kind IN ('shift', 'team', 'client'));

CREATE INDEX IF NOT EXISTS threads_org_idx
  ON public.threads (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS threads_timesheet_idx
  ON public.threads (timesheet_id)
  WHERE timesheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS threads_team_idx
  ON public.threads (team_id)
  WHERE team_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.threads TO authenticated;
GRANT ALL ON public.threads TO service_role;

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS threads_select_member ON public.threads;
CREATE POLICY threads_select_member
  ON public.threads
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS threads_write_admin ON public.threads;
CREATE POLICY threads_write_admin
  ON public.threads
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- ── thread_members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.thread_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);

ALTER TABLE public.thread_members
  DROP CONSTRAINT IF EXISTS thread_members_role_chk;
ALTER TABLE public.thread_members
  ADD CONSTRAINT thread_members_role_chk
  CHECK (role IN ('asker', 'staff', 'member'));

CREATE INDEX IF NOT EXISTS thread_members_org_idx
  ON public.thread_members (organization_id);
CREATE INDEX IF NOT EXISTS thread_members_user_idx
  ON public.thread_members (user_id, thread_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_members TO authenticated;
GRANT ALL ON public.thread_members TO service_role;

ALTER TABLE public.thread_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thread_members_select_member ON public.thread_members;
CREATE POLICY thread_members_select_member
  ON public.thread_members
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS thread_members_write_admin ON public.thread_members;
CREATE POLICY thread_members_write_admin
  ON public.thread_members
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- ── thread_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
  author_id uuid,
  kind text NOT NULL DEFAULT 'message',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.thread_messages
  DROP CONSTRAINT IF EXISTS thread_messages_kind_chk;
ALTER TABLE public.thread_messages
  ADD CONSTRAINT thread_messages_kind_chk
  CHECK (kind IN ('question', 'answer', 'message'));

CREATE INDEX IF NOT EXISTS thread_messages_thread_idx
  ON public.thread_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS thread_messages_org_idx
  ON public.thread_messages (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_messages TO authenticated;
GRANT ALL ON public.thread_messages TO service_role;

ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thread_messages_select_member ON public.thread_messages;
CREATE POLICY thread_messages_select_member
  ON public.thread_messages
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS thread_messages_insert_participant ON public.thread_messages;
CREATE POLICY thread_messages_insert_participant
  ON public.thread_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.is_org_admin_or_manager(organization_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.thread_members m
        WHERE m.thread_id = thread_messages.thread_id
          AND m.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS thread_messages_update_author ON public.thread_messages;
CREATE POLICY thread_messages_update_author
  ON public.thread_messages
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR author_id = auth.uid()
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR author_id = auth.uid()
  );
