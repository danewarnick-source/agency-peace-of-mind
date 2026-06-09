import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/automation-rules")({
  head: () => ({ meta: [{ title: "Automation Rules — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <AutomationRulesPage />
    </RequirePermission>
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type AppliesTo = "employee" | "client";
type TriggerType = "service_code" | "role" | "keyword" | "data_present";
type ActionType = "enable_feature" | "create_draft" | "seed_record" | "activate_requirements";
type TargetModule =
  | "time_clock" | "daily_logs" | "med_mgmt" | "incident_reporting" | "behavior_plan"
  | "compliance_track" | "training" | "eligibility" | "driver_credential" | "requirements";

type Rule = {
  id: string;
  org_id: string;
  applies_to: AppliesTo;
  trigger_type: TriggerType;
  trigger_value: string;
  action_type: ActionType;
  target_module: TargetModule;
  default_state: "active" | "draft";
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

const MODULE_LABELS: Record<TargetModule, string> = {
  time_clock: "Time Clock",
  daily_logs: "Daily Logs",
  med_mgmt: "Medication Management",
  incident_reporting: "Incident Reporting",
  behavior_plan: "Behavior Plan",
  compliance_track: "Compliance Track",
  training: "Training",
  eligibility: "Eligibility",
  driver_credential: "Driver Credential",
  requirements: "Role Requirements",
};

const ACTION_LABELS: Record<ActionType, string> = {
  enable_feature: "Enable feature",
  create_draft: "Create draft",
  seed_record: "Seed record",
  activate_requirements: "Activate requirements",
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  service_code: "Service code",
  role: "Role",
  keyword: "Keyword",
  data_present: "Data present",
};

type Draft = Omit<Rule, "id" | "org_id" | "created_at" | "is_active"> & { id?: string; is_active?: boolean };

const emptyClient: Draft = {
  applies_to: "client",
  trigger_type: "service_code",
  trigger_value: "",
  action_type: "enable_feature",
  target_module: "time_clock",
  default_state: "active",
  notes: "",
};
const emptyEmployee: Draft = {
  applies_to: "employee",
  trigger_type: "role",
  trigger_value: "",
  action_type: "activate_requirements",
  target_module: "requirements",
  default_state: "active",
  notes: "",
};

function AutomationRulesPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | AppliesTo>("all");
  const [editing, setEditing] = useState<Draft | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["provisioning_rules", org?.organization_id],
    enabled: !!org?.organization_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("provisioning_rules")
        .select("*")
        .eq("org_id", org!.organization_id)
        .order("applies_to", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Rule[];
    },
  });

  const filtered = useMemo(() => {
    if (!rules) return [];
    if (filter === "all") return rules;
    return rules.filter((r) => r.applies_to === filter);
  }, [rules, filter]);

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sb.from("provisioning_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["provisioning_rules", org?.organization_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRule = useMutation({
    mutationFn: async (d: Draft) => {
      if (d.id) {
        const { error } = await sb
          .from("provisioning_rules")
          .update({
            applies_to: d.applies_to,
            trigger_type: d.trigger_type,
            trigger_value: d.trigger_value.trim(),
            action_type: d.action_type,
            target_module: d.target_module,
            default_state: d.default_state,
            notes: d.notes || null,
          })
          .eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("provisioning_rules").insert({
          org_id: org!.organization_id,
          applies_to: d.applies_to,
          trigger_type: d.trigger_type,
          trigger_value: d.trigger_value.trim(),
          action_type: d.action_type,
          target_module: d.target_module,
          default_state: d.default_state,
          is_active: true,
          notes: d.notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing?.id ? "Rule updated" : "Rule added");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["provisioning_rules", org?.organization_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/dashboard/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ ...emptyEmployee })}>
            <Plus className="mr-2 h-4 w-4" /> Add employee rule
          </Button>
          <Button onClick={() => setEditing({ ...emptyClient })}>
            <Plus className="mr-2 h-4 w-4" /> Add client rule
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Automation Rules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              These tell NECTAR what to set up when it imports. You stay in control — nothing is created
              without your review, and nothing here ever blocks scheduling or access.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="employee">Employee</TabsTrigger>
          <TabsTrigger value="client">Client</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Applies to</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target module</th>
                <th className="px-4 py-3">Default state</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No rules yet for this view.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Badge variant={r.applies_to === "employee" ? "outline" : "secondary"}>{r.applies_to}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{TRIGGER_LABELS[r.trigger_type]}</span>
                      <span className="font-medium">{r.trigger_value}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{ACTION_LABELS[r.action_type]}</td>
                  <td className="px-4 py-3">{MODULE_LABELS[r.target_module] ?? r.target_module}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.default_state === "active" ? "default" : "secondary"}>{r.default_state}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({
                      id: r.id,
                      applies_to: r.applies_to,
                      trigger_type: r.trigger_type,
                      trigger_value: r.trigger_value,
                      action_type: r.action_type,
                      target_module: r.target_module,
                      default_state: r.default_state,
                      notes: r.notes ?? "",
                    })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit rule" : "Add rule"}</DialogTitle>
            <DialogDescription>
              When NECTAR sees the trigger in an imported document, it will take this action on the target module.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Applies to</Label>
                <Select value={editing.applies_to} onValueChange={(v) => setEditing({ ...editing, applies_to: v as AppliesTo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Trigger type</Label>
                  <Select value={editing.trigger_type} onValueChange={(v) => setEditing({ ...editing, trigger_type: v as TriggerType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service_code">Service code</SelectItem>
                      <SelectItem value="role">Role</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                      <SelectItem value="data_present">Data present</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Trigger value</Label>
                  <Input value={editing.trigger_value} onChange={(e) => setEditing({ ...editing, trigger_value: e.target.value })} placeholder="e.g. DSI, certification, any" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Action</Label>
                  <Select value={editing.action_type} onValueChange={(v) => setEditing({ ...editing, action_type: v as ActionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enable_feature">Enable feature</SelectItem>
                      <SelectItem value="create_draft">Create draft</SelectItem>
                      <SelectItem value="seed_record">Seed record</SelectItem>
                      <SelectItem value="activate_requirements">Activate requirements</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Target module</Label>
                  <Select value={editing.target_module} onValueChange={(v) => setEditing({ ...editing, target_module: v as TargetModule })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(MODULE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Default state</Label>
                <Select value={editing.default_state} onValueChange={(v) => setEditing({ ...editing, default_state: v as Rule["default_state"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Notes (optional)</Label>
                <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() => editing && saveRule.mutate(editing)}
              disabled={saveRule.isPending || !editing?.trigger_value.trim()}
            >
              {saveRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing?.id ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
