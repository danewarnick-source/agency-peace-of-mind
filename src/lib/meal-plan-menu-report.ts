// Reusable Weekly Meal-Plan Menu report generator + ship-to-file helper.
// Reuses renderMealPlanPdf. No fabrication — empty cells render "—".

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  renderMealPlanPdf,
  mealPlanPdfFilename,
  weekTag,
  type MealPlanPdfPayload,
  type MealPdfMeal,
  type MealPdfShoppingItem,
  type MealSlot,
} from "./client-meal-plan-pdf";
import { mondayOf, weekLabelOf } from "./meal-plan-vs-actual-report";
import { fetchOrgLogo, fetchOrgName, fetchClientIdentity } from "./client-report-shared";

export type MealMenuReportArgs = {
  clientId: string;
  /** Any date within the target week — will be snapped to Monday. */
  weekStart: Date;
  supabaseClient?: SupabaseClient;
};

export type MealMenuReportResult = {
  bytes: Uint8Array;
  filename: string;
  clientId: string;
  clientName: string;
  organizationId: string;
  orgName: string;
  weekStart: Date;
  weekTag: string;
  weekLabel: string;
};

export type ShippedMealMenuReport = MealMenuReportResult & {
  storagePath: string;
  documentId: string;
};

export async function generateMealMenuReport(
  args: MealMenuReportArgs,
): Promise<MealMenuReportResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const weekStart = mondayOf(args.weekStart);
  const weekISO = weekStart.toISOString().slice(0, 10);

  const { clientName, organizationId } = await fetchClientIdentity(sb, args.clientId);

  // Client dietary + allergies
  const { data: dietRow } = await sb
    .from("clients")
    .select("dietary_needs, allergies")
    .eq("id", args.clientId)
    .maybeSingle();
  const diet = dietRow as
    | { dietary_needs: string | null; allergies: string[] | null }
    | null;

  const orgName = await fetchOrgName(sb, organizationId);

  // Nutrition config (macros + optional configurable extra metric)
  const { data: cfgRow } = await sb
    .from("client_nutrition_config")
    .select("nutrition_label, nutrition_unit, extra_label, extra_unit, use_extra_field")
    .eq("client_id", args.clientId)
    .maybeSingle();
  const cfg = (cfgRow as
    | {
        nutrition_label: string | null;
        nutrition_unit: string | null;
        extra_label: string | null;
        extra_unit: string | null;
        use_extra_field: boolean | null;
      }
    | null) ?? {
      nutrition_label: "Fat Grams",
      nutrition_unit: "g",
      extra_label: null,
      extra_unit: null,
      use_extra_field: false,
    };

  // Plan + children
  const { data: planRow } = await sb
    .from("client_meal_plans")
    .select("id, food_likes, foods_to_avoid")
    .eq("client_id", args.clientId)
    .eq("week_start_date", weekISO)
    .maybeSingle();
  const plan = planRow as
    | { id: string; food_likes: string | null; foods_to_avoid: string | null }
    | null;

  let meals: MealPdfMeal[] = [];
  let shopping: MealPdfShoppingItem[] = [];
  if (plan) {
    const [mRes, sRes] = await Promise.all([
      sb
        .from("client_meals")
        .select("day_of_week, meal_slot, label, description, nutrition_value, estimated_cost")
        .eq("meal_plan_id", plan.id),
      sb
        .from("client_shopping_items")
        .select("item, quantity, checked, sort_order")
        .eq("meal_plan_id", plan.id)
        .order("sort_order"),
    ]);
    meals = ((mRes.data ?? []) as Array<{
      day_of_week: number;
      meal_slot: MealSlot;
      label: string;
      description: string | null;
      nutrition_value: number | null;
      estimated_cost: number | null;
    }>).map((m) => ({
      day_of_week: m.day_of_week,
      meal_slot: m.meal_slot,
      label: m.label,
      description: m.description,
      nutrition_value: m.nutrition_value,
      estimated_cost: m.estimated_cost,
    }));
    shopping = ((sRes.data ?? []) as Array<{
      item: string;
      quantity: string | null;
      checked: boolean | null;
    }>).map((s) => ({
      item: s.item,
      quantity: s.quantity ?? null,
      checked: !!s.checked,
    }));
  }

  const weekLabel = weekLabelOf(weekStart);
  const payload: MealPlanPdfPayload = {
    orgName,
    logo: await fetchOrgLogo(sb, organizationId),
    clientName,
    weekLabel,
    nutritionLabel: cfg.nutrition_label ?? "Fat Grams",
    nutritionUnit: cfg.nutrition_unit ?? "g",
    meals,
    shopping,
    foodLikes: plan?.food_likes ?? null,
    foodsToAvoid: plan?.foods_to_avoid ?? null,
    allergies: diet?.allergies ?? null,
    dietaryNeeds: diet?.dietary_needs ?? null,
  };
  const bytes = await renderMealPlanPdf(payload);

  return {
    bytes,
    filename: mealPlanPdfFilename(clientName, weekLabel),
    clientId: args.clientId,
    clientName,
    organizationId,
    orgName,
    weekStart,
    weekTag: weekTag(weekStart),
    weekLabel,
  };
}

export async function shipMealMenuReport(
  args: MealMenuReportArgs,
): Promise<ShippedMealMenuReport> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const report = await generateMealMenuReport({ ...args, supabaseClient: sb });

  const uid = (await sb.auth.getUser()).data.user?.id ?? null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${report.organizationId}/${report.clientId}/meal-plans/meal-plan-menu-${report.weekTag}-${stamp}.pdf`;
  const blob = new Blob([new Uint8Array(report.bytes)], { type: "application/pdf" });

  const { error: upErr } = await sb.storage
    .from("client-documents")
    .upload(storagePath, blob, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw upErr;

  const fileName = `Meal Plan — Weekly Menu ${report.weekLabel}.pdf`;
  const { data: inserted, error: insErr } = await sb
    .from("client_documents")
    .insert({
      client_id: report.clientId,
      organization_id: report.organizationId,
      file_name: fileName,
      document_type: "meal_plan_menu",
      file_url: `storage://client-documents/${storagePath}`,
      storage_path: storagePath,
      file_size_bytes: report.bytes.byteLength,
      uploaded_by: uid,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return {
    ...report,
    storagePath,
    documentId: (inserted as { id: string }).id,
  };
}
