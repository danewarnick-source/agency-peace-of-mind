
CREATE TABLE public.employee_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  borrower_name text NOT NULL,
  borrower_email text,
  lender_name text NOT NULL,
  agreement_date date NOT NULL,
  purpose text,
  advance_amount numeric(12,2),
  advance_cadence text,
  direct_payment_amount numeric(12,2),
  direct_payment_cadence text,
  direct_payment_due_day text,
  direct_payment_start_date date,
  direct_payment_description text,
  interest_rate numeric(6,3) NOT NULL DEFAULT 0,
  interest_notes text,
  repayment_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  maturity_date date,
  repayment_method text,
  voluntary_ack boolean NOT NULL DEFAULT true,
  signature_parties jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_loans_org_idx ON public.employee_loans(organization_id);
CREATE INDEX employee_loans_staff_idx ON public.employee_loans(staff_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_loans TO authenticated;
GRANT ALL ON public.employee_loans TO service_role;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage employee loans"
  ON public.employee_loans FOR ALL
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.employee_loan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('advance','direct_payment','repayment','adjustment')),
  amount numeric(12,2) NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_loan_entries_loan_idx ON public.employee_loan_entries(loan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_loan_entries TO authenticated;
GRANT ALL ON public.employee_loan_entries TO service_role;
ALTER TABLE public.employee_loan_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage employee loan entries"
  ON public.employee_loan_entries FOR ALL
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.employee_loan_signature_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  signer_email text NOT NULL,
  signer_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  agreement_snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_loan_tokens_loan_idx ON public.employee_loan_signature_tokens(loan_id);
CREATE INDEX employee_loan_tokens_hash_idx ON public.employee_loan_signature_tokens(token_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_loan_signature_tokens TO authenticated;
GRANT ALL ON public.employee_loan_signature_tokens TO service_role;
ALTER TABLE public.employee_loan_signature_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage employee loan sig tokens"
  ON public.employee_loan_signature_tokens FOR ALL
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.employee_loan_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.employee_loan_signature_tokens(id) ON DELETE SET NULL,
  signer_type text NOT NULL CHECK (signer_type IN ('employee','org_rep')),
  signer_name text NOT NULL,
  signer_email text,
  signature_image text NOT NULL,
  signature_method text NOT NULL CHECK (signature_method IN ('typed','drawn')),
  signer_ip text,
  signer_user_agent text,
  agreement_snapshot jsonb NOT NULL,
  agreement_sha256 text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_loan_sig_loan_idx ON public.employee_loan_signatures(loan_id);
GRANT SELECT ON public.employee_loan_signatures TO authenticated;
GRANT ALL ON public.employee_loan_signatures TO service_role;
ALTER TABLE public.employee_loan_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view employee loan signatures"
  ON public.employee_loan_signatures FOR SELECT
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER employee_loans_updated_at
BEFORE UPDATE ON public.employee_loans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
