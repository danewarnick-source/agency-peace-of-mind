// Per-client chore-support activation gate.
// - RHS/HHS clients: chores are ON by default because the client is linked
//   to a home's chart directly (chore_space_clients seeded from the home).
//   That path never renders this component.
// - DSI / SLH / SLN / other client-profile entry: OFF until a manager
//   activates it, with a reason (pcsp_goal | intake_need | manual) and
//   optional goal reference. PCSP-linked activations surface as required
//   tracking tied to a formal plan goal.
//
// PCSP goals are currently stored as an unstructured text[] on
// clients.pcsp_goals (no stable per-goal IDs), so activation captures a
// free-text goal reference here. When a proper pcsp_goals table exists,
// swap goal_note for a real FK.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, ShieldCheck, PowerOff } from "lucide-react";
import { toast } from "sonner";

export type ChoreSupportRow = {
  id: string;
  client_id: string;
  organization_id: string;
  status: "off" | "active";
  reason: "pcsp_goal" | "intake_need" | "manual" | null;
  goal_note: string | null;
  activated_at: string | null;
};

export function useChoreSupport(clientId: string) {
  return useQuery({
    enabled: !!clientId,
    queryKey: ["chore-support", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_chore_support")
        .select("id, client_id, organization_id, status, reason, goal_note, activated_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data as ChoreSupportRow | null) ?? null;
    },
  });
}

const REASONS: { v: ChoreSupportRow["reason"]; label: string; hint: string }[] = [
  { v: "pcsp_goal", label: "PCSP goal", hint: "Required tracking tied to a formal plan goal." },
  { v: "intake_need", label: "Intake-identified need", hint: "Support need surfaced at intake — proof of support offered." },
  { v: "manual", label: "Manual (manager)", hint: "Manager toggled on for this client." },
];

/**
 * Gates the client's chore chart. Renders `children` only when active.
 * When off/missing, renders activation UI (manager) or a quiet notice.
 */
export function ChoreSupportGate({
  clientId,
  children,
}: {
  clientId: string;
  children: React.ReactNode;
}) {
  const { data: org } = useCurrentOrg();
  const { session } = useAuth();
  const qc = useQueryClient();
  const supportQ = useChoreSupport(clientId);
  const canEdit = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  const [reason, setReason] = useState<ChoreSupportRow["reason"]>("intake_need");
  const [goalNote, setGoalNote] = useState("");

  const activate = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id) throw new Error("No organization.");
      const payload = {
        client_id: clientId,
        organization_id: org.organization_id,
        status: "active" as const,
        reason,
        goal_note: goalNote.trim() || null,
        activated_by: session?.user?.id ?? null,
        activated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("client_chore_support")
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chore support activated");
      qc.invalidateQueries({ queryKey: ["chore-support", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_chore_support")
        .update({ status: "off" })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chore support turned off");
      qc.invalidateQueries({ queryKey: ["chore-support", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (supportQ.isLoading) return null;
  const row = supportQ.data;
  const active = row?.status === "active";

  if (active) {
    return (
      <div className="space-y-3">
        <ActivationBanner row={row!} canEdit={canEdit} onTurnOff={() => deactivate.mutate()} />
        {children}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Chore chart
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Chore support isn't active for this client. For DSI / SLH / SLN,
          activate it when identified as a client need — via PCSP goal, intake
          assessment, or manager judgment.
        </p>
        {canEdit ? (
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={reason ?? "intake_need"} onValueChange={(v) => setReason(v as ChoreSupportRow["reason"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.v ?? "manual"} value={r.v ?? "manual"}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {REASONS.find((r) => r.v === reason)?.hint}
              </p>
            </div>
            <div>
              <Label>
                {reason === "pcsp_goal" ? "PCSP goal reference" : "Note (optional)"}
              </Label>
              <Textarea
                value={goalNote}
                onChange={(e) => setGoalNote(e.target.value)}
                placeholder={
                  reason === "pcsp_goal"
                    ? "Paste or reference the PCSP goal text (e.g. 'Independent living — kitchen chores 3x/wk')"
                    : "Optional context"
                }
                rows={3}
              />
            </div>
            <Button
              onClick={() => activate.mutate()}
              disabled={activate.isPending}
              className="gap-1"
            >
              <ShieldCheck className="h-4 w-4" /> Activate chore support
            </Button>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Ask a manager to activate chore support for this client.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActivationBanner({
  row,
  canEdit,
  onTurnOff,
}: {
  row: ChoreSupportRow;
  canEdit: boolean;
  onTurnOff: () => void;
}) {
  const label =
    row.reason === "pcsp_goal" ? "PCSP-linked · required tracking"
    : row.reason === "intake_need" ? "Intake-identified support need"
    : "Manager-activated";
  const tone = row.reason === "pcsp_goal" ? "default" : "outline";
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tone as "default" | "outline"} className="gap-1">
            <ShieldCheck className="h-3 w-3" /> {label}
          </Badge>
          {row.activated_at && (
            <span className="text-xs text-muted-foreground">
              activated {new Date(row.activated_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {row.goal_note && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{row.goal_note}</p>
        )}
      </div>
      {canEdit && (
        <Button size="sm" variant="ghost" onClick={onTurnOff} className="gap-1">
          <PowerOff className="h-3 w-3" /> Turn off
        </Button>
      )}
    </div>
  );
}
