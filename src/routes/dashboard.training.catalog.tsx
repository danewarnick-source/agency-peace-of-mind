import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, ShieldCheck, Search } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { AddonLock } from "@/components/nectar/addon-lock";
import { NectarCard, NectarHeader } from "@/components/nectar/nectar-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  getTrainingProducts,
  purchaseTrainingSeats,
  getOrgTrainingPurchases,
  searchActiveStaffForEnrollment,
  enrollStaffInTraining,
  type TrainingProduct,
  type TrainingPurchaseRow,
  type StaffCandidate,
} from "@/lib/training-enrollments.functions";

export const Route = createFileRoute("/dashboard/training/catalog")({
  head: () => ({ meta: [{ title: "Training Catalog — HIVE" }] }),
  component: TrainingCatalogPage,
});

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function TrainingCatalogPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  return (
    <div className="space-y-4">
      <NectarHeader
        surface="navy"
        eyebrow="HIVE Training"
        title="Training Catalog"
        description="Purchase seats for required certifications and assign them to staff. Hive coordinates enrollment end to end."
      />
      <AddonLock
        addon="hive_training"
        featureName="Training Catalog"
        benefit="Buy CPR/First Aid, MANDT, and 30-Day Orientation seats and let Hive handle enrollment, reminders, and certificate verification."
      >
        {orgId ? <CatalogAndPurchases organizationId={orgId} /> : null}
      </AddonLock>
    </div>
  );
}

function CatalogAndPurchases({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [purchaseProduct, setPurchaseProduct] = useState<TrainingProduct | null>(null);
  const [assignPurchase, setAssignPurchase] = useState<TrainingPurchaseRow | null>(null);

  const productsFn = useServerFn(getTrainingProducts);
  const productsQ = useQuery({
    queryKey: ["training-products"],
    queryFn: () => productsFn(),
  });

  const purchasesFn = useServerFn(getOrgTrainingPurchases);
  const purchasesQ = useQuery({
    queryKey: ["training-purchases", organizationId],
    queryFn: () => purchasesFn({ data: { organization_id: organizationId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["training-purchases", organizationId] });
  };

  return (
    <div className="space-y-8 pt-4">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Catalog</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(productsQ.data ?? []).map((p) => (
            <NectarCard key={p.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-semibold tracking-tight">{p.name}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                </div>
              </div>
              {p.fulfills_obligation_key && (
                <Badge variant="outline" className="mt-3 gap-1 border-emerald-500/50 text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> Satisfies {p.fulfills_obligation_key.replace(/_/g, " ")}
                </Badge>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-lg font-bold">{money(p.price_cents)}<span className="text-xs font-normal text-muted-foreground"> / seat</span></span>
                <Button size="sm" onClick={() => setPurchaseProduct(p)}>Purchase seats</Button>
              </div>
            </NectarCard>
          ))}
          {productsQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No training products available.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Purchases</h3>
        <NectarCard className="p-0">
          {purchasesQ.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (purchasesQ.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No purchases yet — buy seats above to get started.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(purchasesQ.data ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{row.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.seats_remaining} of {row.quantity} seats remaining · {money(row.total_cents)} total
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        row.payment_status === "paid"
                          ? "border-emerald-500/60 text-emerald-700"
                          : "border-amber-500/60 text-amber-700"
                      }
                    >
                      {row.payment_status === "paid" ? "Paid" : "Invoice pending"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={row.seats_remaining <= 0}
                      onClick={() => setAssignPurchase(row)}
                    >
                      Assign staff →
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </NectarCard>
      </section>

      {purchaseProduct && (
        <PurchaseDialog
          product={purchaseProduct}
          organizationId={organizationId}
          onClose={() => setPurchaseProduct(null)}
          onPurchased={invalidate}
        />
      )}

      {assignPurchase && (
        <AssignStaffDrawer
          purchase={assignPurchase}
          organizationId={organizationId}
          onClose={() => setAssignPurchase(null)}
          onAssigned={() => {
            invalidate();
            setAssignPurchase(null);
          }}
        />
      )}
    </div>
  );
}

function PurchaseDialog({
  product,
  organizationId,
  onClose,
  onPurchased,
}: {
  product: TrainingProduct;
  organizationId: string;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [working, setWorking] = useState(false);
  const purchaseFn = useServerFn(purchaseTrainingSeats);

  const total = qty * product.price_cents;

  const confirm = async () => {
    try {
      setWorking(true);
      await purchaseFn({
        data: { organization_id: organizationId, product_id: product.id, quantity: qty },
      });
      toast.success(`Purchased ${qty} seat${qty === 1 ? "" : "s"} of ${product.name}`);
      onPurchased();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase seats — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="text-sm font-medium">Quantity</label>
          <Input
            type="number"
            min={1}
            max={500}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          />
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between"><span>Price per seat</span><span>{money(product.price_cents)}</span></div>
            <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">Hive will invoice your organization separately.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={working}>Cancel</Button>
          <Button onClick={confirm} disabled={working}>{working ? "Purchasing…" : "Confirm purchase"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignStaffDrawer({
  purchase,
  organizationId,
  onClose,
  onAssigned,
}: {
  purchase: TrainingPurchaseRow;
  organizationId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const searchFn = useServerFn(searchActiveStaffForEnrollment);
  const searchQ = useQuery({
    queryKey: ["training-staff-search", organizationId, purchase.product_id, query],
    queryFn: () =>
      searchFn({
        data: { organization_id: organizationId, product_id: purchase.product_id, query },
      }),
  });

  const enrollFn = useServerFn(enrollStaffInTraining);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const candidates = searchQ.data ?? [];

  const confirm = async () => {
    if (!selected.size) return;
    try {
      setWorking(true);
      const r = await enrollFn({ data: { purchase_id: purchase.id, staff_ids: [...selected] } });
      toast.success(`Enrolled ${r.enrolled} staff member${r.enrolled === 1 ? "" : "s"}`);
      onAssigned();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign staff — {purchase.product_name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">{purchase.seats_remaining} seat(s) remaining · {selected.size} selected</div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff…" className="pl-7" />
          </div>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {candidates.map((c: StaffCandidate) => (
              <li
                key={c.staff_id}
                className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${c.already_enrolled ? "opacity-50" : ""}`}
              >
                <Checkbox
                  checked={selected.has(c.staff_id)}
                  disabled={c.already_enrolled}
                  onCheckedChange={(checked) => toggle(c.staff_id, !!checked)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
                </div>
                {c.already_enrolled && <Badge variant="outline" className="text-[10px]">Already enrolled</Badge>}
              </li>
            ))}
            {candidates.length === 0 && !searchQ.isLoading && (
              <li className="py-6 text-center text-sm text-muted-foreground">No staff found.</li>
            )}
          </ul>
        </div>
        <SheetFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} disabled={working}>Cancel</Button>
          <Button onClick={confirm} disabled={working || selected.size === 0 || selected.size > purchase.seats_remaining}>
            {working ? "Enrolling…" : `Enroll ${selected.size} selected staff`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
