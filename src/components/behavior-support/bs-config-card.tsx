import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Brain } from "lucide-react";
import { toast } from "sonner";
import {
  BC_CONFIG, TIER_RANK, evaluateCredentialMatch, type BcCode,
} from "@/lib/behavior-support";

type Behaviorist = { id: string; full_name: string | null; email: string | null; bc_role: BcCode };

type BscRow = {
  id: string;
  client_id: string;
  bc_code: BcCode;
  features_enabled: boolean;
  assigned_behaviorist_user_id: string | null;
};

export function BehaviorSupportConfigCard({
  clientId, organizationId, clientName,
}: { clientId: string; organizationId: string; clientName: string }) {
  const qc = useQueryClient();

  // Current per-client config (may not exist yet)
  const { data: bsc, isLoading: bscLoading } = useQuery<BscRow | null>({
    queryKey: ["behavior_support_clients", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("behavior_support_clients")
        .select("id, client_id, bc_code, features_enabled, assigned_behaviorist_user_id")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data as BscRow | null) ?? null;
    },
  });

  // Eligible behaviorists in this org (bc_role is set)
  const { data: behaviorists = [] } = useQuery<Behaviorist[]>({
    queryKey: ["org-behaviorists", organizationId],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("organization_members")
        .select("user_id, profiles:profiles(id, full_name, email, bc_role)")
        .eq("organization_id", organizationId)
        .eq("active", true);
      if (error) throw error;
      const out: Behaviorist[] = [];
      for (const m of members ?? []) {
        const p = (m as any).profiles;
        if (p?.bc_role) out.push({ id: p.id, full_name: p.full_name, email: p.email, bc_role: p.bc_role });
      }
      return out;
    },
  });

  // Local editable state — initialize from row (defaults BC1 / off / unassigned)
  const [code, setCode] = useState<BcCode>("BC1");
  const [enabled, setEnabled] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  useEffect(() => {
    if (bsc) {
      setCode(bsc.bc_code);
      setEnabled(bsc.features_enabled);
      setAssigneeId(bsc.assigned_behaviorist_user_id);
    }
  }, [bsc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignee = useMemo(
    () => behaviorists.find((b) => b.id === assigneeId) ?? null,
    [behaviorists, assigneeId],
  );

  const match = useMemo(
    () => evaluateCredentialMatch(code, assignee?.bc_role ?? null),
    [code, assignee],
  );

  const spec = BC_CONFIG[code];

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Upsert config row
      const payload = {
        organization_id: organizationId,
        client_id: clientId,
        bc_code: code,
        features_enabled: enabled,
        assigned_behaviorist_user_id: assigneeId,
      };
      const { data, error } = await supabase
        .from("behavior_support_clients")
        .upsert(payload, { onConflict: "client_id" })
        .select()
        .single();
      if (error) throw error;

      // Warn-and-log: write a bc_flags row when credentials are below required tier
      if (assigneeId && !match.ok) {
        await supabase.from("bc_flags").insert({
          organization_id: organizationId,
          client_id: clientId,
          flag_type: "credential_mismatch",
          detail: match.reason,
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["behavior_support_clients", clientId] });
      toast.success("Behavior Support configuration saved.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save configuration."),
  });

  if (bscLoading) {
    return <p className="text-sm text-muted-foreground">Loading Behavior Support configuration…</p>;
  }

  return (
    <Card className="border-2">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[color:var(--teal-700,#137182)]" />
          <CardTitle className="text-base">Behavior Support</CardTitle>
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">{clientName}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Optional, gated module. HIVE tracks deliverables; the provider/clinician owns all clinical content.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* BC code tiles */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">BC code</Label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {(["BC1", "BC2", "BC3"] as BcCode[]).map((c) => {
              const s = BC_CONFIG[c];
              const selected = code === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCode(c)}
                  className={`relative min-h-[64px] rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? `${s.tile.bg} ${s.tile.fg} ring-2 ${s.tile.ring} border-transparent`
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  <div className="text-sm font-bold">{c}</div>
                  <div className="text-[11px] leading-tight opacity-80">{s.severity}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Master switch */}
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Show HIVE Behavior Support features for this client</p>
            <p className="text-xs text-muted-foreground">
              When off, the module is hidden for ALL roles. The code stays on file.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} className="mt-1" />
        </div>

        {!enabled && (
          <p className="flex items-start gap-1.5 rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5" /> Features are off — staff, behaviorist, and reports surfaces will not render for this client.
          </p>
        )}

        {/* Assigned behaviorist */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Assigned behaviorist</Label>
          <Select
            value={assigneeId ?? "__none"}
            onValueChange={(v) => setAssigneeId(v === "__none" ? null : v)}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Select an employee with a BC role…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Unassigned —</SelectItem>
              {behaviorists.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="font-medium">{b.full_name ?? b.email ?? b.id.slice(0, 8)}</span>
                  <span className="ml-2 text-[10px] font-mono text-muted-foreground">{b.bc_role}</span>
                </SelectItem>
              ))}
              {behaviorists.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No employees have a BC role set. Set bc_role on a profile to enable.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Credential match: warn-and-log */}
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            match.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
              : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          }`}
        >
          {match.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {match.ok ? "Credential match" : "Credential mismatch (warn-and-log)"}
            </div>
            <div className="opacity-90">{match.reason}</div>
            {!match.ok && assigneeId && (
              <div className="mt-0.5 text-[11px] opacity-80">
                You may proceed — saving will log a credential_mismatch flag in the audit trail.
              </div>
            )}
          </div>
        </div>

        {/* Requirements panel */}
        <div className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[color:var(--gold-600,#f5a623)]" />
            <h4 className="text-sm font-semibold">Requirements for {code}</h4>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div><dt className="font-semibold">Severity</dt><dd>{spec.severity}</dd></div>
            <div>
              <dt className="font-semibold">Required tier</dt>
              <dd>{spec.requiredTier}+ (rank {TIER_RANK[spec.requiredTier]}) — {match.ok ? "met" : "NOT met"}</dd>
            </div>
            <div><dt className="font-semibold">Oversight</dt><dd>{spec.oversight}</dd></div>
            <div><dt className="font-semibold">Review cadence</dt><dd>{spec.reviewCadence}</dd></div>
          </dl>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required items</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {spec.requiredItems.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deadlines</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {spec.deadlines.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-[11px] italic text-muted-foreground">
            HIVE tracks these — it doesn't define them. Confirm against the current Utah DSPD SOW.
            <br />
            <span className="not-italic font-mono opacity-70">{spec.sowSource}</span>
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="min-h-[44px]"
          >
            {saveMutation.isPending ? "Saving…" : "Save Behavior Support config"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
