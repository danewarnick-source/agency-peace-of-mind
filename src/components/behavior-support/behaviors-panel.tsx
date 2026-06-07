import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ShieldCheck, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type BehaviorRow = {
  id: string;
  name: string;
  operational_definition: string;
  data_method: string;
  bsp_citation: string;
  expected_cadence: string;
  status: "draft" | "approved" | "published" | "archived";
  source: "nectar" | "manual";
  last_logged_at: string | null;
};

type Role = "admin" | "behaviorist" | "staff";

const STATUS_STYLES: Record<BehaviorRow["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/40",
  published: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/40",
  archived: "bg-muted text-muted-foreground line-through",
};

export function BehaviorsPanel({
  clientId,
  organizationId,
  role,
}: {
  clientId: string;
  organizationId: string;
  role: Role;
}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: behaviors = [], isLoading } = useQuery<BehaviorRow[]>({
    queryKey: ["bc_behaviors", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_behaviors")
        .select("id, name, operational_definition, data_method, bsp_citation, expected_cadence, status, source, last_logged_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BehaviorRow[];
    },
  });

  const addManual = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bc_behaviors").insert({
        organization_id: organizationId,
        client_id: clientId,
        name: "New target behavior",
        operational_definition: "",
        data_method: "frequency",
        expected_cadence: "Every shift",
        status: "draft",
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bc_behaviors", clientId] });
      toast.success("Behavior added.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed."),
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading behaviors…</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Target behaviors</CardTitle>
        {role === "behaviorist" && (
          <Button size="sm" variant="outline" onClick={() => addManual.mutate()} className="min-h-[44px]">
            + Add behavior
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {behaviors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No behaviors yet.</p>
        ) : (
          behaviors.map((b) => (
            <BehaviorRowItem
              key={b.id}
              behavior={b}
              role={role}
              expanded={openId === b.id}
              onToggle={() => setOpenId(openId === b.id ? null : b.id)}
              clientId={clientId}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BehaviorRowItem({
  behavior,
  role,
  expanded,
  onToggle,
  clientId,
}: {
  behavior: BehaviorRow;
  role: Role;
  expanded: boolean;
  onToggle: () => void;
  clientId: string;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BehaviorRow>(behavior);

  const canEdit = role === "behaviorist" && behavior.status !== "published";
  const canApprove = role === "behaviorist" && behavior.status === "draft";
  const canPublish = role === "admin" && behavior.status === "approved";

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("bc_behaviors")
        .update({
          name: draft.name,
          operational_definition: draft.operational_definition,
          data_method: draft.data_method,
          expected_cadence: draft.expected_cadence,
          bsp_citation: draft.bsp_citation,
        })
        .eq("id", behavior.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bc_behaviors", clientId] });
      toast.success("Saved.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed."),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("bc_behaviors")
        .update({
          status: "approved",
          approved_by_user_id: u.user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", behavior.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bc_behaviors", clientId] });
      toast.success("Approved — awaiting admin sign-off.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Approve failed."),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("bc_behaviors")
        .update({
          status: "published",
          published_by_user_id: u.user?.id,
          published_at: new Date().toISOString(),
        })
        .eq("id", behavior.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bc_behaviors", clientId] });
      toast.success("Published — live for staff data collection.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed."),
  });

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/40"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{behavior.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {behavior.data_method} · {behavior.expected_cadence}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] font-mono uppercase ${STATUS_STYLES[behavior.status]}`}>
            {behavior.status}
          </Badge>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={!canEdit}
              className="min-h-[44px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Operational definition</Label>
            <Textarea
              value={draft.operational_definition}
              onChange={(e) => setDraft({ ...draft, operational_definition: e.target.value })}
              disabled={!canEdit}
              rows={3}
              placeholder="Observable, measurable description from the BSP."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Data method</Label>
              <Select
                value={draft.data_method || "frequency"}
                onValueChange={(v) => setDraft({ ...draft, data_method: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frequency">Frequency (count)</SelectItem>
                  <SelectItem value="duration">Duration (seconds)</SelectItem>
                  <SelectItem value="intensity">Intensity (1–5)</SelectItem>
                  <SelectItem value="abc">ABC narrative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Expected cadence</Label>
              <Select
                value={draft.expected_cadence || "Every shift"}
                onValueChange={(v) => setDraft({ ...draft, expected_cadence: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Every shift">Every shift</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Per occurrence">Per occurrence</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {behavior.bsp_citation && (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
              BSP citation: {behavior.bsp_citation}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending} className="min-h-[44px]">
                Save changes
              </Button>
            )}
            {canApprove && (
              <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending} className="min-h-[44px]">
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
              </Button>
            )}
            {canPublish && (
              <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending} className="min-h-[44px]">
                <ShieldCheck className="mr-1 h-4 w-4" /> Sign off &amp; publish
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
