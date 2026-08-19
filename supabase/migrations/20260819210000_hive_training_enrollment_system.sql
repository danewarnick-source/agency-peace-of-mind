-- New Hive Training enrollment system: catalog products, per-org seat
-- purchases, and per-staff enrollments through to certificate verification.
-- Replaces the dropped commerce tables (hive_training_orders etc, see
-- 20260819203000_drop_verified_dead_tables.sql) with a simpler
-- purchase-then-assign-seats model; Stripe wiring is a follow-up (purchases
-- start as payment_status = 'invoice_pending').

CREATE TABLE public.training_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  fulfills_obligation_key text,
  cert_type_label text,
  cert_keyword_groups jsonb,
  renewal_months integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.training_products
  (sku, name, description, price_cents, fulfills_obligation_key,
   cert_type_label, cert_keyword_groups, renewal_months, sort_order)
VALUES
(
  'CPR_FIRST_AID', 'CPR & First Aid Certification',
  'Required within 90 days of hire per SOW §1.8(5). Hive coordinates enrollment; provider admin uploads the certificate when complete.',
  7500, 'cpr_first_aid_initial', 'CPR & First Aid',
  '[{"label":"CPR","any_of":["cpr","cardiopulmonary resuscitation","bls","basic life support"]},{"label":"First Aid","any_of":["first aid","first-aid"]}]',
  24, 1
),
(
  'MANDT', 'MANDT Behavior Intervention',
  'Required within 180 days for staff serving Persons likely to engage in aggressive behavior per SOW §1.8(6).',
  8000, 'behavior_intervention_cert', 'MANDT Certification',
  '[{"label":"MANDT","any_of":["mandt","management of aggressive behavior","behavior intervention"]}]',
  24, 2
),
(
  'ORIENTATION_30', '30-Day Orientation Training',
  'Hive-authored 30-day orientation covering all 23 SOW §1.8(4) required topics.',
  14900, 'thirty_day_orientation', null, null, null, 3
);

ALTER TABLE public.training_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read training products"
  ON public.training_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "hive exec write training products"
  ON public.training_products FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.training_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.training_products(id),
  quantity integer NOT NULL DEFAULT 1,
  seats_remaining integer NOT NULL,
  price_cents_each integer NOT NULL,
  total_cents integer NOT NULL,
  payment_status text NOT NULL DEFAULT 'invoice_pending'
    CHECK (payment_status IN ('invoice_pending','paid','refunded','cancelled')),
  stripe_payment_intent_id text,
  purchased_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  purchased_by_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','fully_used','refunded','cancelled')),
  purchased_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.training_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read own purchases"
  ON public.training_purchases FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin')
      OR public.is_super_admin(auth.uid()));
CREATE POLICY "hive exec write purchases"
  ON public.training_purchases FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.training_purchases(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.training_products(id),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  staff_email text NOT NULL,
  staff_phone text,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','link_sent','completed','certificate_pending',
                      'certificate_uploaded','verified','cancelled')),
  enrolled_at timestamptz DEFAULT now(),
  link_sent_at timestamptz,
  link_sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  admin_notified_at timestamptz,
  certificate_uploaded_at timestamptz,
  certificate_path text,
  certificate_document_id uuid REFERENCES public.hr_documents(id) ON DELETE SET NULL,
  verified_at timestamptz,
  nectar_validation_status text,
  nectar_extracted_expires_date date,
  obligation_instance_id uuid
    REFERENCES public.company_obligation_instances(id) ON DELETE SET NULL,
  cancelled_reason text,
  notes text,
  enrolled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enrolled_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevents duplicate active enrollments; allows re-enrollment after verified (renewals)
CREATE UNIQUE INDEX training_enrollments_active_unique
  ON public.training_enrollments (organization_id, product_id, staff_id)
  WHERE status NOT IN ('cancelled','verified');

ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read own enrollments"
  ON public.training_enrollments FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin')
      OR public.is_super_admin(auth.uid()));
CREATE POLICY "org admins update own enrollments"
  ON public.training_enrollments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin')
      OR public.is_super_admin(auth.uid()));
CREATE POLICY "staff read own enrollment"
  ON public.training_enrollments FOR SELECT TO authenticated
  USING (staff_id = auth.uid());
CREATE POLICY "admins and exec insert enrollments"
  ON public.training_enrollments FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
      OR public.has_org_role(organization_id, auth.uid(), 'admin'));

-- Hive exec needs UPDATE too (markTrainingLinkSent, markTrainingCompleted,
-- bulkUpdateEnrollments all run as exec, not org admin).
CREATE POLICY "hive exec update enrollments"
  ON public.training_enrollments FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
