ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS training_only boolean NOT NULL DEFAULT false;

DO $$ BEGIN CREATE TYPE public.hive_training_catalog_kind AS ENUM ('full_program','ala_carte'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.hive_training_order_model AS ENUM ('bulk_seats','individual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.hive_training_order_status AS ENUM ('pending','paid','refunded','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.hive_training_seat_status AS ENUM ('available','assigned','consumed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.hive_training_assignment_status AS ENUM ('pending_payment','not_started','in_progress','completed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.hive_training_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.hive_training_catalog_kind NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_price_id text,
  includes text[] NOT NULL DEFAULT '{}',
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hive_training_catalog TO anon, authenticated;
GRANT ALL ON public.hive_training_catalog TO service_role;
ALTER TABLE public.hive_training_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog public read" ON public.hive_training_catalog FOR SELECT USING (active = true);
CREATE POLICY "catalog super admin write" ON public.hive_training_catalog
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.hive_training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_url text,
  estimated_minutes integer NOT NULL DEFAULT 60,
  cert_validity_months integer NOT NULL DEFAULT 12,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hive_training_courses TO anon, authenticated;
GRANT ALL ON public.hive_training_courses TO service_role;
ALTER TABLE public.hive_training_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses public read published" ON public.hive_training_courses FOR SELECT USING (published = true);
CREATE POLICY "courses super admin write" ON public.hive_training_courses
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.hive_training_course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.hive_training_courses(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  body_md text,
  video_url text,
  quiz_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.hive_training_course_modules(course_id, sort);
GRANT SELECT ON public.hive_training_course_modules TO anon, authenticated;
GRANT ALL ON public.hive_training_course_modules TO service_role;
ALTER TABLE public.hive_training_course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules public read" ON public.hive_training_course_modules
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.hive_training_courses c WHERE c.id = course_id AND c.published = true));
CREATE POLICY "modules super admin write" ON public.hive_training_course_modules
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.hive_training_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchaser_user_id uuid NOT NULL,
  model public.hive_training_order_model NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status public.hive_training_order_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.hive_training_orders(organization_id);
GRANT SELECT, INSERT, UPDATE ON public.hive_training_orders TO authenticated;
GRANT ALL ON public.hive_training_orders TO service_role;
ALTER TABLE public.hive_training_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders org read" ON public.hive_training_orders
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "orders org admin insert" ON public.hive_training_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) AND purchaser_user_id = auth.uid());
CREATE POLICY "orders org admin update pending" ON public.hive_training_orders
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) AND status = 'pending')
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.hive_training_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.hive_training_orders(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.hive_training_catalog(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.hive_training_order_items(order_id);
GRANT SELECT, INSERT ON public.hive_training_order_items TO authenticated;
GRANT ALL ON public.hive_training_order_items TO service_role;
ALTER TABLE public.hive_training_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items org read" ON public.hive_training_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.hive_training_orders o WHERE o.id = order_id AND public.is_org_member(o.organization_id, auth.uid())
  ));
CREATE POLICY "order items org admin insert" ON public.hive_training_order_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.hive_training_orders o WHERE o.id = order_id AND public.is_org_admin_or_manager(o.organization_id, auth.uid())
  ));

CREATE TABLE public.hive_training_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.hive_training_orders(id) ON DELETE SET NULL,
  catalog_id uuid NOT NULL REFERENCES public.hive_training_catalog(id),
  status public.hive_training_seat_status NOT NULL DEFAULT 'available',
  assigned_to_user_id uuid,
  assigned_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.hive_training_seats(organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.hive_training_seats TO authenticated;
GRANT ALL ON public.hive_training_seats TO service_role;
ALTER TABLE public.hive_training_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seats org read" ON public.hive_training_seats
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "seats org admin write" ON public.hive_training_seats
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.hive_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.hive_training_courses(id),
  seat_id uuid REFERENCES public.hive_training_seats(id) ON DELETE SET NULL,
  payment_model public.hive_training_order_model NOT NULL,
  order_id uuid REFERENCES public.hive_training_orders(id) ON DELETE SET NULL,
  status public.hive_training_assignment_status NOT NULL DEFAULT 'not_started',
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.hive_training_assignments(organization_id, user_id);
CREATE INDEX ON public.hive_training_assignments(user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.hive_training_assignments TO authenticated;
GRANT ALL ON public.hive_training_assignments TO service_role;
ALTER TABLE public.hive_training_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments read" ON public.hive_training_assignments
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "assignments org admin write" ON public.hive_training_assignments
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "assignments staff update own" ON public.hive_training_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.hive_training_module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.hive_training_assignments(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.hive_training_course_modules(id) ON DELETE CASCADE,
  completed_at timestamptz,
  quiz_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, module_id)
);
GRANT SELECT, INSERT, UPDATE ON public.hive_training_module_progress TO authenticated;
GRANT ALL ON public.hive_training_module_progress TO service_role;
ALTER TABLE public.hive_training_module_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module progress read" ON public.hive_training_module_progress
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.hive_training_assignments a
     WHERE a.id = assignment_id
       AND (a.user_id = auth.uid() OR public.is_org_member(a.organization_id, auth.uid()))
  ));
CREATE POLICY "module progress staff write" ON public.hive_training_module_progress
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.hive_training_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.hive_training_assignments a WHERE a.id = assignment_id AND a.user_id = auth.uid()
  ));

CREATE TABLE public.hive_training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.hive_training_assignments(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hive_training_certificates TO anon, authenticated;
GRANT ALL ON public.hive_training_certificates TO service_role;
ALTER TABLE public.hive_training_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificate public verify by code" ON public.hive_training_certificates FOR SELECT USING (true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;
  END IF;
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hive_training_catalog','hive_training_courses','hive_training_course_modules',
    'hive_training_orders','hive_training_seats','hive_training_assignments','hive_training_module_progress'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

INSERT INTO public.hive_training_catalog (sku, name, kind, price_cents, sort, includes) VALUES
  ('full_program', 'Full Training Program', 'full_program', 30000, 0, ARRAY[
    'CPR & First Aid','Mandt behavioral intervention','30-day DSPD required training',
    'Hands-on HIVE platform walkthrough','Competency verification & sign-off','12 hours custom ongoing training / year'
  ]),
  ('cpr_first_aid', 'CPR & First Aid', 'ala_carte', 7500, 1, ARRAY['CPR & First Aid certification']),
  ('mandt', 'Mandt Behavioral Intervention', 'ala_carte', 20000, 2, ARRAY['Mandt behavioral intervention']),
  ('dspd_required', 'DSPD Required Training', 'ala_carte', 10000, 3, ARRAY[
    '30-day DSPD required training','12 hours custom ongoing content / year'
  ])
ON CONFLICT (sku) DO NOTHING;