ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS profile_photo_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-photos', 'client-photos', true, 5242880)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "client-photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-photos');

CREATE POLICY "client-photos authenticated write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-photos');

CREATE POLICY "client-photos authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-photos');

CREATE POLICY "client-photos authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-photos');