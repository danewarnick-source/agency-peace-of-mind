UPDATE public.nectar_draft_jobs
SET status = 'failed',
    error_message = 'Cancelled by admin — section repeatedly returned truncated JSON from Bedrock. Rerun the draft to try again.',
    updated_at = now()
WHERE id = '87c85fad-2288-4edf-b5c7-b91ab5a07789'
  AND status = 'extracting';