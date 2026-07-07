import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useOrgBranding } from "@/components/branding/org-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Utensils,
  Settings2,
  Check,
  GripVertical,
  
  BookOpen,
  Eye,
  FileText,
  Printer,
  Send,
  CheckCircle2,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  AddRecipeDialog,
  PickRecipeMenu,
  AutoShoppingDialog,
  BudgetFitCard,
  SuggestionsDialog,
  useShoppingLibrary,
  recordShoppingItemUse,
  type Recipe,
} from "./client-meal-recipes";
import {
  renderMealPlanPdf,
  renderPlanVsActualPdf,
  mealPlanPdfFilename,
  planVsActualPdfFilename,
  weekTag,
  type MealPlanLogo,
  type PlanActualRow,
} from "@/lib/client-meal-plan-pdf";
import {
  generatePlanVsActualReport,
  shipPlanVsActualReport,
  rangeLabelOf,
  rangeTagOf,
} from "@/lib/meal-plan-vs-actual-report";




/** 0=Mon..6=Sun (matches the reference sheet). */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Slot = typeof SLOTS[number];

export type MacroField = "calories" | "protein_g" | "carbs_g" | "fat_g" | "extra_value";
export const MACRO_FIELDS: MacroField[] = ["calories", "protein_g", "carbs_g", "fat_g", "extra_value"];

type EstimatedMap = Partial<Record<MacroField, boolean>>;

type MealRow = {
  id: string;
  meal_plan_id: string;
  day_of_week: number;
  meal_slot: Slot;
  label: string;
  description: string | null;
  nutrition_value: number | null; // legacy — no longer written
  notes: string | null;
  sort_order: number;
  recipe_id: string | null;
  estimated_cost: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  extra_value: number | null;
  nutrition_estimated: EstimatedMap | null;
};

type ShoppingItem = {
  id: string;
  meal_plan_id: string;
  item: string;
  quantity: string | null;
  sort_order: number;
  checked: boolean;
};

type NutritionCfg = {
  id: string;
  nutrition_label: string; // legacy — used only for backfill compatibility
  nutrition_unit: string;
  extra_label: string | null;
  extra_unit: string | null;
  use_extra_field: boolean;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  extra_target: number | null;
};

const OUTCOMES = [
  { v: "ate_as_planned", label: "Ate as planned" },
  { v: "swapped_from_another_day", label: "Swapped from another day" },
  { v: "ate_out", label: "Ate out" },
  { v: "changed_entirely", label: "Changed entirely" },
] as const;
type Outcome = typeof OUTCOMES[number]["v"];

type ActualRow = {
  id: string;
  meal_plan_id: string;
  actual_date: string;
  meal_slot: Slot;
  outcome: Outcome;
  note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
};

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - dow);
  return x;
}
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ClientMealPlannerPanel({
  clientId,
  readOnly: forcedReadOnly = false,
}: {
  clientId: string;
  readOnly?: boolean;
}) {
  const { session } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const canEdit =
    !forcedReadOnly &&
    (org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin");
  // Staff (any org member) may record daily actuals even in read-only-plan mode.
  const canRecordActuals = !!org?.role;
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(mondayOf(new Date()));
  const weekISO = fmtISO(weekStart);

  // Client dietary fields (needs_shopping_help no longer read — activation
  // now lives in client_meal_support, gated by MealSupportGate above.)
  const clientQ = useQuery({
    enabled: !!clientId,
    queryKey: ["mp-client-diet", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("first_name, last_name, dietary_needs, allergies, meal_actuals_assignee, team_id")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        first_name: string | null;
        last_name: string | null;
        dietary_needs: string | null;
        allergies: string[] | null;
        meal_actuals_assignee: string | null;
        team_id: string | null;
      } | null;
    },
  });
  const clientName = useMemo(() => {
    const c = clientQ.data;
    return [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || "Client";
  }, [clientQ.data]);


  // Org branding logo — loaded once and reused for PDF headers.
  const { data: branding } = useOrgBranding(orgId);
  const [logoState, setLogoState] = useState<MealPlanLogo | null>(null);
  useEffect(() => {
    let cancelled = false;
    const path = branding?.logo_path;
    if (!path) { setLogoState(null); return; }
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from("org-branding")
          .createSignedUrl(path, 60 * 10);
        if (error || !data?.signedUrl) throw error ?? new Error("no signed url");
        const resp = await fetch(data.signedUrl);
        if (!resp.ok) throw new Error("logo fetch failed");
        const mime = resp.headers.get("content-type") || (path.endsWith(".png") ? "image/png" : "image/jpeg");
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (!cancelled) setLogoState({ bytes: buf, mime });
      } catch {
        if (!cancelled) setLogoState(null);
      }
    })();
    return () => { cancelled = true; };
  }, [branding?.logo_path]);


  // Staff pool for the standing meal-actuals assignee selector (manager only).
  const staffQ = useQuery({
    enabled: !!orgId && canEdit,
    queryKey: ["mp-org-staff", orgId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      const ids = (members ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((x): x is string => !!x);
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name")
        .in("id", ids);
      return ((profs ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; full_name: string | null;
      }>)
        .map((p) => ({
          id: p.id,
          name:
            (p.full_name?.trim()) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // toggleNeedsHelp removed — activation now via client_meal_support.



  const setAssignee = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase
        .from("clients")
        .update({ meal_actuals_assignee: userId })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-client-diet", clientId] }),
    onError: (e: Error) => toast.error(e.message),
  });


  // Nutrition config — full macro model + optional configurable extra field
  const cfgQ = useQuery({
    enabled: !!clientId && !!orgId,
    queryKey: ["mp-nutrition-cfg", clientId],
    queryFn: async (): Promise<NutritionCfg> => {
      const { data, error } = await supabase
        .from("client_nutrition_config")
        .select(
          "id, nutrition_label, nutrition_unit, extra_label, extra_unit, use_extra_field, " +
            "calorie_target, protein_target_g, carbs_target_g, fat_target_g, extra_target",
        )
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (
        (data as NutritionCfg | null) ?? {
          id: "",
          nutrition_label: "Fat Grams",
          nutrition_unit: "g",
          extra_label: null,
          extra_unit: null,
          use_extra_field: false,
          calorie_target: null,
          protein_target_g: null,
          carbs_target_g: null,
          fat_target_g: null,
          extra_target: null,
        }
      );
    },
  });

  // Plan for this week
  const planQ = useQuery({
    enabled: !!clientId && !!orgId,
    queryKey: ["mp-plan", clientId, weekISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meal_plans")
        .select("id, food_likes, foods_to_avoid, notes")
        .eq("client_id", clientId)
        .eq("week_start_date", weekISO)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const planId = planQ.data?.id ?? null;

  const mealsQ = useQuery({
    enabled: !!planId,
    queryKey: ["mp-meals", planId],
    queryFn: async (): Promise<MealRow[]> => {
      const { data, error } = await supabase
        .from("client_meals")
        .select("*")
        .eq("meal_plan_id", planId!)
        .order("day_of_week")
        .order("meal_slot")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as MealRow[];
    },
  });

  const shopQ = useQuery({
    enabled: !!planId,
    queryKey: ["mp-shop", planId],
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await supabase
        .from("client_shopping_items")
        .select("*")
        .eq("meal_plan_id", planId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ShoppingItem[];
    },
  });

  const createPlan = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const { data, error } = await supabase
        .from("client_meal_plans")
        .insert({ organization_id: orgId, client_id: clientId, week_start_date: weekISO })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-plan", clientId, weekISO] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addMeal = useMutation({
    mutationFn: async ({
      day,
      slot,
      recipe,
    }: {
      day: number;
      slot: Slot;
      recipe?: Recipe | null;
    }) => {
      let pid = planId;
      if (!pid) {
        const created = await createPlan.mutateAsync();
        pid = created.id;
      }
      const existing = (mealsQ.data ?? []).filter(
        (m) => m.day_of_week === day && m.meal_slot === slot,
      );
      const { error } = await supabase.from("client_meals").insert({
        meal_plan_id: pid,
        day_of_week: day,
        meal_slot: slot,
        label: recipe?.name ?? "",
        recipe_id: recipe?.id ?? null,
        sort_order: existing.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-meals", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMeal = useMutation({
    mutationFn: async (patch: Partial<MealRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("client_meals").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-meals", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_meals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-meals", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addShop = useMutation({
    mutationFn: async () => {
      let pid = planId;
      if (!pid) {
        const created = await createPlan.mutateAsync();
        pid = created.id;
      }
      const { error } = await supabase.from("client_shopping_items").insert({
        meal_plan_id: pid,
        item: "",
        sort_order: (shopQ.data ?? []).length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-shop", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const updateShop = useMutation({
    mutationFn: async (patch: Partial<ShoppingItem> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("client_shopping_items").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-shop", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteShop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_shopping_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-shop", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const savePlanMeta = useMutation({
    mutationFn: async (patch: { food_likes?: string; foods_to_avoid?: string; notes?: string }) => {
      let pid = planId;
      if (!pid) {
        const created = await createPlan.mutateAsync();
        pid = created.id;
      }
      const { error } = await supabase.from("client_meal_plans").update(patch).eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-plan", clientId, weekISO] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCfg = useMutation({
    mutationFn: async (patch: Partial<NutritionCfg>) => {
      if (!orgId) throw new Error("No organization");
      if (cfgQ.data?.id) {
        const { error } = await supabase
          .from("client_nutrition_config")
          .update(patch)
          .eq("id", cfgQ.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_nutrition_config").insert({
          organization_id: orgId,
          client_id: clientId,
          nutrition_label: "Fat Grams",
          nutrition_unit: "g",
          ...patch,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-nutrition-cfg", clientId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Actuals (staff daily confirmation)
  const actualsQ = useQuery({
    enabled: !!planId,
    queryKey: ["mp-actuals", planId],
    queryFn: async (): Promise<ActualRow[]> => {
      const { data, error } = await supabase
        .from("client_meal_actuals")
        .select("id, meal_plan_id, actual_date, meal_slot, outcome, note, confirmed_by, confirmed_at")
        .eq("meal_plan_id", planId!);
      if (error) throw error;
      return (data ?? []) as ActualRow[];
    },
  });

  const setActual = useMutation({
    mutationFn: async (args: { date: string; slot: Slot; outcome: Outcome; note?: string | null }) => {
      let pid = planId;
      if (!pid) {
        const created = await createPlan.mutateAsync();
        pid = created.id;
      }
      const existing = (actualsQ.data ?? []).find(
        (a) => a.actual_date === args.date && a.meal_slot === args.slot,
      );
      if (existing) {
        const { error } = await supabase
          .from("client_meal_actuals")
          .update({
            outcome: args.outcome,
            note: args.note ?? existing.note,
            confirmed_by: session?.user?.id ?? null,
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_meal_actuals").insert({
          meal_plan_id: pid,
          actual_date: args.date,
          meal_slot: args.slot,
          outcome: args.outcome,
          note: args.note ?? null,
          confirmed_by: session?.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-actuals", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Drag-drop: reassign meal's day_of_week + meal_slot. Shopping list is untouched.
  const moveMeal = useMutation({
    mutationFn: async (args: { id: string; day: number; slot: Slot }) => {
      const existing = (mealsQ.data ?? []).filter(
        (m) => m.day_of_week === args.day && m.meal_slot === args.slot,
      );
      const { error } = await supabase
        .from("client_meals")
        .update({
          day_of_week: args.day,
          meal_slot: args.slot,
          sort_order: existing.length,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-meals", planId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || !canEdit) return;
    const mealId = String(e.active.id);
    const overId = String(e.over.id);
    const m = /^cell:(\d+):(breakfast|lunch|dinner|snack)$/.exec(overId);
    if (!m) return;
    const day = Number(m[1]);
    const slot = m[2] as Slot;
    const src = (mealsQ.data ?? []).find((x) => x.id === mealId);
    if (!src || (src.day_of_week === day && src.meal_slot === slot)) return;
    moveMeal.mutate({ id: mealId, day, slot });
  };

  const cfg: NutritionCfg =
    cfgQ.data ?? {
      id: "",
      nutrition_label: "Fat Grams",
      nutrition_unit: "g",
      extra_label: null,
      extra_unit: null,
      use_extra_field: false,
      calorie_target: null,
      protein_target_g: null,
      carbs_target_g: null,
      fat_target_g: null,
      extra_target: null,
    };
  const meals = mealsQ.data ?? [];
  const cellMeals = (day: number, slot: Slot) =>
    meals.filter((m) => m.day_of_week === day && m.meal_slot === slot);
  const dayTotals = (day: number) => {
    const dayMeals = meals.filter((m) => m.day_of_week === day);
    const sum = (f: MacroField) =>
      dayMeals.reduce((s, m) => s + (Number(m[f]) || 0), 0);
    const anyEst = (f: MacroField) =>
      dayMeals.some((m) => Number(m[f]) > 0 && m.nutrition_estimated?.[f]);
    return {
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      extra_value: sum("extra_value"),
      estCalories: anyEst("calories"),
      estMacros: anyEst("protein_g") || anyEst("carbs_g") || anyEst("fat_g"),
      estExtra: anyEst("extra_value"),
    };
  };
  const plannedCostTotal = useMemo(
    () => meals.reduce((s, m) => s + (Number(m.estimated_cost) || 0), 0),
    [meals],
  );
  const recipeIdsInPlan = useMemo(
    () => Array.from(new Set(meals.map((m) => m.recipe_id).filter((x): x is string => !!x))),
    [meals],
  );
  const shopLibQ = useShoppingLibrary(orgId);
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    return `${shortDate(weekStart)} – ${shortDate(end)}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Utensils className="h-5 w-5 text-primary" />
          <CardTitle>Meal Planner</CardTitle>
          {!canEdit && <Badge variant="secondary">Read only</Badge>}
          {/* Legacy shopping-help badge removed; activation status is shown
              by the MealSupportGate banner above the panel (when applicable). */}

        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center text-sm font-medium">{weekLabel}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
            This week
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Meal Plan output actions — Preview / Download / Print / Ship to file */}
        {canEdit && orgId && (
          <MealPlanOutputCard
            clientId={clientId}
            organizationId={orgId}
            clientName={clientName}
            weekStart={weekStart}
            weekLabel={weekLabel}
            orgName={org?.organization_name ?? ""}
            logo={logoState}
            meals={meals}
            shopping={shopQ.data ?? []}
            nutritionLabel={cfg.nutrition_label}
            nutritionUnit={cfg.nutrition_unit}
            foodLikes={planQ.data?.food_likes ?? null}
            foodsToAvoid={planQ.data?.foods_to_avoid ?? null}
            allergies={clientQ.data?.allergies ?? null}
            dietaryNeeds={clientQ.data?.dietary_needs ?? null}
          />
        )}

        {/* Pass 3 toolbar: recipes, auto-shopping, budget-fit, NECTAR suggestions */}

        {canEdit && orgId && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
            <AddRecipeDialog orgId={orgId} clientId={clientId} />
            {planId && (
              <AutoShoppingDialog
                orgId={orgId}
                planId={planId}
                recipeIdsInPlan={recipeIdsInPlan}
              />
            )}
            <SuggestionsDialog
              meals={meals.map((m) => ({
                day: DAYS[m.day_of_week],
                slot: m.meal_slot,
                label: m.label,
                estimated_cost: m.estimated_cost,
              }))}
              dietaryNeeds={clientQ.data?.dietary_needs ?? null}
              allergies={clientQ.data?.allergies ?? null}
              foodsToAvoid={planQ.data?.foods_to_avoid ?? null}
              budgetRemaining={null}
            />
            <div className="ml-auto text-[11px] text-muted-foreground">
              Recipes are org-scoped and reusable across cells; meal moves never change the shopping list.
            </div>
          </div>
        )}

        {/* Nutrition config — extra custom metric + optional daily targets */}
        <NutritionConfigCard cfg={cfg} canEdit={canEdit} onSave={(patch) => saveCfg.mutate(patch)} />

        {/* Legacy "needs shopping help" toggle removed — meal support is now
            gated by the per-client activation model (client_meal_support). */}


        {/* Weekly grid — drag meal pills between cells (manager only) */}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-32 border-b border-r bg-background px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Day
                </th>
                {SLOTS.map((s) => (
                  <th
                    key={s}
                    className="border-b bg-background px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {s}
                  </th>
                ))}
                <th className="border-b bg-background px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Daily nutrition
                </th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((dayName, i) => (
                <tr key={dayName} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-r bg-background px-3 py-2">
                    <div className="text-sm font-semibold">{dayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {shortDate(addDays(weekStart, i))}
                    </div>
                  </td>
                  {SLOTS.map((slot) => {
                    const entries = cellMeals(i, slot);
                    return (
                      <td key={slot} className="border-b px-2 py-2">
                        <MealCell
                          day={i}
                          slot={slot}
                          entries={entries}
                          cfg={cfg}
                          canEdit={canEdit}
                          orgId={orgId ?? ""}
                          clientId={clientId}
                          onAdd={() => addMeal.mutate({ day: i, slot })}
                          onAddFromRecipe={(r) => addMeal.mutate({ day: i, slot, recipe: r })}
                          onChange={(id, patch) => updateMeal.mutate({ id, ...patch })}
                          onDelete={(id) => deleteMeal.mutate(id)}
                        />
                      </td>
                    );
                  })}
                  <td className="border-b px-3 py-2 text-right align-top">
                    <DayTotalsCell totals={dayTotals(i)} cfg={cfg} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </DndContext>

        {/* Budget fit — pulls from client_budgets food/grocery lines */}
        <BudgetFitCard
          clientId={clientId}
          weekStart={weekStart}
          plannedTotal={plannedCostTotal}
        />


        {/* Actuals — staff record on their view; manager sees the standing assignee
            selector + generates a Plan vs. Actual report (moved out of the panel). */}
        {planId && canEdit && (
          <>
            <ActualsAssigneeCard
              value={clientQ.data?.meal_actuals_assignee ?? null}
              staff={staffQ.data ?? []}
              onChange={(id) => setAssignee.mutate(id)}
            />
            <PlanVsActualReportsSection
              clientId={clientId}
              organizationId={orgId ?? ""}
              clientName={clientName}
              currentWeekStart={weekStart}
              logo={logoState}
            />

          </>
        )}
        {planId && !canEdit && canRecordActuals && (
          <ActualsToday
            planId={planId}
            actuals={actualsQ.data ?? []}
            meals={meals}
            onSet={(slot, outcome, note) =>
              setActual.mutate({ date: fmtISO(new Date()), slot, outcome, note })
            }
          />
        )}


        {/* Food preferences & allergies */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Foods enjoyed</h4>
            </div>
            <Textarea
              defaultValue={planQ.data?.food_likes ?? ""}
              disabled={!canEdit}
              placeholder="Foods this client likes — used to inform planning"
              rows={3}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (planQ.data?.food_likes ?? ""))
                  savePlanMeta.mutate({ food_likes: v });
              }}
            />
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Foods to avoid & allergies</h4>
              {clientQ.data?.allergies && clientQ.data.allergies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {clientQ.data.allergies.map((a: string) => (
                    <Badge key={a} variant="destructive" className="text-[10px]">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {clientQ.data?.dietary_needs && (
              <div className="mb-2 rounded bg-muted/50 p-2 text-xs">
                <span className="font-medium">Dietary needs from profile:</span>{" "}
                {clientQ.data.dietary_needs}
              </div>
            )}
            <Textarea
              defaultValue={planQ.data?.foods_to_avoid ?? ""}
              disabled={!canEdit}
              placeholder="Foods to avoid this week — restrictions, dislikes"
              rows={3}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (planQ.data?.foods_to_avoid ?? ""))
                  savePlanMeta.mutate({ foods_to_avoid: v });
              }}
            />
          </div>
        </div>

        {/* Shopping list */}
        <div className="rounded-md border">
          <datalist id={`shop-lib-${orgId ?? "none"}`}>
            {(shopLibQ.data ?? []).map((it) => (
              <option key={it} value={it} />
            ))}
          </datalist>
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <h4 className="text-sm font-semibold">Shopping List</h4>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => addShop.mutate()}>
                <Plus className="mr-1 h-3 w-3" /> Add item
              </Button>
            )}
          </div>
          <div className="divide-y">
            <div className="grid grid-cols-[32px_1fr_140px_40px] items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <div />
              <div>Item</div>
              <div>Quantity</div>
              <div />
            </div>
            {(shopQ.data ?? []).map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[32px_1fr_140px_40px] items-center gap-2 px-3 py-1.5"
              >
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => updateShop.mutate({ id: s.id, checked: !s.checked })}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    s.checked ? "bg-primary text-primary-foreground" : "bg-background"
                  }`}
                  aria-label="Toggle checked"
                >
                  {s.checked && <Check className="h-3 w-3" />}
                </button>
                <Input
                  defaultValue={s.item}
                  disabled={!canEdit}
                  list={`shop-lib-${orgId ?? "none"}`}
                  className={`h-8 ${s.checked ? "line-through text-muted-foreground" : ""}`}
                  onBlur={(e) => {
                    if (e.target.value !== s.item) {
                      updateShop.mutate({ id: s.id, item: e.target.value });
                      if (orgId) recordShoppingItemUse(orgId, e.target.value);
                    }
                  }}
                />

                <Input
                  defaultValue={s.quantity ?? ""}
                  disabled={!canEdit}
                  className="h-8"
                  placeholder="1 lb, 2 cans…"
                  onBlur={(e) => {
                    if (e.target.value !== (s.quantity ?? ""))
                      updateShop.mutate({ id: s.id, quantity: e.target.value });
                  }}
                />
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => deleteShop.mutate(s.id)}
                    aria-label="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            ))}
            {(shopQ.data ?? []).length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No shopping items yet.
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Managers: drag meal pills between cells to reschedule (shopping list stays put — only recipe
          changes drive it). Add recipes from the toolbar; auto-populate shopping from recipes on the
          plan; NECTAR suggests healthier/cheaper swaps but never overrides your call. Prices and
          ingredients are never invented.
        </p>
      </CardContent>
    </Card>
  );
}

function MealCell({
  day,
  slot,
  entries,
  cfg,
  canEdit,
  orgId,
  clientId,
  onAdd,
  onAddFromRecipe,
  onChange,
  onDelete,
}: {
  day: number;
  slot: Slot;
  entries: MealRow[];
  cfg: NutritionCfg;
  canEdit: boolean;
  orgId: string;
  clientId: string;
  onAdd: () => void;
  onAddFromRecipe: (r: Recipe) => void;
  onChange: (id: string, patch: Partial<MealRow>) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${day}:${slot}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[60px] flex-col gap-1.5 rounded-md p-1 transition-colors ${
        isOver ? "bg-primary/10 ring-2 ring-primary/40" : ""
      }`}
    >
      {entries.map((m) => (
        <MealPill
          key={m.id}
          meal={m}
          cfg={cfg}
          canEdit={canEdit}
          onChange={(patch) => onChange(m.id, patch)}
          onDelete={() => onDelete(m.id)}
        />
      ))}
      {canEdit && (
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 justify-start px-2 text-xs text-muted-foreground"
            onClick={onAdd}
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
          {orgId && (
            <PickRecipeMenu orgId={orgId} clientId={clientId} onPick={onAddFromRecipe} />
          )}
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function MacroInput({
  field,
  label,
  unit,
  meal,
  canEdit,
  onChange,
  step = "0.1",
}: {
  field: MacroField;
  label: string;
  unit: string;
  meal: MealRow;
  canEdit: boolean;
  onChange: (patch: Partial<MealRow>) => void;
  step?: string;
}) {
  const val = meal[field] as number | null;
  const est = !!meal.nutrition_estimated?.[field];
  return (
    <div className="flex flex-col">
      <label className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {est && val !== null && (
          <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            est
          </span>
        )}
      </label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step={step}
          defaultValue={val ?? ""}
          disabled={!canEdit}
          placeholder="—"
          className={`h-7 w-20 px-1 text-xs tabular-nums ${
            est && val !== null ? "italic text-muted-foreground" : ""
          }`}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== val) {
              // Manager-entered → mark as verified (drop the estimate flag).
              const nextEst = { ...(meal.nutrition_estimated ?? {}) };
              delete nextEst[field];
              onChange({
                [field]: v,
                nutrition_estimated: nextEst,
              } as Partial<MealRow>);
            }
          }}
        />
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function MealPill({
  meal,
  cfg,
  canEdit,
  onChange,
  onDelete,
}: {
  meal: MealRow;
  cfg: NutritionCfg;
  canEdit: boolean;
  onChange: (patch: Partial<MealRow>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: meal.id,
    disabled: !canEdit,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  const anyEstimate = MACRO_FIELDS.some((f) => meal.nutrition_estimated?.[f]);
  const summary = (() => {
    const parts: string[] = [];
    if (meal.calories !== null) parts.push(`${fmtNum(meal.calories)} kcal`);
    if (meal.protein_g !== null || meal.carbs_g !== null || meal.fat_g !== null) {
      parts.push(
        `P${fmtNum(meal.protein_g)}/C${fmtNum(meal.carbs_g)}/F${fmtNum(meal.fat_g)}`,
      );
    }
    return parts.join(" · ");
  })();

  const runEstimate = async () => {
    if (!canEdit || estimating) return;
    if (!meal.label && !meal.description) {
      toast.info("Add a meal name first so NECTAR can estimate.");
      return;
    }
    setEstimating(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimate-meal-nutrition", {
        body: {
          label: meal.label,
          description: meal.description ?? "",
        },
      });
      if (error) throw error;
      const est = (data as { estimates?: Partial<Record<MacroField, number | null>> })
        ?.estimates ?? {};
      const patch: Partial<MealRow> = {};
      const nextEst: EstimatedMap = { ...(meal.nutrition_estimated ?? {}) };
      (["calories", "protein_g", "carbs_g", "fat_g"] as MacroField[]).forEach((f) => {
        // Only fill fields that are currently blank OR already flagged estimate;
        // never overwrite a manager-verified value.
        const currentVerified =
          (meal[f] as number | null) !== null && !meal.nutrition_estimated?.[f];
        const v = est[f];
        if (currentVerified) return;
        if (v === null || v === undefined) return;
        patch[f] = Number(v);
        nextEst[f] = true;
      });
      if (Object.keys(patch).length === 0) {
        toast.info("NECTAR couldn't confidently estimate — leaving values blank.");
      } else {
        patch.nutrition_estimated = nextEst;
        onChange(patch);
        toast.success("NECTAR estimate applied (marked as estimate).");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Estimate unavailable");
    } finally {
      setEstimating(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-md border bg-card p-1.5 shadow-sm ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label="Drag meal"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        <Input
          defaultValue={meal.label}
          disabled={!canEdit}
          placeholder="Meal…"
          className="h-7 flex-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-1"
          onBlur={(e) => {
            if (e.target.value !== meal.label) onChange({ label: e.target.value });
          }}
        />
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={onDelete}
            aria-label="Delete meal"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Compact one-line macro summary + cost */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="mt-0.5 flex w-full flex-wrap items-center gap-1 px-1 text-left text-[10px] text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">
          {summary || <span className="italic">No macros yet</span>}
        </span>
        {anyEstimate && (
          <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            est
          </span>
        )}
        {meal.estimated_cost !== null && meal.estimated_cost !== undefined && (
          <span className="ml-auto">${Number(meal.estimated_cost).toFixed(2)}</span>
        )}
        {meal.recipe_id && (
          <span title="From recipe" className="inline-flex items-center gap-0.5 text-primary">
            <BookOpen className="h-2.5 w-2.5" />
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-1 space-y-2 rounded-md border bg-muted/20 p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MacroInput field="calories" label="Calories" unit="kcal" meal={meal} canEdit={canEdit} onChange={onChange} step="1" />
            <MacroInput field="protein_g" label="Protein" unit="g" meal={meal} canEdit={canEdit} onChange={onChange} />
            <MacroInput field="carbs_g" label="Carbs" unit="g" meal={meal} canEdit={canEdit} onChange={onChange} />
            <MacroInput field="fat_g" label="Fat" unit="g" meal={meal} canEdit={canEdit} onChange={onChange} />
          </div>
          {cfg.use_extra_field && cfg.extra_label && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MacroInput
                field="extra_value"
                label={cfg.extra_label}
                unit={cfg.extra_unit ?? ""}
                meal={meal}
                canEdit={canEdit}
                onChange={onChange}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Est. cost</span>
            <span className="text-[10px] text-muted-foreground">$</span>
            <Input
              type="number"
              step="0.01"
              defaultValue={meal.estimated_cost ?? ""}
              disabled={!canEdit}
              placeholder="cost"
              className="h-7 w-20 px-1 text-xs tabular-nums"
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== meal.estimated_cost) onChange({ estimated_cost: v });
              }}
            />
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={runEstimate}
                disabled={estimating}
                title="NECTAR estimates fill blank fields only; verified values are never overwritten."
              >
                {estimating ? "Estimating…" : "Estimate with NECTAR"}
              </Button>
            )}
          </div>
          <Textarea
            defaultValue={meal.description ?? ""}
            disabled={!canEdit}
            placeholder="Notes / description — informs NECTAR estimates"
            rows={2}
            className="min-h-0 text-xs"
            onBlur={(e) => {
              if (e.target.value !== (meal.description ?? ""))
                onChange({ description: e.target.value });
            }}
          />
          <p className="text-[10px] italic text-muted-foreground">
            NECTAR values are estimates, not verified. Type over any number to mark it as manager-entered.
          </p>
        </div>
      )}
    </div>
  );
}

function DayTotalsCell({
  totals,
  cfg,
}: {
  totals: {
    calories: number; protein_g: number; carbs_g: number; fat_g: number; extra_value: number;
    estCalories: boolean; estMacros: boolean; estExtra: boolean;
  };
  cfg: NutritionCfg;
}) {
  const pct = (n: number, target: number | null) =>
    target && target > 0 ? Math.round((n / target) * 100) : null;
  const calPct = pct(totals.calories, cfg.calorie_target);
  return (
    <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
      <div className="flex items-center gap-1">
        <span className="font-semibold">{fmtNum(totals.calories)}</span>
        <span className="text-[10px] font-normal text-muted-foreground">kcal</span>
        {cfg.calorie_target ? (
          <span className="text-[10px] text-muted-foreground">/ {cfg.calorie_target}{calPct !== null ? ` (${calPct}%)` : ""}</span>
        ) : null}
        {totals.estCalories && (
          <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">est</span>
        )}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>P {fmtNum(totals.protein_g)}g</span>
        <span>·</span>
        <span>C {fmtNum(totals.carbs_g)}g</span>
        <span>·</span>
        <span>F {fmtNum(totals.fat_g)}g</span>
        {totals.estMacros && (
          <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">est</span>
        )}
      </div>
      {cfg.use_extra_field && cfg.extra_label && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{cfg.extra_label}: {fmtNum(totals.extra_value, 1)}{cfg.extra_unit ? ` ${cfg.extra_unit}` : ""}</span>
          {cfg.extra_target ? <span>/ {cfg.extra_target}</span> : null}
          {totals.estExtra && (
            <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">est</span>
          )}
        </div>
      )}
    </div>
  );
}

function NutritionConfigCard({
  cfg,
  canEdit,
  onSave,
}: {
  cfg: NutritionCfg;
  canEdit: boolean;
  onSave: (patch: Partial<NutritionCfg>) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Nutrition tracking</h4>
        <span className="text-[10px] text-muted-foreground">
          Calories + protein/carbs/fat are always tracked. Add one custom metric per client.
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Calorie target (kcal/day)</label>
          <Input
            type="number"
            defaultValue={cfg.calorie_target ?? ""}
            disabled={!canEdit}
            placeholder="optional"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== cfg.calorie_target) onSave({ calorie_target: v });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Protein target (g)</label>
          <Input
            type="number"
            defaultValue={cfg.protein_target_g ?? ""}
            disabled={!canEdit}
            placeholder="optional"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== cfg.protein_target_g) onSave({ protein_target_g: v });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Carbs target (g)</label>
          <Input
            type="number"
            defaultValue={cfg.carbs_target_g ?? ""}
            disabled={!canEdit}
            placeholder="optional"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== cfg.carbs_target_g) onSave({ carbs_target_g: v });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Fat target (g)</label>
          <Input
            type="number"
            defaultValue={cfg.fat_target_g ?? ""}
            disabled={!canEdit}
            placeholder="optional"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== cfg.fat_target_g) onSave({ fat_target_g: v });
            }}
          />
        </div>
      </div>
      <div className="mt-3 rounded border bg-background p-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={cfg.use_extra_field}
            onChange={(e) => onSave({ use_extra_field: e.target.checked })}
          />
          Track a custom metric for this client (e.g. Blood Sugar, Sodium, Fiber)
        </label>
        {cfg.use_extra_field && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Label</label>
              <Input
                defaultValue={cfg.extra_label ?? ""}
                disabled={!canEdit}
                placeholder="e.g. Blood Sugar"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== cfg.extra_label) onSave({ extra_label: v });
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Unit</label>
              <Input
                defaultValue={cfg.extra_unit ?? ""}
                disabled={!canEdit}
                placeholder="mg/dL, mg, g…"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== cfg.extra_unit) onSave({ extra_unit: v });
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Daily target (optional)</label>
              <Input
                type="number"
                defaultValue={cfg.extra_target ?? ""}
                disabled={!canEdit}
                placeholder="optional"
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== cfg.extra_target) onSave({ extra_target: v });
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActualsToday({
  actuals,
  meals,
  onSet,
}: {
  planId: string;
  actuals: ActualRow[];
  meals: MealRow[];
  onSet: (slot: Slot, outcome: Outcome, note: string | null) => void;
}) {
  const today = new Date();
  const todayISO = fmtISO(today);
  const dow = (today.getDay() + 6) % 7; // 0=Mon
  const plannedFor = (slot: Slot) =>
    meals.filter((m) => m.day_of_week === dow && m.meal_slot === slot);
  const actualFor = (slot: Slot) =>
    actuals.find((a) => a.actual_date === todayISO && a.meal_slot === slot);

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-semibold">
          What did they actually eat? — {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </h4>
        <Badge variant="outline" className="text-[10px]">Staff confirmation</Badge>
      </div>
      <div className="divide-y">
        {SLOTS.map((slot) => {
          const planned = plannedFor(slot);
          const actual = actualFor(slot);
          return (
            <div key={slot} className="grid grid-cols-1 gap-2 px-3 py-2 md:grid-cols-[120px_1fr_1fr_1.2fr]">
              <div className="text-sm font-semibold capitalize">{slot}</div>
              <div className="text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Planned</div>
                {planned.length === 0 ? (
                  <span>—</span>
                ) : (
                  planned.map((p) => p.label || "(unnamed)").join(", ")
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {OUTCOMES.map((o) => {
                  const active = actual?.outcome === o.v;
                  return (
                    <Button
                      key={o.v}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => onSet(slot, o.v, actual?.note ?? null)}
                    >
                      {o.label}
                    </Button>
                  );
                })}
              </div>
              <Input
                defaultValue={actual?.note ?? ""}
                placeholder="Note (e.g. swapped Tuesdays lunch, went to McDonalds)"
                className="h-8 text-xs"
                onBlur={(e) => {
                  const note = e.target.value;
                  if (note !== (actual?.note ?? "")) {
                    onSet(slot, actual?.outcome ?? "ate_as_planned", note || null);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActualsAssigneeCard({
  value,
  staff,
  onChange,
}: {
  value: string | null;
  staff: { id: string; name: string }[];
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-sm font-semibold">Meal-actuals assignee</h4>
        <Badge variant="outline" className="text-[10px]">Optional</Badge>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Standing staff who can always record what was eaten. On-shift staff and the
        assigned/respite host can record actuals too.
      </p>
      <select
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— No standing assignee —</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Meal Plan output card — Preview / Download / Print / Ship to file
// (weekly menu PDF). Manager-only. Matches budget/chore-chart pattern.
// ═══════════════════════════════════════════════════════════════════════════
function MealPlanOutputCard({
  clientId,
  organizationId,
  clientName,
  weekStart,
  weekLabel,
  orgName,
  logo,
  meals,
  shopping,
  nutritionLabel,
  nutritionUnit,
  foodLikes,
  foodsToAvoid,
  allergies,
  dietaryNeeds,
}: {
  clientId: string;
  organizationId: string;
  clientName: string;
  weekStart: Date;
  weekLabel: string;
  orgName: string;
  logo: MealPlanLogo | null;
  meals: MealRow[];
  shopping: ShoppingItem[];
  nutritionLabel: string;
  nutritionUnit: string;
  foodLikes: string | null;
  foodsToAvoid: string | null;
  allergies: string[] | null;
  dietaryNeeds: string | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "preview" | "download" | "print" | "ship">(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const shippedQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["mp-menu-shipped", clientId, weekTag(weekStart)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("id, file_name, uploaded_at, storage_path")
        .eq("client_id", clientId)
        .eq("document_type", "meal_plan_menu")
        .ilike("storage_path", `%/meal-plan-menu-${weekTag(weekStart)}-%`)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const buildBytes = async () => {
    return await renderMealPlanPdf({
      orgName, logo, clientName, weekLabel,
      nutritionLabel, nutritionUnit,
      meals: meals.map((m) => ({
        day_of_week: m.day_of_week, meal_slot: m.meal_slot,
        label: m.label, description: m.description,
        nutrition_value: m.nutrition_value, estimated_cost: m.estimated_cost,
      })),
      shopping: shopping.map((s) => ({
        item: s.item, quantity: s.quantity, checked: !!s.checked,
      })),
      foodLikes, foodsToAvoid, allergies, dietaryNeeds,
    });
  };

  const openPreview = async () => {
    setBusy("preview");
    try {
      const bytes = await buildBytes();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build preview");
    } finally { setBusy(null); }
  };
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };
  const openPdf = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      const bytes = await buildBytes();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = mealPlanPdfFilename(clientName, weekLabel);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
      } else if (mode === "print") {
        win.addEventListener("load", () => { try { win.focus(); win.print(); } catch { /* noop */ } });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build PDF");
    } finally { setBusy(null); }
  };
  const shipToFile = async () => {
    setBusy("ship");
    try {
      const bytes = await buildBytes();
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const stampSlug = new Date().toISOString().replace(/[:.]/g, "-");
      const storagePath =
        `${organizationId}/${clientId}/meal-plans/meal-plan-menu-${weekTag(weekStart)}-${stampSlug}.pdf`;
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(storagePath, blob, { upsert: false, contentType: "application/pdf" });
      if (upErr) throw upErr;
      const fileName = `Meal Plan — Weekly Menu ${weekLabel}.pdf`;
      const { error: insErr } = await supabase
        .from("client_documents")
        .insert({
          client_id: clientId,
          organization_id: organizationId,
          file_name: fileName,
          document_type: "meal_plan_menu",
          file_url: `storage://client-documents/${storagePath}`,
          storage_path: storagePath,
          file_size_bytes: bytes.byteLength,
          uploaded_by: uid,
        });
      if (insErr) throw insErr;
      toast.success(`Shipped to client file (${weekLabel})`);
      qc.invalidateQueries({ queryKey: ["mp-menu-shipped", clientId, weekTag(weekStart)] });
      qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not ship menu");
    } finally { setBusy(null); }
  };

  const shipped = shippedQ.data ?? [];
  const latestShipped = shipped[0] ?? null;

  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Weekly menu — output</div>
          <div className="text-xs text-muted-foreground">
            {latestShipped ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                Shipped {new Date(latestShipped.uploaded_at).toLocaleDateString()} — {weekLabel}
                {shipped.length > 1 ? ` (${shipped.length} snapshots)` : ""}
              </span>
            ) : (
              <>Not yet shipped to client file for {weekLabel}</>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={openPreview} disabled={busy !== null}>
            <Eye className="mr-2 h-4 w-4" />{busy === "preview" ? "Building…" : "Preview"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openPdf("download")} disabled={busy !== null}>
            <FileText className="mr-2 h-4 w-4" />{busy === "download" ? "Building…" : "Download PDF"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openPdf("print")} disabled={busy !== null}>
            <Printer className="mr-2 h-4 w-4" />{busy === "print" ? "Building…" : "Print"}
          </Button>
          <Button size="sm" variant="secondary" onClick={shipToFile} disabled={busy !== null}
            title="Save a finalized snapshot to the client's Files">
            <Send className="mr-2 h-4 w-4" />{busy === "ship" ? "Shipping…" : "Ship to client file"}
          </Button>
        </div>
      </div>

      <Dialog open={previewUrl !== null} onOpenChange={(o) => { if (!o) closePreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base">
              Weekly menu preview — {clientName} · {weekLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted">
            {previewUrl && (
              <iframe src={previewUrl} title="Menu PDF preview" className="w-full h-full border-0" />
            )}
          </div>
          <DialogFooter className="px-4 py-3 border-t gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Preview only — nothing has been saved. Use Download, Print, or Ship to commit.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openPdf("download")} disabled={busy !== null}>
                <FileText className="mr-2 h-4 w-4" /> Download
              </Button>
              <Button size="sm" variant="outline" onClick={() => openPdf("print")} disabled={busy !== null}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button size="sm" variant="secondary" onClick={closePreview}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Plan vs. Actual report card — Preview / Download / Print / Ship
// Manager-only. Reads actuals + planned meals for the current week.
// ═══════════════════════════════════════════════════════════════════════════
function PlanVsActualReportsSection({
  clientId,
  organizationId,
  clientName,
  currentWeekStart,
  logo,
}: {
  clientId: string;
  organizationId: string;
  clientName: string;
  currentWeekStart: Date;
  logo: MealPlanLogo | null;
}) {
  const qc = useQueryClient();
  const [pickedWeek, setPickedWeek] = useState<Date>(currentWeekStart);
  const [weeksCount, setWeeksCount] = useState<number>(1);
  const [busy, setBusy] = useState<null | "preview" | "download" | "print" | "ship">(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const rangeLabel = rangeLabelOf(pickedWeek, weeksCount);
  const rangeTag = rangeTagOf(pickedWeek, weeksCount);

  const shippedQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["mp-pva-shipped", clientId, rangeTag],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("id, file_name, uploaded_at, storage_path")
        .eq("client_id", clientId)
        .eq("document_type", "meal_plan_plan_vs_actual")
        .ilike("storage_path", `%/plan-vs-actual-${rangeTag}-%`)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const buildBytes = async () => {
    const r = await generatePlanVsActualReport({
      clientId,
      weekStart: pickedWeek,
      weeksCount,
      logo,
    });
    return r;
  };

  const openPreview = async () => {
    setBusy("preview");
    try {
      const r = await buildBytes();
      const blob = new Blob([new Uint8Array(r.bytes)], { type: "application/pdf" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build preview");
    } finally {
      setBusy(null);
    }
  };
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };
  const openPdf = async (mode: "download" | "print") => {
    setBusy(mode);
    try {
      const r = await buildBytes();
      const blob = new Blob([new Uint8Array(r.bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = r.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (mode === "print") {
        win.addEventListener("load", () => {
          try {
            win.focus();
            win.print();
          } catch {
            /* noop */
          }
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build PDF");
    } finally {
      setBusy(null);
    }
  };
  const shipToFile = async () => {
    setBusy("ship");
    try {
      const r = await shipPlanVsActualReport({
        clientId,
        weekStart: pickedWeek,
        weeksCount,
        logo,
      });
      toast.success(`Shipped to client file (${r.rangeLabel})`);
      qc.invalidateQueries({ queryKey: ["mp-pva-shipped", clientId, rangeTag] });
      qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not ship report");
    } finally {
      setBusy(null);
    }
  };

  const shipped = shippedQ.data ?? [];
  const latestShipped = shipped[0] ?? null;
  const weekInputISO = pickedWeek.toISOString().slice(0, 10);
  const setPickedByISO = (iso: string) => {
    if (!iso) return;
    const [y, m, d] = iso.split("-").map((s) => Number(s));
    if (!y || !m || !d) return;
    const dt = new Date(y, m - 1, d);
    setPickedWeek(mondayOf(dt));
  };
  const shiftWeeks = (n: number) => setPickedWeek(addDays(pickedWeek, n * 7));

  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Plan vs. Actual reports
          </div>
          <div className="text-xs text-muted-foreground">
            Generate an audit-ready PDF for any past week (or range). Staff record actuals in their view.
          </div>
        </div>
      </div>

      {/* Picker row: week + weeks-count */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Week of (Mon)
          </label>
          <div className="mt-1 flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => shiftWeeks(-1)}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={weekInputISO}
              onChange={(e) => setPickedByISO(e.target.value)}
              className="h-8 w-40"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => shiftWeeks(1)}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setPickedWeek(currentWeekStart)}
            >
              This week
            </Button>
          </div>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Weeks
          </label>
          <select
            value={weeksCount}
            onChange={(e) => setWeeksCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            className="mt-1 h-8 rounded-md border bg-background px-2 text-sm"
          >
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 week" : `${n} weeks`}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-muted-foreground">
          Range: <span className="font-medium text-foreground">{rangeLabel}</span>
        </div>
      </div>

      {/* Shipped indicator (scoped to picked range) */}
      {latestShipped && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            Shipped {new Date(latestShipped.uploaded_at).toLocaleDateString()} — {rangeLabel}
            {shipped.length > 1 ? ` (${shipped.length} snapshots)` : ""}
          </span>
        </div>
      )}

      {/* Action row */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={openPreview} disabled={busy !== null}>
          <Eye className="mr-2 h-4 w-4" />
          {busy === "preview" ? "Building…" : "Preview"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openPdf("download")} disabled={busy !== null}>
          <FileText className="mr-2 h-4 w-4" />
          {busy === "download" ? "Building…" : "Download PDF"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openPdf("print")} disabled={busy !== null}>
          <Printer className="mr-2 h-4 w-4" />
          {busy === "print" ? "Building…" : "Print"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={shipToFile}
          disabled={busy !== null}
          title="Save a finalized snapshot to the client's Files"
        >
          <Send className="mr-2 h-4 w-4" />
          {busy === "ship" ? "Shipping…" : "Ship to client file"}
        </Button>
      </div>

      <Dialog open={previewUrl !== null} onOpenChange={(o) => { if (!o) closePreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base">
              Plan vs. Actual preview — {clientName} · {rangeLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted">
            {previewUrl && (
              <iframe src={previewUrl} title="Plan vs. Actual preview" className="w-full h-full border-0" />
            )}
          </div>
          <DialogFooter className="px-4 py-3 border-t gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Preview only — nothing has been saved. Use Download, Print, or Ship to commit.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openPdf("download")} disabled={busy !== null}>
                <FileText className="mr-2 h-4 w-4" /> Download
              </Button>
              <Button size="sm" variant="outline" onClick={() => openPdf("print")} disabled={busy !== null}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button size="sm" variant="secondary" onClick={closePreview}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

