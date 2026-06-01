
DO $$ BEGIN
  CREATE TYPE public.hive_ticket_category AS ENUM (
    'structural_gap','parsing_failure','expansion_need','mapping_gap','permission_inconsistency','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hive_ticket_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hive_ticket_status AS ENUM ('new','in_progress','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hive_ticket_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.hive_platform_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggering_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  triggering_org_name text,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  category public.hive_ticket_category NOT NULL DEFAULT 'other',
  severity public.hive_ticket_severity NOT NULL DEFAULT 'medium',
  status public.hive_ticket_status NOT NULL DEFAULT 'new',
  source public.hive_ticket_source NOT NULL DEFAULT 'manual',
  event_kind text,
  event_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  affected_orgs int NOT NULL DEFAULT 1,
  resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hive_platform_tickets_dedupe_open
  ON public.hive_platform_tickets(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status <> 'resolved';

CREATE INDEX IF NOT EXISTS hive_platform_tickets_status_idx
  ON public.hive_platform_tickets(status, detected_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.hive_platform_tickets TO authenticated;
GRANT ALL ON public.hive_platform_tickets TO service_role;

ALTER TABLE public.hive_platform_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HIVE execs can view tickets" ON public.hive_platform_tickets;
CREATE POLICY "HIVE execs can view tickets"
  ON public.hive_platform_tickets FOR SELECT
  USING (public.is_hive_executive(auth.uid()));

DROP POLICY IF EXISTS "HIVE execs can insert tickets" ON public.hive_platform_tickets;
CREATE POLICY "HIVE execs can insert tickets"
  ON public.hive_platform_tickets FOR INSERT
  WITH CHECK (public.is_hive_executive(auth.uid()));

DROP POLICY IF EXISTS "HIVE execs can update tickets" ON public.hive_platform_tickets;
CREATE POLICY "HIVE execs can update tickets"
  ON public.hive_platform_tickets FOR UPDATE
  USING (public.is_hive_executive(auth.uid()));

DROP TRIGGER IF EXISTS hive_platform_tickets_touch ON public.hive_platform_tickets;
CREATE TRIGGER hive_platform_tickets_touch
  BEFORE UPDATE ON public.hive_platform_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
