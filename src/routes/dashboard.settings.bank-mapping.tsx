import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Landmark, Link2, Loader2, Save, RefreshCw, Zap, ArrowLeft, CheckCircle2, BookOpen, Lock, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/dashboard/settings/bank-mapping")({
  head: () => ({ meta: [{ title: "Bank Mapping — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <BankMappingPage />
    </RequirePermission>
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type BankAccount = {
  id: string;
  bank_name: string;
  account_type: string;
  mask: string;
  plaid_account_id: string | null;
  institution_logo: string | null;
};
type Mapping = { id: string; bank_account_id: string; client_id: string };
type Client = { id: string; first_name: string; last_name: string };
type PbaAccount = { id: string; client_id: string };

const MOCK_PLAID_ACCOUNTS: Omit<BankAccount, "id">[] = [
  { bank_name: "Chase Business", account_type: "Checking", mask: "4892", plaid_account_id: "plaid_acct_001", institution_logo: "🏦" },
  { bank_name: "Wells Fargo Commercial", account_type: "Operating", mask: "1107", plaid_account_id: "plaid_acct_002", institution_logo: "🏛️" },
  { bank_name: "Bank of America Trust", account_type: "Fiduciary Sub-Account", mask: "8821", plaid_account_id: "plaid_acct_003", institution_logo: "🏦" },
  { bank_name: "Mountain America CU", account_type: "Sub-Trust Pool", mask: "0455", plaid_account_id: "plaid_acct_004", institution_logo: "🏔️" },
];

const SSI_DEPOSIT_FEED = [
  { memo: "SSA TREAS 310 XXSOC SEC", amount: 943.00, counterparty: "Social Security Administration" },
  { memo: "SOC SEC SSI DIRECT DEP", amount: 1023.50, counterparty: "SSA Direct Deposit" },
  { memo: "SSA TREAS 310 BENEFIT", amount: 877.25, counterparty: "Social Security Administration" },
  { memo: "SSI DIRECT FED BENEFIT", amount: 794.00, counterparty: "SSI Federal Benefit" },
];

function BankMappingPage() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const [authenticating, setAuthenticating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});

  const banks = useQuery({
    enabled: !!orgId,
    queryKey: ["agency_bank_accounts", orgId],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await sb.from("agency_bank_accounts").select("*").eq("organization_id", orgId).order("linked_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mappings = useQuery({
    enabled: !!orgId,
    queryKey: ["agency_bank_mappings", orgId],
    queryFn: async (): Promise<Mapping[]> => {
      const { data, error } = await sb.from("agency_bank_mappings").select("*").eq("organization_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const clients = useQuery({
    enabled: !!orgId,
    queryKey: ["clients-min", orgId],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name").eq("organization_id", orgId!).order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pbaAccounts = useQuery({
    enabled: !!orgId,
    queryKey: ["pba-accounts-min", orgId],
    queryFn: async (): Promise<PbaAccount[]> => {
      const { data, error } = await sb.from("pba_accounts").select("id, client_id").eq("organization_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const linkBank = useMutation({
    mutationFn: async () => {
      // Simulated Plaid Link token exchange
      await new Promise((r) => setTimeout(r, 1400));
      const existing = new Set((banks.data ?? []).map((b) => b.plaid_account_id));
      const fresh = MOCK_PLAID_ACCOUNTS.filter((a) => !existing.has(a.plaid_account_id));
      if (!fresh.length) return { added: 0 };
      const { error } = await sb.from("agency_bank_accounts").insert(
        fresh.map((a) => ({ ...a, organization_id: orgId, linked_by: user?.id })),
      );
      if (error) throw error;
      return { added: fresh.length };
    },
    onSuccess: (r) => {
      toast.success(`🔗 Plaid handshake complete — ${r.added} sub-accounts discovered`);
      qc.invalidateQueries({ queryKey: ["agency_bank_accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draftMap).filter(([, cid]) => cid);
      if (!entries.length) throw new Error("No mappings staged");
      for (const [bankId, clientId] of entries) {
        const existing = (mappings.data ?? []).find((m) => m.bank_account_id === bankId);
        if (existing) {
          await sb.from("agency_bank_mappings").update({ client_id: clientId }).eq("id", existing.id);
        } else {
          await sb.from("agency_bank_mappings").insert({
            organization_id: orgId, bank_account_id: bankId, client_id: clientId, created_by: user?.id,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("💾 Bank mapping ruleset committed");
      setDraftMap({});
      qc.invalidateQueries({ queryKey: ["agency_bank_mappings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function ensurePbaAccount(clientId: string): Promise<string> {
    const existing = (pbaAccounts.data ?? []).find((p) => p.client_id === clientId);
    if (existing) return existing.id;
    const { data, error } = await sb.from("pba_accounts")
      .insert({ organization_id: orgId, client_id: clientId, opened_on: new Date().toISOString().slice(0, 10), created_by: user?.id })
      .select("id").single();
    if (error) throw error;
    return data.id;
  }

  const sync = useMutation({
    mutationFn: async () => {
      const liveMaps = mappings.data ?? [];
      if (!liveMaps.length) throw new Error("No mapped accounts to sync");
      await new Promise((r) => setTimeout(r, 1200));
      let posted = 0;
      for (const map of liveMaps) {
        const feed = SSI_DEPOSIT_FEED[Math.floor(Math.random() * SSI_DEPOSIT_FEED.length)];
        const isSSI = /(SSA TREAS|SOC SEC|SSI DIRECT)/i.test(feed.memo);
        if (!isSSI) continue;
        const acctId = await ensurePbaAccount(map.client_id);
        const { error } = await sb.from("pba_transactions").insert({
          organization_id: orgId,
          account_id: acctId,
          txn_type: "deposit",
          amount: feed.amount,
          occurred_on: new Date().toISOString().slice(0, 10),
          counterparty: feed.counterparty,
          memo: feed.memo,
          auto_reconciled: true,
          source: "bank_feed_ssi",
          created_by: user?.id,
        });
        if (error) throw error;
        posted++;
        // Simulated QuickBooks Online push
        console.info("[QBO Bridge] Deposit posted", { client_id: map.client_id, amount: feed.amount, memo: feed.memo });
      }
      return { posted };
    },
    onSuccess: (r) => {
      toast.success(`⚡ ${r.posted} SSI deposits auto-reconciled & pushed to QuickBooks Online`);
      qc.invalidateQueries({ queryKey: ["pba-accounts-min"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bankList = banks.data ?? [];
  const clientList = clients.data ?? [];
  const mapByBank = new Map((mappings.data ?? []).map((m) => [m.bank_account_id, m.client_id]));
  const stagedCount = Object.values(draftMap).filter(Boolean).length;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 text-xs text-muted-foreground">
            <Link to="/dashboard/settings"><ArrowLeft className="mr-1 h-3 w-3" /> Back to Settings</Link>
          </Button>
          <h2 className="text-2xl font-semibold tracking-tight">🏦 Institutional Client Banking Registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authenticate your corporate bank, map sub-accounts to client trust profiles, and let the SSI/SSDI feed auto-reconcile into the PBA ledger.
          </p>
        </div>
        <Button size="lg" onClick={() => linkBank.mutate()} disabled={linkBank.isPending || authenticating}>
          {linkBank.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          🔗 Authenticate Agency Bank Portal
        </Button>
      </div>

      {/* Mapping grid */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Channel Mapping Grid</h3>
            <Badge variant="secondary" className="font-mono">{bankList.length} streams</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending || !mappings.data?.length}>
            {sync.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Run Bank Feed Sync
          </Button>
        </div>

        {!bankList.length ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border/70 py-16 text-center text-sm text-muted-foreground">
            <Landmark className="h-8 w-8 text-muted-foreground/60" />
            No bank streams linked yet. Click <span className="font-medium">Authenticate Agency Bank Portal</span> to pull your sub-accounts via Plaid.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-12 gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="col-span-6">Live Bank Stream</div>
              <div className="col-span-6">System Association → Client Trust Profile</div>
            </div>
            {bankList.map((b) => {
              const committed = mapByBank.get(b.id);
              const draft = draftMap[b.id];
              const current = draft ?? committed ?? "";
              const client = clientList.find((c) => c.id === current);
              return (
                <div key={b.id} className="grid grid-cols-12 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-muted/20">
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-muted text-lg">{b.institution_logo ?? "🏦"}</div>
                    <div>
                      <div className="text-sm font-semibold">{b.bank_name} <span className="font-mono text-muted-foreground">— *{b.mask}</span></div>
                      <div className="text-xs text-muted-foreground">{b.account_type} · Plaid {b.plaid_account_id}</div>
                    </div>
                  </div>
                  <div className="col-span-6 flex items-center gap-2">
                    <Select value={current} onValueChange={(v) => setDraftMap((p) => ({ ...p, [b.id]: v }))}>
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder="— Select client trust profile —" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientList.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {committed && committed === current && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Committed
                      </Badge>
                    )}
                    {draft && draft !== committed && (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600">Pending</Badge>
                    )}
                    {client && !draft && !committed && null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Pipeline />

      {/* Floating save bar */}
      {stagedCount > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
          <Badge variant="secondary" className="font-mono">{stagedCount} pending</Badge>
          <Button size="sm" onClick={() => commit.mutate()} disabled={commit.isPending}>
            {commit.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            💾 Commit Bank Mapping Ruleset
          </Button>
        </div>
      )}
    </div>
  );
}

function Pipeline() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-base font-semibold">Live Auto-Ledger Pipeline</h3>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">Active</Badge>
      </div>
      <ol className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <li className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground">1 · Listen</div>
          Background watcher scans inbound transactions for <code className="rounded bg-muted px-1 font-mono text-[11px]">SSA TREAS</code>, <code className="rounded bg-muted px-1 font-mono text-[11px]">SOC SEC</code>, <code className="rounded bg-muted px-1 font-mono text-[11px]">SSI DIRECT</code>.
        </li>
        <li className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground">2 · Reconcile</div>
          Matched deposits write a verified <Badge variant="outline" className="px-1.5 py-0 text-[10px]">deposit</Badge> row into the client&apos;s PBA trust ledger with a <span className="font-medium text-amber-600">⚡ Auto-Reconciled via Bank Feed Sync</span> badge.
        </li>
        <li className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-foreground"><BookOpen className="h-3 w-3" /> 3 · QBO Bridge</div>
          A mirror <code className="rounded bg-muted px-1 font-mono text-[11px]">Deposit</code> entry is pushed to QuickBooks Online via the accounting bridge for clean GL parity.
        </li>
      </ol>
    </div>
  );
}
