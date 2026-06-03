ALTER TABLE public.provider_ledger_entries
  DROP CONSTRAINT IF EXISTS provider_ledger_entries_category_check;

ALTER TABLE public.provider_ledger_entries
  ADD CONSTRAINT provider_ledger_entries_category_check
  CHECK (category = ANY (ARRAY[
    'expense'::text,
    'payroll_tax'::text,
    'estimated_payroll'::text,
    'received'::text,
    'custom'::text,
    'billed_manual'::text
  ]));