import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listComplianceRules,
  proposeComplianceRule,
  updateComplianceRule,
  draftStaffPrerequisiteRules,
} from "@/lib/nectar-compliance.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, CheckCircle2, XCircle, Pencil, ShieldAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";

type Rule = {
  id: string;
  requirement_id: string;
  rule_type: string;
  rule_definition: { conflicting_codes?: string[]; scope?: string } & Record<string, unknown>;
  status: "proposed" | "confirmed" | "dismissed";
  proposed_rationale: string | null;
  confirmed_at: string | null;
  requirement: {
    title: string;
    original_title: string | null;
    original_description: string | null;
    description: string | null;
    source_citation: string | null;
    activation_state: string;
  } | null;
};

export function ComplianceRulesPanel({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listComplianceRules);
  const { data: rules = [] } = useQuery({
    queryKey: ["compliance-rules", organizationId],
    queryFn: () => list({ data: { organizationId } }),
  });

  const grouped = useMemo(() => {
    const g: Record<string, Rule[]> = { proposed: [], confirmed: [], dismissed: [] };
    for (const r of rules as Rule[]) g[r.status]?.push(r);
    return g;
  }, [rules]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["compliance-rules", organizationId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <h3 className="text-lg font-semibold">Compliance Rules</h3>
        <span className="text-sm text-muted-foreground">
          NECTAR proposes machine-checkable rules from your active requirements. You confirm, edit, or dismiss. Only confirmed rules whose source requirement is currently active can raise a flag.
        </span>
      </div>

      <Tabs defaultValue="proposed">
        <TabsList>
          <TabsTrigger value="proposed">
            Proposed <Badge variant="secondary" className="ml-2">{grouped.proposed.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Active <Badge variant="secondary" className="ml-2">{grouped.confirmed.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dismissed">
            Dismissed <Badge variant="secondary" className="ml-2">{grouped.dismissed.length}</Badge>
          </TabsTrigger>
        </TabsList>
        {(["proposed", "confirmed", "dismissed"] as const).map((k) => (
          <TabsContent key={k} value={k} className="space-y-3 mt-4">
            {grouped[k].length === 0 && (
              <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
                No {k} rules.
              </div>
            )}
            {grouped[k].map((r) => (
              <RuleRow key={r.id} rule={r} onChanged={refresh} />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <ProposeManualRule organizationId={organizationId} onCreated={refresh} />
    </div>
  );
}

function RuleRow({ rule, onChanged }: { rule: Rule; onChanged: () => void }) {
  const update = useServerFn(updateComplianceRule);
  const [editing, setEditing] = useState(false);
  const [codes, setCodes] = useState(
    (rule.rule_definition.conflicting_codes ?? []).join(", "),
  );
  const [scope, setScope] = useState(String(rule.rule_definition.scope ?? "same_client_day"));
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async (action: "edit" | "confirm" | "dismiss" | "reopen") => {
      const ruleDefinition =
        action === "confirm" || action === "edit"
          ? {
              conflicting_codes: codes
                .split(/[,\s]+/)
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean),
              scope,
            }
          : undefined;
      return update({ data: { ruleId: rule.id, action, ruleDefinition, note: note || undefined } });
    },
    onSuccess: () => {
      setEditing(false);
      setNote("");
      toast.success("Rule updated");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const req = rule.requirement;
  const activeReq = req && (req.activation_state === "active" || req.activation_state === "active_by_code");

  return (
    <div className="border rounded-md p-4 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" /> NECTAR proposed
            </Badge>
            <Badge variant="secondary" className="text-xs">{rule.rule_type}</Badge>
            {rule.status === "confirmed" && (
              <Badge className="bg-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge>
            )}
            {rule.status === "dismissed" && (
              <Badge variant="outline" className="text-xs"><XCircle className="h-3 w-3 mr-1" /> Dismissed</Badge>
            )}
            {req && !activeReq && rule.status === "confirmed" && (
              <Badge variant="outline" className="text-xs text-amber-600">
                Source inactive — sleeps
              </Badge>
            )}
          </div>
          <div className="mt-2 text-sm font-medium">
            Source: {req?.original_title ?? req?.title ?? "Requirement"}
          </div>
          <div className="text-xs text-muted-foreground italic mt-1 line-clamp-3">
            "{req?.original_description ?? req?.description ?? ""}"
          </div>
          {req?.source_citation && (
            <div className="text-xs text-muted-foreground mt-1">{req.source_citation}</div>
          )}
          {rule.proposed_rationale && (
            <div className="text-xs mt-2 text-muted-foreground">
              <span className="font-medium">NECTAR's reasoning:</span> {rule.proposed_rationale}
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase">Rule definition</div>
        {editing || rule.status === "proposed" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Conflicting codes (comma-separated)</label>
              <Input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="SLH, HHS" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Scope</label>
              <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="same_client_day" />
            </div>
          </div>
        ) : (
          <div className="text-sm">
            Codes: <span className="font-mono">{(rule.rule_definition.conflicting_codes ?? []).join(", ") || "—"}</span>
            <span className="ml-4">Scope: <span className="font-mono">{String(rule.rule_definition.scope ?? "same_client_day")}</span></span>
          </div>
        )}

        {(editing || rule.status === "proposed") && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note about your decision"
            className="text-sm"
            rows={2}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {rule.status === "proposed" && (
          <>
            <Button size="sm" onClick={() => mut.mutate("confirm")} disabled={mut.isPending}>
              Confirm rule
            </Button>
            <Button size="sm" variant="outline" onClick={() => mut.mutate("dismiss")} disabled={mut.isPending}>
              Dismiss
            </Button>
          </>
        )}
        {rule.status === "confirmed" && !editing && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => mut.mutate("dismiss")} disabled={mut.isPending}>
              Dismiss
            </Button>
          </>
        )}
        {rule.status === "confirmed" && editing && (
          <>
            <Button size="sm" onClick={() => mut.mutate("edit")} disabled={mut.isPending}>Save edit</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        )}
        {rule.status === "dismissed" && (
          <Button size="sm" variant="outline" onClick={() => mut.mutate("reopen")} disabled={mut.isPending}>
            Reopen (back to proposed)
          </Button>
        )}
      </div>
    </div>
  );
}

function ProposeManualRule({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [requirementId, setRequirementId] = useState("");
  const [codes, setCodes] = useState("");
  const propose = useServerFn(proposeComplianceRule);
  const mut = useMutation({
    mutationFn: async () =>
      propose({
        data: {
          organizationId,
          requirementId,
          ruleType: "billing_conflict",
          ruleDefinition: {
            conflicting_codes: codes.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
            scope: "same_client_day",
          },
          rationale: "Manually proposed by provider",
        },
      }),
    onSuccess: () => {
      toast.success("Rule proposed");
      setOpen(false);
      setRequirementId("");
      setCodes("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <div className="pt-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          + Propose a rule manually
        </Button>
      </div>
    );
  }
  return (
    <div className="border rounded-md p-4 space-y-2 bg-muted/30">
      <div className="text-sm font-medium">Propose billing-conflict rule</div>
      <Input placeholder="Source requirement UUID" value={requirementId} onChange={(e) => setRequirementId(e.target.value)} />
      <Input placeholder="Conflicting codes (e.g. SLH, HHS)" value={codes} onChange={(e) => setCodes(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => mut.mutate()} disabled={!requirementId || !codes || mut.isPending}>
          Propose
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
