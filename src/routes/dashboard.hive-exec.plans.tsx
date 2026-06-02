import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CreditCard,
  CheckCircle2,
  Sparkles,
  Receipt,
  TrendingUp,
  Wrench,
  Search,
  Save,
} from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import {
  listCompanies,
  upsertSubscription,
  getExecKpis,
  type CompanyRow,
} from "@/lib/hive-exec.functions";
import {
  TIER_CATALOG,
  ADDON_CATALOG,
  getTier,
  formatTierPrice,
  type TierId,
} from "@/lib/hive-tiers";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/hive-exec/plans")({
  head: () => ({ meta: [{ title: "Plans & Billing — HIVE Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <PlansAndBilling />
    </RequireHiveExecutive>
  ),
});

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function PlansAndBilling() {
  return (
    <div className="space-y-6">
      <Header />
      <TierCatalogSection />
      <CompanyTierAssignmentSection />
      <PaymentSkeletonSection />
    </div>
  );
}

function Header() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Plans &amp; Billing</h2>
          <p className="text-sm text-muted-foreground">
            Define tiers, assign companies to a tier, and (later) collect payment. Tier
            assignment drives NECTAR Infusion / add-on access across the platform.
          </p>
        </div>
      </div>
    </div>
  );
}

// ───── Tier catalog ─────────────────────────────────────────────────────────

function TierCatalogSection() {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Tier catalog</h3>
        <span className="text-xs text-muted-foreground">
          Source of truth for tier → add-on entitlements
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TIER_CATALOG.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-baseline justify-between">
              <div className="font-display text-base font-semibold text-[#0f1b3d]">
                {t.name}
              </div>
              <div className="text-sm font-medium text-[#7a4a0a]">
                {formatTierPrice(t)}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.tagline}</p>

            <ul className="mt-3 space-y-1 text-xs">
              {t.highlights.map((h) => (
                <li key={h} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                NECTAR add-ons included
              </div>
              {t.addons.length === 0 ? (
                <div className="text-xs text-muted-foreground">None</div>
              ) : (
                <ul className="space-y-1">
                  {t.addons.map((a) => (
                    <li
                      key={a}
                      className="flex items-center gap-1.5 text-xs text-[#0f1b3d]"
                    >
                      <Sparkles className="h-3 w-3 text-[#d97a1c]" />
                      {ADDON_CATALOG[a].name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───── Company tier assignment ──────────────────────────────────────────────

function CompanyTierAssignmentSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanies);
  const saveFn = useServerFn(upsertSubscription);
  const listQ = useQuery({ queryKey: ["hive-exec-companies"], queryFn: () => listFn() });

  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, TierId>>({});

  const rows = useMemo<CompanyRow[]>(() => {
    const data = listQ.data ?? [];
    if (!search) return data;
    return data.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [listQ.data, search]);

  const save = useMutation({
    mutationFn: async (vars: { orgId: string; tier: TierId }) =>
      saveFn({ data: { organizationId: vars.orgId, patch: { plan: vars.tier } } }),
    onSuccess: (_d, vars) => {
      toast.success(`Tier updated to ${getTier(vars.tier).name}.`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.orgId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["hive-exec-companies"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-company", vars.orgId] });
      qc.invalidateQueries({ queryKey: ["my-entitlements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">Tier assignment</h3>
          <p className="text-xs text-muted-foreground">
            Changes take effect immediately — controls NECTAR Infusion access.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company…"
            className="min-h-[40px] w-full rounded-md border border-border bg-background pl-7 pr-3 text-sm md:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Current tier</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">MRR</th>
              <th className="px-3 py-2">Assign tier</th>
              <th className="px-3 py-2">Included add-ons</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Loading companies…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No companies found.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const draft = drafts[r.organization_id] ?? (r.plan as TierId);
                const dirty = draft !== r.plan;
                const tier = getTier(draft);
                return (
                  <tr
                    key={r.organization_id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-medium text-[#0f1b3d]">{r.name}</td>
                    <td className="px-3 py-2 text-xs uppercase tracking-wide">{r.plan}</td>
                    <td className="px-3 py-2 text-xs">{r.status.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(r.mrr_cents)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={draft}
                        onChange={(e) =>
                          setDrafts((p) => ({
                            ...p,
                            [r.organization_id]: e.target.value as TierId,
                          }))
                        }
                        className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm"
                      >
                        {TIER_CATALOG.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {tier.addons.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          tier.addons.map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-medium text-[#9a3412]"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              {ADDON_CATALOG[a].name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "ghost"}
                        disabled={!dirty || save.isPending}
                        onClick={() =>
                          save.mutate({ orgId: r.organization_id, tier: draft })
                        }
                      >
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {dirty ? "Apply" : "Saved"}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───── Payment skeleton ─────────────────────────────────────────────────────

function PaymentSkeletonSection() {
  const kpisFn = useServerFn(getExecKpis);
  const kpisQ = useQuery({ queryKey: ["hive-exec-kpis"], queryFn: () => kpisFn() });
  const mrr = kpisQ.data?.mrr_cents ?? 0;

  return (
    <section className="rounded-xl border border-dashed border-[#fed7aa] bg-[#fffdf7] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#fed7aa] text-[#7a4a0a]">
          <Wrench className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold">Payment processing — coming soon</h3>
          <p className="text-xs text-muted-foreground">
            Tier assignment is live today. Payment collection, invoices, and MRR roll-up
            will plug in here without changing tier behavior.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SkeletonCard
          icon={TrendingUp}
          title="MRR roll-up"
          value={fmtMoney(mrr)}
          note="Currently sums org_subscriptions.mrr_cents. Real billing will replace this with the payment provider total."
        />
        <SkeletonCard
          icon={Receipt}
          title="Invoices"
          value="—"
          note="Invoice ledger, line items, and PDF receipts."
        />
        <SkeletonCard
          icon={CreditCard}
          title="Payment methods"
          value="—"
          note="Card / ACH on file per company; dunning for past-due accounts."
        />
      </div>
    </section>
  );
}

function SkeletonCard({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: typeof TrendingUp;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums text-[#0f1b3d]">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
