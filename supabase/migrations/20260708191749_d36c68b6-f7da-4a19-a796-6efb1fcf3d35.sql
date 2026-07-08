
-- Re-tag 21 real HR/staff-checklist requirements as provider_confirmed + hr_staff_checklist scope
UPDATE public.nectar_requirements
SET approval_state = 'provider_confirmed',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('scope', 'hr_staff_checklist')
WHERE id IN (
  -- 17 Master Staff Legal Checklist rows
  'a2a68349-e98a-488d-a42e-b574ea7b4880',
  '860f403c-12ea-4b5a-b945-f7ae0475ee86',
  '7f23fd32-e5f9-4190-add5-2f8cf8587782',
  'e8ebc6df-adef-4e27-9c36-b0e8c4570bad',
  '180a9df2-99d2-4d91-b5d3-8c3ca35c19e4',
  '1404ebf5-40ac-46f9-99e5-eb9be29374d3',
  'dafca597-c245-459a-acd9-847eca181cbf',
  '57bfacb6-5c33-4b68-bd4c-d3dabcb37354',
  'a914c07e-e30f-45e4-bb07-583d1003ca92',
  'aacedee9-0914-46f0-aa5d-52e95356c5cb',
  '3cdb2270-54fd-48e4-8666-68ea6c6b138e',
  '0a5bcfc8-cd10-4f31-b476-707ca3c20c9a',
  '14f4cc7f-7e88-4a16-a4d0-e4510cd563c0',
  'ab933f19-4d8f-4fe5-a1e7-b3e7f7f0632f',
  '56942dbd-5d1c-4cb4-b07c-e398427730cc',
  'cf4cac6b-c2b1-4416-8d40-dc44f07bfaac',
  '076af0c0-1d13-41af-8413-141361b36158',
  -- 4 SOW 2026 §1.8 staff-training rows
  '04b74162-9938-473e-86d3-2bfe563e26e5',
  '045a9a9c-22f7-4f3d-92d2-5106fccb3efe',
  'cce9a5f1-62fa-4891-ab87-1d6ff9bf00ca',
  '01a7e412-bd7e-4526-893c-4fd8aa5803b9'
);

-- Remove the two DEMO seeds
DELETE FROM public.nectar_requirements
WHERE id IN (
  '4ab9f878-02b8-470e-9271-09bc2c6e4ed4',
  '9aebe1aa-eb34-444a-9e03-a70eeee47f86'
);
