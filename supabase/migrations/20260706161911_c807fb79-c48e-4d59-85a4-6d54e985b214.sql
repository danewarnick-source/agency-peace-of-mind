
-- =========================================================================
-- 1. nectar_requirements: new columns
-- =========================================================================
ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS obligation_category text,
  ADD COLUMN IF NOT EXISTS obligation_category_source text
    CHECK (obligation_category_source IN ('nectar','provider')),
  ADD COLUMN IF NOT EXISTS activation_state text NOT NULL DEFAULT 'active'
    CHECK (activation_state IN ('active','pending_code_activation','active_by_code','inactive')),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_optional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_title text,
  ADD COLUMN IF NOT EXISTS original_description text,
  ADD COLUMN IF NOT EXISTS original_source_citation text,
  ADD COLUMN IF NOT EXISTS original_frozen_at timestamptz;

ALTER TABLE public.nectar_requirements
  ADD CONSTRAINT nectar_requirements_obligation_category_chk
  CHECK (obligation_category IS NULL OR obligation_category IN
    ('admin_internal','admin_external','client','staff','provider_wide','billing_code'))
  NOT VALID;

-- =========================================================================
-- 2. Freeze-on-insert trigger: snapshot original_* once, forever
-- =========================================================================
CREATE OR REPLACE FUNCTION public.nectar_requirements_freeze_original()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.original_title := NEW.title;
    NEW.original_description := NEW.description;
    NEW.original_source_citation := NEW.source_citation;
    NEW.original_frozen_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE: originals are immutable, period. No role exception.
  IF NEW.original_title IS DISTINCT FROM OLD.original_title
     OR NEW.original_description IS DISTINCT FROM OLD.original_description
     OR NEW.original_source_citation IS DISTINCT FROM OLD.original_source_citation
     OR NEW.original_frozen_at IS DISTINCT FROM OLD.original_frozen_at THEN
    RAISE EXCEPTION 'nectar_requirements.original_* columns are immutable (frozen at insert for legal audit)';
  END IF;

  -- For document-origin rows, title/description/source_citation are also immutable
  -- once frozen — providers edit usage notes, not source text.
  IF OLD.origin = 'document' AND OLD.original_frozen_at IS NOT NULL THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.source_citation IS DISTINCT FROM OLD.source_citation THEN
      RAISE EXCEPTION 'nectar_requirements verbatim text (title/description/source_citation) is immutable for document-origin requirements; use nectar_requirement_usage for provider notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nectar_requirements_freeze ON public.nectar_requirements;
CREATE TRIGGER trg_nectar_requirements_freeze
  BEFORE INSERT OR UPDATE ON public.nectar_requirements
  FOR EACH ROW EXECUTE FUNCTION public.nectar_requirements_freeze_original();

-- =========================================================================
-- 3. nectar_requirement_usage: append-only editable usage notes
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.nectar_requirement_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  usage_note text NOT NULL,
  edit_reason text,
  supersedes_id uuid REFERENCES public.nectar_requirement_usage(id),
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nectar_requirement_usage_req_time
  ON public.nectar_requirement_usage(requirement_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_nectar_requirement_usage_org
  ON public.nectar_requirement_usage(organization_id);

GRANT SELECT, INSERT ON public.nectar_requirement_usage TO authenticated;
GRANT ALL ON public.nectar_requirement_usage TO service_role;
ALTER TABLE public.nectar_requirement_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read usage" ON public.nectar_requirement_usage
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admin/manager insert usage" ON public.nectar_requirement_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND edited_by = auth.uid()
  );
-- No UPDATE, no DELETE policies → audit-immutable.

-- Block updates/deletes even for table owner via trigger (belt & suspenders)
CREATE OR REPLACE FUNCTION public.nectar_requirement_usage_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'nectar_requirement_usage rows are append-only (audit trail)';
END;
$$;
DROP TRIGGER IF EXISTS trg_nectar_usage_no_update ON public.nectar_requirement_usage;
CREATE TRIGGER trg_nectar_usage_no_update
  BEFORE UPDATE OR DELETE ON public.nectar_requirement_usage
  FOR EACH ROW EXECUTE FUNCTION public.nectar_requirement_usage_immutable();

-- Current-usage view: latest row per requirement
CREATE OR REPLACE VIEW public.nectar_requirement_usage_current_v AS
SELECT DISTINCT ON (requirement_id)
  requirement_id, organization_id, id AS usage_id,
  usage_note, edited_by, edited_at
FROM public.nectar_requirement_usage
ORDER BY requirement_id, edited_at DESC;

GRANT SELECT ON public.nectar_requirement_usage_current_v TO authenticated;

-- =========================================================================
-- 4. nectar_requirement_category_history: append-only category log
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.nectar_requirement_category_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  from_category text,
  to_category text NOT NULL,
  change_source text NOT NULL CHECK (change_source IN ('nectar','provider')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nectar_req_cat_hist_req
  ON public.nectar_requirement_category_history(requirement_id, changed_at DESC);

GRANT SELECT, INSERT ON public.nectar_requirement_category_history TO authenticated;
GRANT ALL ON public.nectar_requirement_category_history TO service_role;
ALTER TABLE public.nectar_requirement_category_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read cat history" ON public.nectar_requirement_category_history
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admin/manager insert cat history" ON public.nectar_requirement_category_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND (change_source = 'nectar' OR changed_by = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.nectar_req_cat_hist_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'nectar_requirement_category_history rows are append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_nectar_cat_hist_no_update ON public.nectar_requirement_category_history;
CREATE TRIGGER trg_nectar_cat_hist_no_update
  BEFORE UPDATE OR DELETE ON public.nectar_requirement_category_history
  FOR EACH ROW EXECUTE FUNCTION public.nectar_req_cat_hist_immutable();

-- =========================================================================
-- 5. nectar_code_activations: per-(org, code) one-click confirmations
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.nectar_code_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  requirement_count_at_confirm integer NOT NULL DEFAULT 0,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  deactivated_by uuid,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nectar_code_activations_active_unique
  ON public.nectar_code_activations(organization_id, service_code)
  WHERE deactivated_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.nectar_code_activations TO authenticated;
GRANT ALL ON public.nectar_code_activations TO service_role;
ALTER TABLE public.nectar_code_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read code activations" ON public.nectar_code_activations
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admin/manager insert code activation" ON public.nectar_code_activations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND confirmed_by = auth.uid()
  );

CREATE POLICY "admin/manager deactivate code activation" ON public.nectar_code_activations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- =========================================================================
-- 6. Backfill original_* on existing rows (one-time, bypassing UPDATE guard)
-- =========================================================================
ALTER TABLE public.nectar_requirements DISABLE TRIGGER trg_nectar_requirements_freeze;

UPDATE public.nectar_requirements
SET original_title = title,
    original_description = description,
    original_source_citation = source_citation,
    original_frozen_at = COALESCE(created_at, now())
WHERE original_frozen_at IS NULL;

-- Backfill obligation_category by heuristic
UPDATE public.nectar_requirements
SET obligation_category = CASE
      WHEN service_code IS NOT NULL THEN 'billing_code'
      WHEN applies_to = 'client' THEN 'client'
      WHEN applies_to IN ('staff','employee') THEN 'staff'
      WHEN COALESCE(title,'') || ' ' || COALESCE(description,'') ~* '\y(DWS|DACS|UPI|DSPD portal|state portal|submit to state|OIG|DHHS)\y'
        THEN 'admin_external'
      ELSE 'provider_wide'
    END,
    obligation_category_source = 'nectar'
WHERE obligation_category IS NULL;

-- Activation state backfill:
--   generic obligations  → active
--   billing_code (any)   → pending_code_activation (provider will confirm per code)
UPDATE public.nectar_requirements
SET activation_state = CASE
      WHEN obligation_category = 'billing_code' THEN 'pending_code_activation'
      ELSE 'active'
    END
WHERE activation_state = 'active'; -- default from ADD COLUMN; overwrite as needed

ALTER TABLE public.nectar_requirements ENABLE TRIGGER trg_nectar_requirements_freeze;

-- Validate the deferred CHECK now that data is populated
ALTER TABLE public.nectar_requirements
  VALIDATE CONSTRAINT nectar_requirements_obligation_category_chk;

-- =========================================================================
-- 7. Auto-classify new authorized codes → set matching reqs to pending
-- =========================================================================
CREATE OR REPLACE FUNCTION public.nectar_on_authorized_code_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.nectar_requirements
     SET activation_state = 'pending_code_activation'
   WHERE organization_id = NEW.organization_id
     AND obligation_category = 'billing_code'
     AND (service_code = NEW.service_code
          OR NEW.service_code = ANY(COALESCE(service_codes_all, ARRAY[]::text[])))
     AND activation_state NOT IN ('active_by_code','pending_code_activation');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nectar_on_authorized_code_added ON public.provider_authorized_codes;
CREATE TRIGGER trg_nectar_on_authorized_code_added
  AFTER INSERT ON public.provider_authorized_codes
  FOR EACH ROW EXECUTE FUNCTION public.nectar_on_authorized_code_added();
