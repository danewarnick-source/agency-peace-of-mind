ALTER TABLE public.hhp_cue_cards
  ADD COLUMN IF NOT EXISTS linked_staff_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hhp_cue_cards_linked_staff_uidx
  ON public.hhp_cue_cards (organization_id, linked_staff_user_id)
  WHERE linked_staff_user_id IS NOT NULL;