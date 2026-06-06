
-- =============================================================
-- Client Loan feature (admin-only, attestation-gated)
-- =============================================================

-- updated_at helper (reuse existing if present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── org_loan_attestations ─────────────────────────────────────
CREATE TABLE public.org_loan_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attested_by UUID NOT NULL REFERENCES auth.users(id),
  attested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attestation_version TEXT NOT NULL,
  attestation_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_loan_attestations_org ON public.org_loan_attestations(organization_id, attested_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_loan_attestations TO authenticated;
GRANT ALL ON public.org_loan_attestations TO service_role;
ALTER TABLE public.org_loan_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_attest_admin_read" ON public.org_loan_attestations
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'));
CREATE POLICY "loan_attest_admin_write" ON public.org_loan_attestations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));

-- ─── org_loan_settings ─────────────────────────────────────────
CREATE TABLE public.org_loan_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  active_attestation_id UUID REFERENCES public.org_loan_attestations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_loan_settings TO authenticated;
GRANT ALL ON public.org_loan_settings TO service_role;
ALTER TABLE public.org_loan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loan_settings_admin_all" ON public.org_loan_settings
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));

CREATE TRIGGER trg_org_loan_settings_updated_at
  BEFORE UPDATE ON public.org_loan_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── client_loans ──────────────────────────────────────────────
CREATE TABLE public.client_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  agreement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purpose TEXT,
  -- Advance terms (optional)
  advance_amount NUMERIC(12,2),
  advance_cadence TEXT, -- e.g. 'weekly','biweekly','monthly','one-time'
  -- Recurring direct payment terms (optional)
  direct_payment_amount NUMERIC(12,2),
  direct_payment_cadence TEXT,
  direct_payment_due_day TEXT,
  direct_payment_start_date DATE,
  direct_payment_description TEXT,
  -- Interest
  interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  interest_notes TEXT,
  -- Repayment
  repayment_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  maturity_date DATE,
  repayment_method TEXT,
  -- Acknowledgements / signatures
  voluntary_ack BOOLEAN NOT NULL DEFAULT true,
  signature_parties JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_loans_org ON public.client_loans(organization_id);
CREATE INDEX idx_client_loans_client ON public.client_loans(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_loans TO authenticated;
GRANT ALL ON public.client_loans TO service_role;
ALTER TABLE public.client_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_loans_admin_all" ON public.client_loans
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));

CREATE TRIGGER trg_client_loans_updated_at
  BEFORE UPDATE ON public.client_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── client_loan_entries (ledger) ──────────────────────────────
CREATE TABLE public.client_loan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.client_loans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  kind TEXT NOT NULL, -- 'advance' | 'direct_payment' | 'repayment' | 'adjustment'
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_loan_entries_loan ON public.client_loan_entries(loan_id, entry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_loan_entries TO authenticated;
GRANT ALL ON public.client_loan_entries TO service_role;
ALTER TABLE public.client_loan_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_loan_entries_admin_all" ON public.client_loan_entries
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));
