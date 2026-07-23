-- HRC 8-element rights-restriction documentation (SOW §1.20, HCBS Settings Rule).
-- One row per active rights restriction in place for a client. Each of the
-- eight required elements is its own column so completeness can be verified
-- field-by-field instead of relying on a single freeform note.
CREATE TABLE public.hrc_restriction_records (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                   uuid        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  restriction_title           text        NOT NULL CHECK (char_length(restriction_title) BETWEEN 1 AND 200),
  active                      boolean     NOT NULL DEFAULT true,

  -- (a) Informed consent of the person — documented and signed.
  consent_text                text,
  consent_signed_date         date,

  -- (b) Specific, individualized assessed need — described in writing.
  assessed_need_text          text,

  -- (c) Positive interventions and supports used prior to the modification.
  positive_interventions_text text,

  -- (d) Less intrusive methods tried that did not work.
  less_intrusive_methods_text text,

  -- (e) Clear description of the condition directly proportionate to the assessed need.
  condition_description_text  text,

  -- (f) Regular data collection and review schedule — with date of last review.
  data_review_text            text,
  last_review_date            date,

  -- (g) Time limits set for periodic re-review — with the next re-review date.
  time_limits_text            text,
  next_review_date            date,

  -- (h) Assurance that the intervention causes no harm to the individual.
  no_harm_text                text,

  created_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrc_restriction_records TO authenticated;
GRANT ALL                            ON public.hrc_restriction_records TO service_role;

ALTER TABLE public.hrc_restriction_records ENABLE ROW LEVEL SECURITY;

-- Org members (incl. committee members) may read.
CREATE POLICY "hrr_read" ON public.hrc_restriction_records
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hrc_committee_member(organization_id, auth.uid())
  );

-- Only admins/managers write (matches hrc_reviews / hrc_meetings convention).
CREATE POLICY "hrr_write" ON public.hrc_restriction_records
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_hrr_updated
  BEFORE UPDATE ON public.hrc_restriction_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_hrr_org               ON public.hrc_restriction_records(organization_id);
CREATE INDEX idx_hrr_client            ON public.hrc_restriction_records(client_id);
CREATE INDEX idx_hrr_active_next_review ON public.hrc_restriction_records(next_review_date) WHERE active = true;
