
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  agency_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, agency_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'agency_name'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Training modules
CREATE TABLE public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  progress INT DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can read modules" ON public.training_modules FOR SELECT TO authenticated USING (true);

-- Staff certifications
CREATE TABLE public.staff_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name TEXT NOT NULL,
  role TEXT,
  certification TEXT NOT NULL,
  issued_date DATE,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can read certs" ON public.staff_certifications FOR SELECT TO authenticated USING (true);

-- Seed
INSERT INTO public.training_modules (title, description, duration_minutes, progress, category) VALUES
  ('DSPD Core Compliance', 'Mandatory orientation covering DSPD policies and procedures.', 45, 100, 'Compliance'),
  ('Medication Administration', 'Safe medication handling for direct support staff.', 60, 78, 'Clinical'),
  ('Person-Centered Planning', 'Building individualized support plans.', 40, 52, 'Care'),
  ('Incident Reporting & Documentation', 'Accurate reporting workflows and timelines.', 30, 34, 'Compliance'),
  ('CPR & First Aid Recertification', 'Annual recertification refresher.', 90, 12, 'Safety');

INSERT INTO public.staff_certifications (staff_name, role, certification, issued_date, expiration_date, status) VALUES
  ('Maria Gonzalez', 'DSP Lead', 'CPR / First Aid', '2024-03-12', '2026-03-12', 'active'),
  ('James Carter', 'Direct Support', 'Medication Admin', '2024-01-08', '2025-12-30', 'expiring'),
  ('Aisha Patel', 'Case Manager', 'DSPD Core', '2023-11-20', '2025-11-20', 'expiring'),
  ('David Nguyen', 'Direct Support', 'Bloodborne Pathogens', '2024-06-01', '2026-06-01', 'active'),
  ('Sophia Reyes', 'Behavioral Tech', 'Crisis Intervention', '2023-02-14', '2025-02-14', 'expired'),
  ('Liam Thompson', 'DSP', 'CPR / First Aid', '2024-09-05', '2026-09-05', 'active'),
  ('Ethan Brown', 'Nurse', 'Medication Admin', '2024-04-22', '2026-04-22', 'active');
