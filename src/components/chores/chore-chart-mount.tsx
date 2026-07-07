// Chore-chart mount helpers — find (or let a manager create) the
// chore_space tied to a home (team) or a client, then render the panel.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { ChoreChartPanel } from "./chore-chart-panel";

const TYPES = [
  { v: "rhs", label: "RHS — staffed home" },
  { v: "hhs", label: "HHS — host home" },
  { v: "slh", label: "SLH" },
  { v: "sln", label: "SLN" },
  { v: "family", label: "Family setting" },
  { v: "other", label: "Other" },
];

function useCanEdit() {
  const { data: org } = useCurrentOrg();
  return org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
}

/** Chore chart tied to a home (teams row). */
export function ChoreChartForTeam({
  teamId, teamName, teamSetting, readOnly,
}: {
  teamId: string;
  teamName: string;
  teamSetting: string | null;
  readOnly?: boolean;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { session } = useAuth();
  const canEdit = useCanEdit() && !readOnly;
  const qc = useQueryClient();

  const spaceQ = useQuery({
    enabled: !!teamId,
    queryKey: ["chore-space-by-team", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_spaces")
        .select("id")
        .eq("team_id", teamId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization.");
      const type =
        teamSetting === "host-home" ? "hhs"
        : teamSetting === "slh" ? "slh"
        : teamSetting === "residential" ? "rhs"
        : "other";
      const { data, error } = await supabase
        .from("chore_spaces")
        .insert({
          organization_id: orgId,
          team_id: teamId,
          name: teamName,
          space_type: type,
          created_by: session?.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chore-space-by-team", teamId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (spaceQ.isLoading) return null;
  if (!spaceQ.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Chore chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                No chore chart for this home yet. Create one to start posting the rotation.
              </p>
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending}
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Create chore chart
              </Button>
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No chore chart yet for this home. Ask a manager to set one up.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
  return <ChoreChartPanel spaceId={spaceQ.data.id} readOnly={readOnly} />;
}

/** Chore charts a client belongs to. May be zero or more spaces. */
export function ChoreChartForClient({
  clientId, readOnly,
}: {
  clientId: string;
  readOnly?: boolean;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { session } = useAuth();
  const canEdit = useCanEdit() && !readOnly;
  const qc = useQueryClient();

  const spacesQ = useQuery({
    enabled: !!clientId,
    queryKey: ["chore-spaces-for-client", clientId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("chore_space_clients")
        .select("space_id")
        .eq("client_id", clientId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.space_id);
      if (!ids.length) return [] as { id: string; name: string; space_type: string }[];
      const { data: spaces, error: e2 } = await supabase
        .from("chore_spaces")
        .select("id, name, space_type")
        .in("id", ids);
      if (e2) throw e2;
      return (spaces ?? []) as { id: string; name: string; space_type: string }[];
    },
  });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("slh");

  const createFor = useMutation({
    mutationFn: async (v: { name: string; type: string }) => {
      if (!orgId) throw new Error("No organization.");
      const { data: space, error } = await supabase
        .from("chore_spaces")
        .insert({
          organization_id: orgId,
          name: v.name,
          space_type: v.type,
          created_by: session?.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("chore_space_clients").insert({
        space_id: space.id,
        client_id: clientId,
      });
      if (e2) throw e2;
      return space.id as string;
    },
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["chore-spaces-for-client", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (spacesQ.isLoading) return null;
  const spaces = spacesQ.data ?? [];

  return (
    <div className="space-y-4">
      {spaces.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Chore chart
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This client isn't linked to a chore chart yet. If they live in an SLH/SLN or family setting, create a chart just for them; if they live in a home you manage, link the home's chart on the home page.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <Label>Chart name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jamie's apartment" />
                  </div>
                  <div className="w-48">
                    <Label>Setting</Label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!newName.trim() || createFor.isPending}
                    onClick={() => createFor.mutate({ name: newName.trim(), type: newType })}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" /> Create
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">No chore chart yet.</p>
            )}
          </CardContent>
        </Card>
      )}
      {spaces.map((s) => (
        <ChoreChartPanel key={s.id} spaceId={s.id} readOnly={readOnly} />
      ))}
    </div>
  );
}
