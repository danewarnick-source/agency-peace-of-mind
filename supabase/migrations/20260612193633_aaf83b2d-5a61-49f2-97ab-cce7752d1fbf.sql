
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-ingest-5min') THEN
    PERFORM cron.unschedule('gmail-ingest-5min');
  END IF;
END $$;

SELECT cron.schedule(
  'gmail-ingest-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app/api/public/hooks/gmail-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'NECTAR_CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
