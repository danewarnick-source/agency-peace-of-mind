
-- =========================================================================
-- gmail_connections — one per org
-- =========================================================================
CREATE TABLE public.gmail_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  google_sub TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_history_id TEXT,
  last_polled_at TIMESTAMPTZ,
  last_error TEXT,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disconnected','error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant SELECT on safe columns only; tokens are reachable solely by service_role.
GRANT SELECT (id, organization_id, google_email, scopes, last_polled_at, last_error,
              connected_by, connected_at, disconnected_at, status, created_at, updated_at)
  ON public.gmail_connections TO authenticated;
GRANT ALL ON public.gmail_connections TO service_role;

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read connection status"
  ON public.gmail_connections FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id));

-- No INSERT/UPDATE/DELETE policies for authenticated — all writes go through
-- server functions using service_role after caller-side admin check.

-- =========================================================================
-- gmail_ingestion_rules — what counts as a referral email
-- =========================================================================
CREATE TABLE public.gmail_ingestion_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  sender_domains TEXT[] NOT NULL DEFAULT '{}',
  sender_emails TEXT[] NOT NULL DEFAULT '{}',
  subject_contains TEXT[] NOT NULL DEFAULT '{}',
  label_query TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_ingestion_rules TO authenticated;
GRANT ALL ON public.gmail_ingestion_rules TO service_role;

ALTER TABLE public.gmail_ingestion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read rules"
  ON public.gmail_ingestion_rules FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admins manage rules"
  ON public.gmail_ingestion_rules FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin_or_manager(auth.uid(), organization_id));

-- =========================================================================
-- gmail_ingested_messages — dedup ledger
-- =========================================================================
CREATE TABLE public.gmail_ingested_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  internal_date TIMESTAMPTZ,
  from_email TEXT,
  subject TEXT,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'created' CHECK (outcome IN ('created','skipped_no_match','skipped_duplicate','parse_failed','error')),
  error_message TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, gmail_message_id)
);

GRANT SELECT ON public.gmail_ingested_messages TO authenticated;
GRANT ALL ON public.gmail_ingested_messages TO service_role;

ALTER TABLE public.gmail_ingested_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read ingested messages"
  ON public.gmail_ingested_messages FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE INDEX gmail_ingested_messages_org_idx
  ON public.gmail_ingested_messages (organization_id, ingested_at DESC);

-- =========================================================================
-- gmail_ingestion_audit — PHI access log
-- =========================================================================
CREATE TABLE public.gmail_ingestion_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('system_cron','user','oauth_callback')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  gmail_message_id TEXT,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gmail_ingestion_audit TO authenticated;
GRANT ALL ON public.gmail_ingestion_audit TO service_role;

ALTER TABLE public.gmail_ingestion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read audit"
  ON public.gmail_ingestion_audit FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE INDEX gmail_ingestion_audit_org_idx
  ON public.gmail_ingestion_audit (organization_id, created_at DESC);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
CREATE TRIGGER update_gmail_connections_updated_at
  BEFORE UPDATE ON public.gmail_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gmail_ingestion_rules_updated_at
  BEFORE UPDATE ON public.gmail_ingestion_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- referrals: discard window
-- =========================================================================
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discard_reason TEXT;

-- =========================================================================
-- tombstones: extend with discard + message id (no PHI)
-- =========================================================================
ALTER TABLE public.referral_purge_tombstones
  ADD COLUMN IF NOT EXISTS discarded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
