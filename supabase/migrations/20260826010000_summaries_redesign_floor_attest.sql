-- Summaries redesign: client HIVE start floor + filing / AI attestation columns
-- Safe to re-run.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS hive_start_date date;

COMMENT ON COLUMN public.clients.hive_start_date IS
  'When this client started on HIVE for summary/obligation date floors. Defaults to created_at when null.';

ALTER TABLE public.client_progress_summaries
  ADD COLUMN IF NOT EXISTS sc_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sc_sent_by uuid,
  ADD COLUMN IF NOT EXISTS ai_review_attested_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_review_attested_by uuid;

COMMENT ON COLUMN public.client_progress_summaries.sc_sent_at IS
  'When admin attested the finalized packet was sent to the Support Coordinator (non-UPI summaries).';
COMMENT ON COLUMN public.client_progress_summaries.ai_review_attested_at IS
  'When admin attested they reviewed the Nectar draft against HIVE documentation at finalize.';

-- Historical rows already completed should not reappear as "awaiting SC send".
UPDATE public.client_progress_summaries
SET sc_sent_at = completed_at,
    sc_sent_by = completed_by
WHERE completed_at IS NOT NULL
  AND requires_upi_attestation = false
  AND sc_sent_at IS NULL;

-- Already-finalized rows: treat prior finalize as AI review attested.
UPDATE public.client_progress_summaries
SET ai_review_attested_at = COALESCE(ai_review_attested_at, finalized_at),
    ai_review_attested_by = COALESCE(ai_review_attested_by, finalized_by)
WHERE finalized_at IS NOT NULL
  AND ai_review_attested_at IS NULL;
