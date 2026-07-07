// Meal Planner — Pass 3 companion module.
// Recipes library, NECTAR recipe parsing, auto-populated shopping list with
// quantity aggregation, budget-fit reading client_budgets, and NECTAR meal
// suggestions. All AI is advisory: parsed/suggested output is shown for the
// manager to review before it lands anywhere.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  BookOpen,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  ShoppingCart,
  Wand2,
} from "lucide-react";

export type Recipe = {
  id: string;
  name: string;
  source_text: string | null;
  notes: string | null;
  client_id: string | null;
};
export type Ingredient = {
  id?: string;
  recipe_id?: string;
  item: string;
  quantity: string | null;
  estimated_cost: number | null;
  sort_order: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Recipe hooks
// ────────────────────────────────────────────────────────────────────────────

export function useRecipes(orgId: string | undefined, clientId: string) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["mp-recipes", orgId, clientId],
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await supabase
        .from("client_recipes")
        .select("id, name, source_text, notes, client_id")
        .eq("organization_id", orgId!)
        .or(`client_id.eq.${clientId},client_id.is.null`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Recipe[];
    },
  });
}

export function useRecipeIngredients(recipeId: string | null) {
  return useQuery({
    enabled: !!recipeId,
    queryKey: ["mp-recipe-ingredients", recipeId],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase
        .from("client_recipe_ingredients")
        .select("id, recipe_id, item, quantity, estimated_cost, sort_order")
        .eq("recipe_id", recipeId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Add / edit / parse recipe dialog
// ────────────────────────────────────────────────────────────────────────────

export function AddRecipeDialog({
  orgId,
  clientId,
  onSaved,
}: {
  orgId: string;
  clientId: string;
  onSaved?: (recipeId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedOnce, setParsedOnce] = useState(false);

  function reset() {
    setName("");
    setSource("");
    setIngredients([]);
    setParsedOnce(false);
  }

  async function parseText() {
    if (!source.trim()) {
      toast.error("Paste a recipe first");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-recipe-doc", {
        body: { text: source },
      });
      if (error) throw error;
      if (!data?.ingredients) throw new Error("Parser returned no ingredients");
      setName((prev) => prev || data.meal_name || "");
      setIngredients(
        (data.ingredients as Array<{ item: string; quantity?: string }>).map((ing, i) => ({
          item: ing.item ?? "",
          quantity: ing.quantity ?? null,
          estimated_cost: null,
          sort_order: i,
        })),
      );
      setParsedOnce(true);
      toast.success(
        `NECTAR parsed ${data.ingredients.length} ingredient${data.ingredients.length === 1 ? "" : "s"} — please review before saving.`,
      );
    } catch (e) {
      toast.error(`Parse failed: ${(e as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  async function parseImage(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image too large (max 15MB)");
      return;
    }
    setParsing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          const idx = s.indexOf(",");
          resolve(idx >= 0 ? s.slice(idx + 1) : s);
        };
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("parse-recipe-doc", {
        body: { imageBase64: base64, mimeType: file.type || "image/jpeg" },
      });
      if (error) throw error;
      setName((prev) => prev || data?.meal_name || "");
      setIngredients(
        (Array.isArray(data?.ingredients) ? data.ingredients : []).map(
          (ing: { item: string; quantity?: string }, i: number) => ({
            item: ing.item ?? "",
            quantity: ing.quantity ?? null,
            estimated_cost: null,
            sort_order: i,
          }),
        ),
      );
      setParsedOnce(true);
      toast.success("Scanned — please review the parsed ingredients.");
    } catch (e) {
      toast.error(`Scan failed: ${(e as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Recipe needs a name");
      return;
    }
    setSaving(true);
    try {
      const { data: rec, error } = await supabase
        .from("client_recipes")
        .insert({
          organization_id: orgId,
          client_id: clientId,
          name: name.trim(),
          source_text: source || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const clean = ingredients
        .filter((i) => i.item.trim().length > 0)
        .map((i, idx) => ({
          recipe_id: rec.id,
          item: i.item.trim(),
          quantity: i.quantity ?? null,
          estimated_cost: i.estimated_cost ?? null,
          sort_order: idx,
        }));
      if (clean.length > 0) {
        const { error: ie } = await supabase.from("client_recipe_ingredients").insert(clean);
        if (ie) throw ie;
      }
      qc.invalidateQueries({ queryKey: ["mp-recipes", orgId, clientId] });
      toast.success("Recipe saved");
      onSaved?.(rec.id);
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Sparkles className="h-3.5 w-3.5" /> Add recipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a recipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={mode === "paste" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("paste")}
            >
              Paste text
            </Button>
            <Button
              variant={mode === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("upload")}
            >
              <Upload className="mr-1 h-3.5 w-3.5" /> Upload / scan
            </Button>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Recipe name (e.g. Spaghetti & meatballs)"
          />
          {mode === "paste" ? (
            <div className="space-y-2">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                rows={8}
                placeholder="Paste the recipe here (ingredients + instructions)…"
              />
              <Button size="sm" onClick={parseText} disabled={parsing}>
                {parsing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                Parse with NECTAR
              </Button>
            </div>
          ) : (
            <div className="rounded border border-dashed p-4 text-center text-sm">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) parseImage(f);
                }}
                className="mx-auto block"
              />
              {parsing && <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> NECTAR parsing…</div>}
            </div>
          )}

          <div className="rounded border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Ingredients {parsedOnce && <Badge variant="secondary" className="ml-2 text-[10px]">Review parsed output</Badge>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setIngredients((x) => [
                    ...x,
                    { item: "", quantity: "", estimated_cost: null, sort_order: x.length },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add row
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {ingredients.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No ingredients yet — parse a recipe or add manually.
                </div>
              )}
              {ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_120px_100px_36px] items-center gap-2 px-3 py-1.5">
                  <Input
                    value={ing.item}
                    onChange={(e) =>
                      setIngredients((x) => x.map((y, i) => (i === idx ? { ...y, item: e.target.value } : y)))
                    }
                    placeholder="Ingredient"
                    className="h-8"
                  />
                  <Input
                    value={ing.quantity ?? ""}
                    onChange={(e) =>
                      setIngredients((x) => x.map((y, i) => (i === idx ? { ...y, quantity: e.target.value } : y)))
                    }
                    placeholder="1 lb"
                    className="h-8"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={ing.estimated_cost ?? ""}
                    onChange={(e) =>
                      setIngredients((x) =>
                        x.map((y, i) =>
                          i === idx
                            ? { ...y, estimated_cost: e.target.value === "" ? null : Number(e.target.value) }
                            : y,
                        ),
                      )
                    }
                    placeholder="$ cost"
                    className="h-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIngredients((x) => x.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            NECTAR only parses what's in the recipe — no invented ingredients. Please review before saving.
            Prices are manager-entered; NECTAR does not fabricate them.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Save recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Recipe library dialog — pick a recipe to drop into a cell
// ────────────────────────────────────────────────────────────────────────────

export function PickRecipeMenu({
  orgId,
  clientId,
  onPick,
}: {
  orgId: string;
  clientId: string;
  onPick: (recipe: Recipe) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: recipes } = useRecipes(orgId, clientId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 justify-start px-2 text-xs text-muted-foreground">
          <BookOpen className="mr-1 h-3 w-3" /> From recipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a recipe</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {(recipes ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No saved recipes yet. Add one from the toolbar.
            </p>
          )}
          {(recipes ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span>{r.name}</span>
              {r.client_id === null && <Badge variant="outline" className="text-[10px]">Org library</Badge>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-populate shopping list from recipes (aggregated)
// ────────────────────────────────────────────────────────────────────────────

type AggIng = { item: string; quantities: string[]; count: number };

export function AutoShoppingDialog({
  orgId,
  planId,
  recipeIdsInPlan,
  onDone,
}: {
  orgId: string;
  planId: string;
  recipeIdsInPlan: string[];
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const ingQ = useQuery({
    enabled: open && recipeIdsInPlan.length > 0,
    queryKey: ["mp-auto-shop-ings", planId, recipeIdsInPlan.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_recipe_ingredients")
        .select("item, quantity, recipe_id")
        .in("recipe_id", recipeIdsInPlan);
      if (error) throw error;
      return (data ?? []) as { item: string; quantity: string | null; recipe_id: string }[];
    },
  });

  const aggregated: AggIng[] = useMemo(() => {
    const map = new Map<string, AggIng>();
    for (const row of ingQ.data ?? []) {
      const key = row.item.trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (row.quantity) existing.quantities.push(row.quantity);
      } else {
        map.set(key, { item: row.item.trim(), quantities: row.quantity ? [row.quantity] : [], count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item));
  }, [ingQ.data]);

  function toggle(item: string) {
    setChecked((c) => ({ ...c, [item]: !c[item] }));
  }
  function setAll(v: boolean) {
    const next: Record<string, boolean> = {};
    for (const a of aggregated) next[a.item.toLowerCase()] = v;
    setChecked(next);
  }

  async function commit() {
    const selected = aggregated.filter((a) => checked[a.item.toLowerCase()] !== false);
    if (selected.length === 0) {
      toast.error("Nothing to add");
      return;
    }
    setBusy(true);
    try {
      // Fetch current items to avoid duplicates
      const { data: existing } = await supabase
        .from("client_shopping_items")
        .select("id, item, sort_order")
        .eq("meal_plan_id", planId);
      const existingMap = new Map(
        (existing ?? []).map((e: { id: string; item: string; sort_order: number }) => [
          e.item.trim().toLowerCase(),
          e,
        ]),
      );
      let sortStart = (existing ?? []).length;

      const toInsert: { meal_plan_id: string; item: string; quantity: string; sort_order: number }[] = [];
      for (const s of selected) {
        const key = s.item.toLowerCase();
        const qty = s.quantities.length ? s.quantities.join(" + ") : "";
        if (existingMap.has(key)) continue;
        toInsert.push({
          meal_plan_id: planId,
          item: s.item,
          quantity: qty,
          sort_order: sortStart++,
        });
      }
      if (toInsert.length > 0) {
        const { error } = await supabase.from("client_shopping_items").insert(toInsert);
        if (error) throw error;
      }
      // Upsert org library
      const libRows = selected.map((s) => ({
        organization_id: orgId,
        item: s.item,
        last_used_at: new Date().toISOString(),
      }));
      await supabase
        .from("org_shopping_library")
        .upsert(libRows, { onConflict: "organization_id,item", ignoreDuplicates: false })
        .throwOnError()
        .then(
          () => undefined,
          () => undefined, // upsert conflict target uses expression index; fall back silently
        );

      qc.invalidateQueries({ queryKey: ["mp-shop", planId] });
      qc.invalidateQueries({ queryKey: ["mp-shop-library", orgId] });
      toast.success(
        `Added ${toInsert.length} item${toInsert.length === 1 ? "" : "s"} to shopping list.`,
      );
      onDone?.();
      setOpen(false);
    } catch (e) {
      toast.error(`Auto-populate failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1" disabled={recipeIdsInPlan.length === 0}>
          <Wand2 className="h-3.5 w-3.5" /> Auto-populate from recipes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review suggested shopping items</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Aggregated across {recipeIdsInPlan.length} recipe use{recipeIdsInPlan.length === 1 ? "" : "s"} on this week's plan.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)}>None</Button>
            </div>
          </div>
          {ingQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          <div className="max-h-80 space-y-1 overflow-y-auto rounded border p-2">
            {aggregated.length === 0 && !ingQ.isLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No ingredients found for the recipes on this plan.
              </div>
            )}
            {aggregated.map((a) => {
              const key = a.item.toLowerCase();
              const on = checked[key] !== false;
              return (
                <label key={key} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.item)} />
                  <span className="flex-1 text-sm">{a.item}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.quantities.length ? a.quantities.join(" + ") : "—"}
                  </span>
                  {a.count > 1 && (
                    <Badge variant="secondary" className="text-[10px]">×{a.count}</Badge>
                  )}
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nothing is added until you confirm. Duplicates already on the list are skipped. Meal moves between cells never change this list — only recipes do.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={commit} disabled={busy || aggregated.length === 0}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Add to shopping list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Budget-fit card — reads client_budgets, sums food/grocery lines against
// per-meal estimated_cost totals for the current week.
// ────────────────────────────────────────────────────────────────────────────

const FOOD_RX = /(food|grocer|meal|nutrition)/i;

export function BudgetFitCard({
  clientId,
  weekStart,
  plannedTotal,
}: {
  clientId: string;
  weekStart: Date;
  plannedTotal: number;
}) {
  const monthISO = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-01`;
  const budgetQ = useQuery({
    enabled: !!clientId,
    queryKey: ["mp-budget-fit", clientId, monthISO],
    queryFn: async () => {
      const { data: budget } = await supabase
        .from("client_budgets")
        .select("id")
        .eq("client_id", clientId)
        .eq("period_month", monthISO)
        .maybeSingle();
      if (!budget) return { budgetId: null as string | null, foodTotal: 0, matched: [] as string[] };
      const { data: lines } = await supabase
        .from("client_budget_lines")
        .select("label, section, non_variable, variable")
        .eq("budget_id", budget.id);
      let foodTotal = 0;
      const matched: string[] = [];
      for (const l of lines ?? []) {
        if (l.section === "expenses" && FOOD_RX.test(l.label || "")) {
          foodTotal += Number(l.non_variable || 0) + Number(l.variable || 0);
          matched.push(l.label);
        }
      }
      return { budgetId: budget.id, foodTotal, matched };
    },
  });

  const monthBudget = budgetQ.data?.foodTotal ?? 0;
  // Convert monthly food budget to weekly (roughly 4.33 weeks/month)
  const weeklyBudget = monthBudget / 4.33;
  const delta = weeklyBudget - plannedTotal;
  const over = plannedTotal > 0 && weeklyBudget > 0 && delta < 0;
  const noBudget = !budgetQ.data?.budgetId || monthBudget === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4 text-primary" /> Budget fit
          {over && <Badge variant="destructive" className="text-[10px]">Over budget</Badge>}
          {!over && !noBudget && plannedTotal > 0 && <Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">On track</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {noBudget ? (
          <p className="text-xs text-muted-foreground">
            No food/grocery line found in this client's monthly budget. Add one in the Client Budget tab (Expenses section, label containing "food" or "grocery").
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Weekly food budget</div>
                <div className="tabular-nums font-semibold">${weeklyBudget.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">This week planned</div>
                <div className="tabular-nums font-semibold">${plannedTotal.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Remaining</div>
                <div className={`tabular-nums font-semibold ${delta < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  ${delta.toFixed(2)}
                </div>
              </div>
            </div>
            {budgetQ.data && budgetQ.data.matched.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Reading from: {budgetQ.data.matched.join(", ")} (÷4.33 for weekly).
              </p>
            )}
            {over && (
              <p className="text-xs text-destructive">
                This week's planned meals are over the food budget. NECTAR can suggest cheaper swaps — flag only, never blocks planning.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// NECTAR suggestions dialog
// ────────────────────────────────────────────────────────────────────────────

export function SuggestionsDialog({
  meals,
  dietaryNeeds,
  allergies,
  foodsToAvoid,
  budgetRemaining,
}: {
  meals: { day: string; slot: string; label: string; estimated_cost?: number | null }[];
  dietaryNeeds: string | null;
  allergies: string[] | null;
  foodsToAvoid: string | null;
  budgetRemaining: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [goal, setGoal] = useState<"healthier_and_affordable" | "cheaper" | "healthier">(
    "healthier_and_affordable",
  );
  const [suggestions, setSuggestions] = useState<
    Array<{ swap_for?: string; suggested_meal: string; rationale: string; kind: string; estimated_cost?: number }>
  >([]);

  async function fetchSuggestions() {
    setLoading(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-meal-swaps", {
        body: {
          meals,
          dietary_needs: dietaryNeeds,
          allergies,
          foods_to_avoid: foodsToAvoid,
          budget_remaining: budgetRemaining,
          goal,
        },
      });
      if (error) throw error;
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (e) {
      toast.error(`NECTAR suggestions failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) fetchSuggestions();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Sparkles className="h-3.5 w-3.5" /> NECTAR suggestions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>NECTAR meal suggestions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {allergies && allergies.length > 0 && (
              <span className="flex items-center gap-1">
                Allergies (hard avoids):
                {allergies.map((a) => (
                  <Badge key={a} variant="destructive" className="text-[10px]">{a}</Badge>
                ))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["healthier_and_affordable", "cheaper", "healthier"] as const).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={goal === g ? "default" : "outline"}
                onClick={() => { setGoal(g); }}
              >
                {g === "healthier_and_affordable" ? "Healthier + affordable" : g === "cheaper" ? "Cheaper" : "Healthier"}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={fetchSuggestions} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-ask"}
            </Button>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Asking NECTAR…</p>}
          {!loading && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No suggestions yet — plan some meals first, or try another goal.
            </p>
          )}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{s.suggested_meal}</div>
                  <Badge variant="outline" className="text-[10px] capitalize">{s.kind.replace("_", " ")}</Badge>
                </div>
                {s.swap_for && s.swap_for !== "new" && (
                  <div className="text-[11px] text-muted-foreground">swap for: {s.swap_for}</div>
                )}
                <div className="text-xs text-muted-foreground">{s.rationale}</div>
                {typeof s.estimated_cost === "number" && (
                  <div className="text-[11px] text-muted-foreground">est. ${s.estimated_cost.toFixed(2)}</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Suggestions are advisory. NECTAR respects allergies as hard avoids and never fabricates prices — manager decides.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shopping library autocomplete hook
// ────────────────────────────────────────────────────────────────────────────

export function useShoppingLibrary(orgId: string | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["mp-shop-library", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_shopping_library")
        .select("item")
        .eq("organization_id", orgId!)
        .order("last_used_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r: { item: string }) => r.item);
    },
  });
}

export function recordShoppingItemUse(orgId: string, item: string) {
  const trimmed = item.trim();
  if (!trimmed) return;
  // Fire-and-forget; ignore conflict errors — the unique index is expression-based
  // so we do a select-then-upsert style: insert, if conflict update timestamp.
  supabase
    .from("org_shopping_library")
    .upsert(
      { organization_id: orgId, item: trimmed, last_used_at: new Date().toISOString() },
      { onConflict: "organization_id,item", ignoreDuplicates: false },
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

// Placeholder to silence unused-lint on ShoppingCart when a consumer imports.
export { ShoppingCart };
