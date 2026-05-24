
-- =========================================================
-- PHASE 1: DSPD COMPLIANCE FOUNDATION
-- =========================================================

-- ---------- client_belongings ----------
CREATE TABLE public.client_belongings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  estimated_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  inventoried_on DATE NOT NULL DEFAULT CURRENT_DATE,
  inventoried_by UUID,
  inventoried_by_name TEXT,
  guardian_signature_data_url TEXT,
  signed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','discarded','replaced')),
  discarded_on DATE,
  discard_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_belongings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read belongings" ON public.client_belongings
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write belongings" ON public.client_belongings
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_belongings_discard_sig()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'discarded' AND COALESCE(NEW.estimated_value,0) >= 50
     AND (NEW.guardian_signature_data_url IS NULL OR length(NEW.guardian_signature_data_url) < 20) THEN
    RAISE EXCEPTION 'Items valued $50+ require a guardian signature before being discarded (Section 11.3(5)).';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_belongings_sig
  BEFORE INSERT OR UPDATE ON public.client_belongings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_belongings_discard_sig();

-- ---------- els_usage_ledger ----------
CREATE TABLE public.els_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  service_date DATE NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  shift_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_els_client_date ON public.els_usage_ledger(client_id, service_date);
ALTER TABLE public.els_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read els" ON public.els_usage_ledger
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write els" ON public.els_usage_ledger
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_els_caps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_day_units INTEGER;
  v_year_days INTEGER;
BEGIN
  SELECT COALESCE(SUM(units),0) INTO v_day_units
    FROM public.els_usage_ledger
   WHERE client_id = NEW.client_id
     AND service_date = NEW.service_date
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_day_units + NEW.units) > 24 THEN
    RAISE EXCEPTION 'ELS daily cap exceeded: % units already logged for % (max 24 units = 6 hours per Article 10).',
      v_day_units, NEW.service_date;
  END IF;

  SELECT COUNT(DISTINCT service_date) INTO v_year_days
    FROM public.els_usage_ledger
   WHERE client_id = NEW.client_id
     AND date_trunc('year', service_date) = date_trunc('year', NEW.service_date)
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT EXISTS (
    SELECT 1 FROM public.els_usage_ledger
     WHERE client_id = NEW.client_id
       AND service_date = NEW.service_date
       AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) AND v_year_days >= 260 THEN
    RAISE EXCEPTION 'ELS annual cap reached: 260 service days already logged this calendar year (Article 10 ceiling).';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_els_caps
  BEFORE INSERT OR UPDATE ON public.els_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_els_caps();

-- ---------- respite_stays ----------
CREATE TABLE public.respite_stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  host_home_id UUID NOT NULL,
  respite_client_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_respite_host_dates ON public.respite_stays(host_home_id, start_date);
ALTER TABLE public.respite_stays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read respite" ON public.respite_stays
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write respite" ON public.respite_stays
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_respite_caps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_stay_days INTEGER;
  v_year_days INTEGER;
BEGIN
  v_stay_days := (NEW.end_date - NEW.start_date) + 1;
  IF v_stay_days > 14 THEN
    RAISE EXCEPTION 'Respite stay exceeds 14 consecutive day cap (requested % days).', v_stay_days;
  END IF;

  SELECT COALESCE(SUM((end_date - start_date) + 1),0) INTO v_year_days
    FROM public.respite_stays
   WHERE host_home_id = NEW.host_home_id
     AND date_trunc('year', start_date) = date_trunc('year', NEW.start_date)
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_year_days + v_stay_days) > 21 THEN
    RAISE EXCEPTION 'Host home annual respite ceiling exceeded: % days used + % requested > 21 day cap.',
      v_year_days, v_stay_days;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_respite_caps
  BEFORE INSERT OR UPDATE ON public.respite_stays
  FOR EACH ROW EXECUTE FUNCTION public.enforce_respite_caps();

-- ---------- pba_accounts ----------
CREATE TABLE public.pba_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL UNIQUE,
  opened_on DATE NOT NULL DEFAULT CURRENT_DATE,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  medicaid_threshold NUMERIC(12,2) NOT NULL DEFAULT 2000,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pba_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read pba accts" ON public.pba_accounts
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write pba accts" ON public.pba_accounts
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ---------- pba_transactions ----------
CREATE TABLE public.pba_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.pba_accounts(id) ON DELETE CASCADE,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('deposit','withdrawal','transfer','interest','debt','split_cost')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  memo TEXT,
  receipt_url TEXT,
  counterparty TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pba_tx_account ON public.pba_transactions(account_id, occurred_on DESC);
ALTER TABLE public.pba_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read pba tx" ON public.pba_transactions
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write pba tx" ON public.pba_transactions
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_pba_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount > 50 AND (NEW.receipt_url IS NULL OR length(NEW.receipt_url) < 5) THEN
    RAISE EXCEPTION 'Receipt attachment required for PBA transactions over $50 (Section 1.28).';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pba_receipt
  BEFORE INSERT OR UPDATE ON public.pba_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pba_receipt();

-- Recompute balance after any txn change
CREATE OR REPLACE FUNCTION public.recalc_pba_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_account UUID;
  v_bal NUMERIC(12,2);
BEGIN
  v_account := COALESCE(NEW.account_id, OLD.account_id);
  SELECT COALESCE(SUM(
    CASE txn_type
      WHEN 'deposit' THEN amount
      WHEN 'interest' THEN amount
      WHEN 'transfer' THEN amount
      WHEN 'withdrawal' THEN -amount
      WHEN 'debt' THEN -amount
      WHEN 'split_cost' THEN -amount
      ELSE 0
    END
  ),0) INTO v_bal
  FROM public.pba_transactions WHERE account_id = v_account;

  UPDATE public.pba_accounts
     SET current_balance = v_bal, updated_at = now()
   WHERE id = v_account;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pba_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.pba_transactions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_pba_balance();

-- ---------- pba_audit_samples ----------
CREATE TABLE public.pba_audit_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  quarter DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.pba_accounts(id) ON DELETE CASCADE,
  assigned_auditor UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified')),
  verified_at TIMESTAMPTZ,
  verifier_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quarter, account_id)
);
ALTER TABLE public.pba_audit_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read pba audit" ON public.pba_audit_samples
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write pba audit" ON public.pba_audit_samples
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- Picks ~10% of org's active PBA accounts and queues them for current quarter
CREATE OR REPLACE FUNCTION public.generate_pba_audit_sample(_org UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quarter DATE := date_trunc('quarter', CURRENT_DATE)::date;
  v_total INT;
  v_pick INT;
  v_inserted INT := 0;
BEGIN
  IF NOT (is_org_admin_or_manager(_org, auth.uid()) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total FROM pba_accounts WHERE organization_id = _org;
  v_pick := GREATEST(1, CEIL(v_total * 0.10)::INT);

  WITH picks AS (
    SELECT id FROM pba_accounts
     WHERE organization_id = _org
     ORDER BY random()
     LIMIT v_pick
  )
  INSERT INTO pba_audit_samples (organization_id, quarter, account_id)
  SELECT _org, v_quarter, id FROM picks
  ON CONFLICT (organization_id, quarter, account_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;
