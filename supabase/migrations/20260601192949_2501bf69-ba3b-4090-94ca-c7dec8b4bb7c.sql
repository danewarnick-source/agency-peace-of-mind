INSERT INTO public.hive_executives (user_id, active, notes)
SELECT p.id, true, 'Seeded as founding HIVE Executive'
FROM public.profiles p
WHERE lower(p.email) IN ('admin@tnsutah.com','danewarnick@gmail.com','dane@tnsutah.com')
ON CONFLICT (user_id) DO UPDATE SET active = true, notes = COALESCE(public.hive_executives.notes, EXCLUDED.notes);