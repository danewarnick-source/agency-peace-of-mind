ALTER TABLE public.referral_match_scores
  ADD COLUMN IF NOT EXISTS scored_components text[] NOT NULL DEFAULT ARRAY['location','host_fit','disability_fit','need_fit','code_overlap']::text[];

-- Force recompute by clearing cache so A5.1 logic applies to existing rows
TRUNCATE TABLE public.referral_match_scores;