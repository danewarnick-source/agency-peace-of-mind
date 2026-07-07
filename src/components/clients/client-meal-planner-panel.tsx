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
import { Switch } from "@/components/ui/switch";
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
  ShoppingCart,
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



/** 0=Mon..6=Sun (matches the reference sheet). */
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Slot = typeof SLOTS[number];

type MealRow = {
  id: string;
  meal_plan_id: string;
  day_of_week: number;
  meal_slot: Slot;
  label: string;
  description: string | null;
  nutrition_value: number | null;
  notes: string | null;
  sort_order: number;
  recipe_id: string | null;
  estimated_cost: number | null;
};

type ShoppingItem = {
  id: string;
  meal_plan_id: string;
  item: string;
  quantity: string | null;
  sort_order: number;
  checked: boolean;
};

type NutritionCfg = { id: string; nutrition_label: string; nutrition_unit: string };

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

  // Client dietary fields + needs_shopping_help toggle
  const clientQ = useQuery({
    enabled: !!clientId,
    queryKey: ["mp-client-diet", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("first_name, last_name, dietary_needs, allergies, needs_shopping_help, meal_actuals_assignee, team_id")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        first_name: string | null;
        last_name: string | null;
        dietary_needs: string | null;
        allergies: string[] | null;
        needs_shopping_help: boolean | null;
        meal_actuals_assignee: string | null;
        team_id: string | null;
      } | null;
    },
  });
  const needsHelp = !!clientQ.data?.needs_shopping_help;
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

  const toggleNeedsHelp = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase
        .from("clients")
        .update({ needs_shopping_help: v })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-client-diet", clientId] }),
    onError: (e: Error) => toast.error(e.message),
  });

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


  // Nutrition config
  const cfgQ = useQuery({
    enabled: !!clientId && !!orgId,
    queryKey: ["mp-nutrition-cfg", clientId],
    queryFn: async (): Promise<NutritionCfg> => {
      const { data, error } = await supabase
        .from("client_nutrition_config")
        .select("id, nutrition_label, nutrition_unit")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? { id: "", nutrition_label: "Fat Grams", nutrition_unit: "g" }
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
    mutationFn: async (patch: { nutrition_label: string; nutrition_unit: string }) => {
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

  const cfg = cfgQ.data ?? { id: "", nutrition_label: "Fat Grams", nutrition_unit: "g" };
  const meals = mealsQ.data ?? [];
  const cellMeals = (day: number, slot: Slot) =>
    meals.filter((m) => m.day_of_week === day && m.meal_slot === slot);
  const dayTotal = (day: number) =>
    meals.filter((m) => m.day_of_week === day).reduce((s, m) => s + (m.nutrition_value ?? 0), 0);
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
          {needsHelp && (
            <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
              <ShoppingCart className="h-3 w-3" /> Shopping help needed
            </Badge>
          )}
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

        {/* Nutrition metric config */}
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-end">
          <Settings2 className="mt-2 h-4 w-4 text-muted-foreground sm:mt-0 sm:mb-2" />
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Tracked nutrition metric
            </label>
            <Input
              defaultValue={cfg.nutrition_label}
              disabled={!canEdit}
              onBlur={(e) => {
                const v = e.target.value.trim() || "Fat Grams";
                if (v !== cfg.nutrition_label)
                  saveCfg.mutate({ nutrition_label: v, nutrition_unit: cfg.nutrition_unit });
              }}
              placeholder="e.g. Fat Grams, Blood Sugar, Carbs"
            />
          </div>
          <div className="w-full sm:w-32">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit</label>
            <Input
              defaultValue={cfg.nutrition_unit}
              disabled={!canEdit}
              onBlur={(e) => {
                const v = e.target.value.trim() || "g";
                if (v !== cfg.nutrition_unit)
                  saveCfg.mutate({ nutrition_label: cfg.nutrition_label, nutrition_unit: v });
              }}
              placeholder="g, mg/dL, kcal"
            />
          </div>
        </div>

        {/* Needs-shopping-help toggle (manager-editable). When off, the planner
            is still available but not foregrounded in staff view. */}
        <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
          <div>
            <div className="text-sm font-semibold">Client needs help with meals & shopping</div>
            <div className="text-xs text-muted-foreground">
              When on, the planner is highlighted for staff (typical for RHS / HHS support).
              When off, it stays available but not foregrounded.
            </div>
          </div>
          <Switch
            checked={needsHelp}
            disabled={!canEdit || toggleNeedsHelp.isPending}
            onCheckedChange={(v) => toggleNeedsHelp.mutate(v)}
          />
        </div>

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
                  {cfg.nutrition_label}
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
                          unit={cfg.nutrition_unit}
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
                  <td className="border-b px-3 py-2 text-right text-sm font-semibold tabular-nums">
                    {dayTotal(i).toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {cfg.nutrition_unit}
                    </span>
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
            <PlanVsActualReportCard
              clientName={clientName}
              weekStart={weekStart}
              weekLabel={weekLabel}
              meals={meals}
              actuals={actualsQ.data ?? []}
              staff={staffQ.data ?? []}
              orgName={org?.organization_name ?? ""}
              logo={logoState}
              clientId={clientId}
              organizationId={orgId ?? ""}
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
  unit,
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
  unit: string;
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
          unit={unit}
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

function MealPill({
  meal,
  unit,
  canEdit,
  onChange,
  onDelete,
}: {
  meal: MealRow;
  unit: string;
  canEdit: boolean;
  onChange: (patch: Partial<MealRow>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: meal.id,
    disabled: !canEdit,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
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
          onFocus={() => setExpanded(true)}
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
      <div className="flex flex-wrap items-center gap-1 px-1">
        <Input
          type="number"
          step="0.1"
          defaultValue={meal.nutrition_value ?? ""}
          disabled={!canEdit}
          placeholder="0"
          className="h-6 w-16 px-1 text-xs tabular-nums"
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== meal.nutrition_value) onChange({ nutrition_value: v });
          }}
        />
        <span className="text-[10px] text-muted-foreground">{unit}</span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-[10px] text-muted-foreground">$</span>
        <Input
          type="number"
          step="0.01"
          defaultValue={meal.estimated_cost ?? ""}
          disabled={!canEdit}
          placeholder="cost"
          className="h-6 w-16 px-1 text-xs tabular-nums"
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== meal.estimated_cost) onChange({ estimated_cost: v });
          }}
        />
        {meal.recipe_id && (
          <span title="From recipe" className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-primary">
            <BookOpen className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      {(expanded || meal.description) && (
        <Textarea
          defaultValue={meal.description ?? ""}
          disabled={!canEdit}
          placeholder="Notes / description"
          rows={2}
          className="mt-1 min-h-0 text-xs"
          onBlur={(e) => {
            if (e.target.value !== (meal.description ?? ""))
              onChange({ description: e.target.value });
          }}
        />
      )}
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

function ActualsReadOnly({
  weekStart,
  actuals,
  meals,
  staff,
}: {
  weekStart: Date;
  actuals: ActualRow[];
  meals: MealRow[];
  staff: { id: string; name: string }[];
}) {
  const staffName = (id: string | null) =>
    (id && staff.find((s) => s.id === id)?.name) || (id ? "Staff" : "—");
  const outcomeLabel = (v: Outcome) => OUTCOMES.find((o) => o.v === v)?.label ?? v;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const plannedFor = (dow: number, slot: Slot) =>
    meals.filter((m) => m.day_of_week === dow && m.meal_slot === slot)
      .map((m) => m.label || "(unnamed)").join(", ") || "—";
  const actualFor = (dateISO: string, slot: Slot) =>
    actuals.find((a) => a.actual_date === dateISO && a.meal_slot === slot);
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-semibold">Plan vs. actual — this week</h4>
        <Badge variant="outline" className="text-[10px]">Read-only — staff records</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-2 py-1 font-semibold">Day</th>
              <th className="px-2 py-1 font-semibold">Slot</th>
              <th className="px-2 py-1 font-semibold">Planned</th>
              <th className="px-2 py-1 font-semibold">Outcome</th>
              <th className="px-2 py-1 font-semibold">Note</th>
              <th className="px-2 py-1 font-semibold">Confirmed by</th>
            </tr>
          </thead>
          <tbody>
            {days.flatMap((d, i) =>
              SLOTS.map((slot) => {
                const iso = fmtISO(d);
                const a = actualFor(iso, slot);
                return (
                  <tr key={`${iso}-${slot}`} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">
                      {DAYS[i].slice(0, 3)} {shortDate(d)}
                    </td>
                    <td className="px-2 py-1 capitalize">{slot}</td>
                    <td className="px-2 py-1 text-muted-foreground">{plannedFor(i, slot)}</td>
                    <td className="px-2 py-1">
                      {a ? outcomeLabel(a.outcome) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{a?.note ?? ""}</td>
                    <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                      {a ? (
                        <>
                          {staffName(a.confirmed_by)}
                          {a.confirmed_at ? ` · ${new Date(a.confirmed_at).toLocaleDateString()}` : ""}
                        </>
                      ) : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
