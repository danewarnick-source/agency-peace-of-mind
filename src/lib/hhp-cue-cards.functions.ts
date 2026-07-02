/**
 * CRM Phase A4 — HHP (Host Home Provider) Cue Cards.
 *
 * Hosts are NOT staff: they never clock, never appear in scheduling/EVV.
 * Cue cards are the matching input for the Whiteboard/A5 matcher.
 *
 * Sourcing:
 *   - source = 'questionnaire' — auto-inserted by DB trigger when a form
 *     submission lands on a form whose category is 'host_home_questionnaire'.
 *   - source = 'manual' — created from this UI (also used until a
 *     questionnaire form exists in the tenant).
 *
 * Gating:
 *   - read  → view_referrals OR manage_referrals
 *   - write → manage_referrals (provider-input section + status)
 * Staff fully blocked.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireAnyPermission,
} from "@/lib/require-permission";
import type { Json } from "@/integrations/supabase/types";

const orgOnly = z.object({ organization_id: z.string().uuid() });

export const HHP_STATUSES = ["onboarding", "ready", "placed"] as const;
export type HhpStatus = (typeof HHP_STATUSES)[number];

export const HHP_STATUS_LABEL: Record<HhpStatus, string> = {
  onboarding: "Onboarding",
  ready: "Ready",
  placed: "Placed",
};

const CARD_COLS =
  "id, organization_id, name, phone, email, address, location_city, location_county, household_members, pets, wheelchair_accessible, sign_language, criminal_history_flag, experience_summary, behavioral_comfort, communication_abilities, medical_comfort, independence_levels_accepted, schedule_availability, commitment_length, provider_notes, status, source, form_submission_id, linked_staff_user_id, created_at, updated_at";

export type HhpCueCard = {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  location_city: string | null;
  location_county: string | null;
  household_members: Json;
  pets: string | null;
  wheelchair_accessible: boolean;
  sign_language: boolean;
  criminal_history_flag: boolean;
  experience_summary: string | null;
  behavioral_comfort: string | null;
  communication_abilities: string | null;
  medical_comfort: string[];
  independence_levels_accepted: string[];
  schedule_availability: string | null;
  commitment_length: string | null;
  provider_notes: string | null;
  status: HhpStatus;
  source: "questionnaire" | "manual";
  form_submission_id: string | null;
  linked_staff_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export const listHhpCueCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: rows, error } = await supabase
      .from("hhp_cue_cards")
      .select(CARD_COLS)
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as HhpCueCard[];
  });

export const getHhpCueCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: row, error } = await supabase
      .from("hhp_cue_cards")
      .select(CARD_COLS)
      .eq("id", data.id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as HhpCueCard | null;
  });

const cardBase = {
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(400).nullable().optional(),
  location_city: z.string().trim().max(120).nullable().optional(),
  location_county: z.string().trim().max(120).nullable().optional(),
  household_members: z.any().optional(),
  pets: z.string().trim().max(400).nullable().optional(),
  wheelchair_accessible: z.boolean().optional(),
  sign_language: z.boolean().optional(),
  criminal_history_flag: z.boolean().optional(),
  experience_summary: z.string().trim().max(4000).nullable().optional(),
  behavioral_comfort: z.string().trim().max(2000).nullable().optional(),
  communication_abilities: z.string().trim().max(2000).nullable().optional(),
  medical_comfort: z.array(z.string().trim().max(80)).max(30).optional(),
  independence_levels_accepted: z
    .array(z.string().trim().max(20))
    .max(10)
    .optional(),
  schedule_availability: z.string().trim().max(1000).nullable().optional(),
  commitment_length: z.string().trim().max(200).nullable().optional(),
};

const createInput = orgOnly.extend(cardBase);

export const createHhpCueCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "manage_referrals",
      "manage_users",
    ]);
    const { data: row, error } = await supabase
      .from("hhp_cue_cards")
      .insert({
        organization_id: data.organization_id,
        name: data.name,
        phone: data.phone || null,
        email: data.email ? data.email : null,
        address: data.address || null,
        location_city: data.location_city || null,
        location_county: data.location_county || null,
        household_members: data.household_members ?? [],
        pets: data.pets || null,
        wheelchair_accessible: !!data.wheelchair_accessible,
        sign_language: !!data.sign_language,
        criminal_history_flag: !!data.criminal_history_flag,
        experience_summary: data.experience_summary || null,
        behavioral_comfort: data.behavioral_comfort || null,
        communication_abilities: data.communication_abilities || null,
        medical_comfort: data.medical_comfort ?? [],
        independence_levels_accepted: data.independence_levels_accepted ?? [],
        schedule_availability: data.schedule_availability || null,
        commitment_length: data.commitment_length || null,
        source: "manual",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Provider edits questionnaire-derived fields + the provider-input section.
// All fields optional — only supplied keys are written.
const updateInput = orgOnly.extend({
  id: z.string().uuid(),
  provider_notes: z.string().trim().max(8000).nullable().optional(),
  status: z.enum(HHP_STATUSES).optional(),
  linked_staff_user_id: z.string().uuid().nullable().optional(),
  ...cardBase,
}).partial({
  ...Object.fromEntries(Object.keys(cardBase).map((k) => [k, true])),
} as Record<keyof typeof cardBase, true>);

export const updateHhpCueCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "manage_referrals",
      "manage_users",
    ]);

    // Build partial patch — never null-out unset keys
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updated_by: userId };
    const setIf = <K extends string>(k: K, v: unknown) => {
      if (v !== undefined) patch[k] = v;
    };
    setIf("name", data.name);
    setIf("phone", data.phone ?? null);
    setIf("email", data.email ? data.email : data.email === "" ? null : undefined);
    setIf("address", data.address ?? null);
    setIf("location_city", data.location_city ?? null);
    setIf("location_county", data.location_county ?? null);
    setIf("household_members", data.household_members);
    setIf("pets", data.pets ?? null);
    setIf("wheelchair_accessible", data.wheelchair_accessible);
    setIf("sign_language", data.sign_language);
    setIf("criminal_history_flag", data.criminal_history_flag);
    setIf("experience_summary", data.experience_summary ?? null);
    setIf("behavioral_comfort", data.behavioral_comfort ?? null);
    setIf("communication_abilities", data.communication_abilities ?? null);
    setIf("medical_comfort", data.medical_comfort);
    setIf("independence_levels_accepted", data.independence_levels_accepted);
    setIf("schedule_availability", data.schedule_availability ?? null);
    setIf("commitment_length", data.commitment_length ?? null);
    setIf("provider_notes", data.provider_notes ?? null);
    setIf("status", data.status);

    const { error } = await supabase
      .from("hhp_cue_cards")
      .update(patch as never)
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
