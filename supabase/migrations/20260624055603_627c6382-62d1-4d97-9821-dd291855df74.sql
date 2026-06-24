alter table public.client_specific_trainings
  drop constraint if exists client_specific_trainings_training_type_check;
alter table public.client_specific_trainings
  add constraint client_specific_trainings_training_type_check
  check (training_type in ('person_specific','support_strategies','person_centered'));