import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
        .select("dietary_needs, allergies, needs_shopping_help")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        dietary_needs: string | null;
        allergies: string[] | null;
        needs_shopping_help: boolean | null;
      } | null;
    },
  });
  const needsHelp = !!clientQ.data?.needs_shopping_help;

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
    mutationFn: async ({ day, slot }: { day: number; slot: Slot }) => {
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
        label: "",
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
        .select("id, meal_plan_id, actual_date, meal_slot, outcome, note")
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
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    return `${shortDate(weekStart)} – ${shortDate(end)}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-primary" />
          <CardTitle>Meal Planner</CardTitle>
          {!canEdit && <Badge variant="secondary">Read only</Badge>}
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

        {/* Weekly grid */}
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
                        <div className="flex flex-col gap-1.5">
                          {entries.map((m) => (
                            <MealPill
                              key={m.id}
                              meal={m}
                              unit={cfg.nutrition_unit}
                              canEdit={canEdit}
                              onChange={(patch) => updateMeal.mutate({ id: m.id, ...patch })}
                              onDelete={() => deleteMeal.mutate(m.id)}
                            />
                          ))}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 justify-start px-2 text-xs text-muted-foreground"
                              onClick={() => addMeal.mutate({ day: i, slot })}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Add
                            </Button>
                          )}
                        </div>
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
                  className={`h-8 ${s.checked ? "line-through text-muted-foreground" : ""}`}
                  onBlur={(e) => {
                    if (e.target.value !== s.item)
                      updateShop.mutate({ id: s.id, item: e.target.value });
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
          Pass 1: grid + per-cell CRUD + manual shopping list. Pass 2 will add drag-drop between
          cells and a staff "what did they actually eat" confirmation. Pass 3 will add recipe
          scanning, auto-populated shopping list, and budget-fit checks.
        </p>
      </CardContent>
    </Card>
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
  return (
    <div className="group rounded-md border bg-card p-1.5 shadow-sm">
      <div className="flex items-start gap-1">
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
      <div className="flex items-center gap-1 px-1">
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
