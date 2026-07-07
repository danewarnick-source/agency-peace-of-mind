// Per-client meal-support activation gate.
// Mirror of ChoreSupportGate — same reason model, same UX. RHS/HHS clients
// bypass this gate (handled by the mount wrapper that reads authorized codes).
// DSI/SLH/SLN-only clients see this gate until a manager activates support
// with a reason (pcsp_goal | intake_need | manual) and optional goal reference.

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
import { Utensils, ShieldCheck, PowerOff } from "lucide-react";
import { toast } from "sonner";

export type MealSupportRow = {
  id: string;
  client_id: string;
  organization_id: string;
  status: "off" | "active";
  reason: "pcsp_goal" | "intake_need" | "manual" | null;
  goal_note: string | null;
  activated_at: string | null;
};

export function useMealSupport(clientId: string) {
  return useQuery({
    enabled: !!clientId,
    queryKey: ["meal-support", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meal_support")
        .select("id, client_id, organization_id, status, reason, goal_note, activated_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data as MealSupportRow | null) ?? null;
    },
  });
}

const REASONS: { v: MealSupportRow["reason"]; label: string; hint: string }[] = [
  { v: "pcsp_goal", label: "PCSP goal", hint: "Required tracking tied to a formal plan goal." },
  { v: "intake_need", label: "Intake-identified need", hint: "Support need surfaced at intake — proof of support offered." },
  { v: "manual", label: "Manual (manager)", hint: "Manager toggled on for this client." },
];

export function MealSupportGate({
  clientId,
  children,
}: {
  clientId: string;
  children: React.ReactNode;
}) {
  const { data: org } = useCurrentOrg();
  const { session } = useAuth();
  const qc = useQueryClient();
  const supportQ = useMealSupport(clientId);
  const canEdit = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  const [reason, setReason] = useState<MealSupportRow["reason"]>("intake_need");
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
        .from("client_meal_support")
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meal support activated");
      qc.invalidateQueries({ queryKey: ["meal-support", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_meal_support")
        .update({ status: "off" })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meal support turned off");
      qc.invalidateQueries({ queryKey: ["meal-support", clientId] });
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
          <Utensils className="h-4 w-4 text-primary" /> Meal planner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Meal support isn't active for this client. For DSI / SLH / SLN,
          activate it when identified as a client need — via PCSP goal, intake
          assessment, or manager judgment.
        </p>
        {canEdit ? (
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={reason ?? "intake_need"} onValueChange={(v) => setReason(v as MealSupportRow["reason"])}>
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
                    ? "Paste or reference the PCSP goal text (e.g. 'Nutrition — plan and shop for weekly meals')"
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
              <ShieldCheck className="h-4 w-4" /> Activate meal support
            </Button>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Ask a manager to activate meal support for this client.
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
  row: MealSupportRow;
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
