import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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

type Rule = {
  id: string;
  org_id: string;
  trigger_type: "service_code" | "keyword" | "data_present";
  trigger_value: string;
  action_type: "enable_feature" | "create_draft" | "seed_record";
  target_module: "time_clock" | "daily_logs" | "med_mgmt" | "incident_reporting" | "behavior_plan";
  default_state: "active" | "draft";
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

const MODULE_LABELS: Record<Rule["target_module"], string> = {
  time_clock: "Time Clock",
  daily_logs: "Daily Logs",
  med_mgmt: "Medication Management",
  incident_reporting: "Incident Reporting",
  behavior_plan: "Behavior Plan",
};

const ACTION_LABELS: Record<Rule["action_type"], string> = {
  enable_feature: "Enable feature",
  create_draft: "Create draft",
  seed_record: "Seed record",
};

const TRIGGER_LABELS: Record<Rule["trigger_type"], string> = {
  service_code: "Service code",
  keyword: "Keyword",
  data_present: "Data present",
};

type Draft = Omit<Rule, "id" | "org_id" | "created_at" | "is_active"> & { id?: string; is_active?: boolean };

const emptyDraft: Draft = {
  trigger_type: "service_code",
  trigger_value: "",
  action_type: "enable_feature",
  target_module: "time_clock",
  default_state: "active",
  notes: "",
};

function AutomationRulesPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["provisioning_rules", org?.organization_id],
    enabled: !!org?.organization_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("provisioning_rules")
        .select("*")
        .eq("org_id", org!.organization_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Rule[];
    },
  });

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
        <Button onClick={() => setEditing({ ...emptyDraft })}>
          <Plus className="mr-2 h-4 w-4" /> Add rule
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Automation Rules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              These rules tell NECTAR what to set up automatically when it imports a document. You stay in
              control — every rule can be turned off or edited, and nothing is created without your review.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              )}
              {!isLoading && rules?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No rules yet. Click "Add rule" to create one.</td></tr>
              )}
              {rules?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{TRIGGER_LABELS[r.trigger_type]}</span>
                      <span className="font-medium">{r.trigger_value}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{ACTION_LABELS[r.action_type]}</td>
                  <td className="px-4 py-3">{MODULE_LABELS[r.target_module]}</td>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Trigger type</Label>
                  <Select value={editing.trigger_type} onValueChange={(v) => setEditing({ ...editing, trigger_type: v as Rule["trigger_type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service_code">Service code</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                      <SelectItem value="data_present">Data present</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Trigger value</Label>
                  <Input value={editing.trigger_value} onChange={(e) => setEditing({ ...editing, trigger_value: e.target.value })} placeholder="e.g. DSI" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Action</Label>
                  <Select value={editing.action_type} onValueChange={(v) => setEditing({ ...editing, action_type: v as Rule["action_type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enable_feature">Enable feature</SelectItem>
                      <SelectItem value="create_draft">Create draft</SelectItem>
                      <SelectItem value="seed_record">Seed record</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Target module</Label>
                  <Select value={editing.target_module} onValueChange={(v) => setEditing({ ...editing, target_module: v as Rule["target_module"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_clock">Time Clock</SelectItem>
                      <SelectItem value="daily_logs">Daily Logs</SelectItem>
                      <SelectItem value="med_mgmt">Medication Management</SelectItem>
                      <SelectItem value="incident_reporting">Incident Reporting</SelectItem>
                      <SelectItem value="behavior_plan">Behavior Plan</SelectItem>
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
