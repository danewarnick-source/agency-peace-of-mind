-- Additive nectar_requirements catalog-relation columns (Compliance revamp Step 7).
-- Intake / agency-source rows propose match | overlay | conflict against the
-- keyed SOW catalog. Idempotent. No DROP. No new RLS (inherits org-scoped
-- nectar_requirements policies).
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- AFTER Step 5 Soft (clear the editor first). See docs/SQL_HANDOFF.md.

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS catalog_key text;

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS catalog_relation text;

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS catalog_relation_status text;

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS catalog_relation_rationale text;

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS catalog_overlay jsonb;

ALTER TABLE public.nectar_requirements
  DROP CONSTRAINT IF EXISTS nectar_requirements_catalog_relation_chk;
ALTER TABLE public.nectar_requirements
  ADD CONSTRAINT nectar_requirements_catalog_relation_chk
  CHECK (
    catalog_relation IS NULL
    OR catalog_relation IN ('match', 'overlay', 'conflict')
  );

ALTER TABLE public.nectar_requirements
  DROP CONSTRAINT IF EXISTS nectar_requirements_catalog_relation_status_chk;
ALTER TABLE public.nectar_requirements
  ADD CONSTRAINT nectar_requirements_catalog_relation_status_chk
  CHECK (
    catalog_relation_status IS NULL
    OR catalog_relation_status IN ('proposed', 'confirmed', 'dismissed')
  );

CREATE INDEX IF NOT EXISTS nectar_requirements_org_catalog_relation_idx
  ON public.nectar_requirements (organization_id, catalog_relation)
  WHERE catalog_relation IS NOT NULL;
