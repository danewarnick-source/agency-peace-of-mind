-- Shift-note attestation: correction + addition.
--
-- 20260811090000_add_compliance_overhaul_columns.sql added
-- nectar_raw_input / nectar_attestation_id to public.general_shifts, on the
-- assumption (per its own comment, sourced from src/hooks/use-general-shift.tsx)
-- that general_shifts was "the shift documentation table." That's wrong for
-- this feature: general_shifts only tracks non-client Training/Admin/Travel/
-- Meeting time (a free-text `note` column, never NECTAR-expanded). The actual
-- shift note that NECTAR expands from shorthand — the one that needs
-- paragraph-level attestation and raw-input preservation — is
-- public.evv_timesheets.shift_note_text, written from src/components/evv/punch-pad.tsx
-- (draftShiftNote in src/lib/ai-coach.functions.ts). This migration adds the
-- same two columns there. The general_shifts columns are left in place
-- (harmless, unused) rather than dropped — additive-only, no destructive
-- changes. See docs/SQL_HANDOFF.md for the runnable handoff version.

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS nectar_raw_input text,
  ADD COLUMN IF NOT EXISTS nectar_attestation_id uuid REFERENCES public.nectar_attestations(id);
