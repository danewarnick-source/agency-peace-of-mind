import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { syncTeamToLocation } from "@/lib/scheduling/locations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  HeartHandshake,
  Home,
  Plus,
  Star,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/homes/$teamId")({
  head: () => ({ meta: [{ title: "Home details — HIVE" }] }),
  component: HomeDetailPage,
});

const SETTINGS = [
  { value: "residential", label: "RHS" },
  { value: "slh", label: "SLH" },
  { value: "host-home", label: "Host home" },
  { value: "day-program", label: "Day program" },
] as const;

const RATIO_OPTIONS: { staff: number; clients: number; label: string }[] = [
  { staff: 1, clients: 1, label: "1:1" },
  { staff: 1, clients: 2, label: "1:2" },
  { staff: 1, clients: 3, label: "1:3" },
  { staff: 1, clients: 4, label: "1:4" },
  { staff: 2, clients: 1, label: "2:1" },
];

type Team = {
  id: string;
  team_name: string;
  setting: string | null;
  organization_id: string | null;
};
type Client = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
};
type Staff = { id: string; name: string };
type Designation = { id: string; label: string; sort: number };
type Hsd = { id: string; team_id: string; staff_id: string; designation_id: string };
type Ratio = {
  client_id: string;
  ratio_staff: number;
  ratio_clients: number;
  effective_end: string | null;
};

function HomeDetailPage() {
  const { teamId } = Route.useParams();
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const syncLocationCall = useServerFn(syncTeamToLocation);

  const teamQ = useQuery({
    enabled: !!orgId && !!teamId,
    queryKey: ["home-detail", teamId],
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name, setting, organization_id" as never)
        .eq("id", teamId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Team) ?? null;
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["home-detail-clients", orgId],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, team_id, account_status")
        .eq("organization_id", orgId!)
        .order("last_name");
      if (error) throw error;
      return (data ?? [])
        .filter((c) => ((c.account_status as string) ?? "active") !== "archived")
        .map((c) => ({
          id: c.id as string,
          first_name: c.first_name as string,
          last_name: c.last_name as string,
          team_id: (c.team_id as string | null) ?? null,
        }));
    },
  });

  const staffQ = useQuery({
    enabled: !!orgId,
    queryKey: ["home-detail-staff", orgId],
    queryFn: async (): Promise<Staff[]> => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profs ?? [])
        .map((p) => ({
          id: p.id as string,
          name: (p.full_name as string) || (p.email as string) || "—",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const desigQ = useQuery({
    enabled: !!orgId,
    queryKey: ["home-detail-desig", orgId],
    queryFn: async (): Promise<Designation[]> => {
      const { data, error } = await supabase
        .from("home_designations")
        .select("id, label, sort")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as Designation[];
    },
  });

  const hsdQ = useQuery({
    enabled: !!orgId && !!teamId,
    queryKey: ["home-detail-hsd", teamId],
    queryFn: async (): Promise<Hsd[]> => {
      const { data, error } = await supabase
        .from("home_staff_designations")
        .select("id, team_id, staff_id, designation_id")
        .eq("team_id", teamId);
      if (error) throw error;
      return (data ?? []) as Hsd[];
    },
  });

  const ratiosQ = useQuery({
    enabled: !!orgId && !!clientsQ.data?.length,
    queryKey: ["home-detail-ratios", orgId],
    queryFn: async (): Promise<Map<string, Ratio>> => {
      const ids = (clientsQ.data ?? []).map((c) => c.id);
      if (!ids.length) return new Map();
      const { data, error } = await supabase
        .from("client_ratios")
        .select("client_id, ratio_staff, ratio_clients, effective_end, effective_start")
        .in("client_id", ids)
        .lte("effective_start", today);
      if (error) throw error;
      const map = new Map<string, Ratio>();
      for (const r of (data ?? []) as Ratio[]) {
        if (r.effective_end && r.effective_end < today) continue;
        map.set(r.client_id, r);
      }
      return map;
    },
  });

  // Mutations
  const updateHome = useMutation({
    mutationFn: async (patch: { team_name?: string; setting?: string }) => {
      const previousName = teamQ.data?.team_name;
      const { error } = await supabase
        .from("teams")
        .update(patch as never)
        .eq("id", teamId);
      if (error) throw error;
      if (orgId) {
        await syncLocationCall({
          data: { organizationId: orgId, teamId, previousName },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home-detail", teamId] });
      qc.invalidateQueries({ queryKey: ["ht-teams", orgId] });
      qc.invalidateQueries({ queryKey: ["locations", orgId] });
      toast.success("Home updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setClientHome = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      const { error } = await supabase
        .from("clients")
        .update({ team_id: v.team_id } as never)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home-detail-clients", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-clients", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertHsd = useMutation({
    mutationFn: async (v: { staff_id: string; designation_id: string }) => {
      const { error } = await supabase.from("home_staff_designations").upsert(
        {
          organization_id: orgId!,
          team_id: teamId,
          staff_id: v.staff_id,
          designation_id: v.designation_id,
        },
        { onConflict: "team_id,staff_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home-detail-hsd", teamId] });
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Care team updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeHsd = useMutation({
    mutationFn: async (staff_id: string) => {
      const { error } = await supabase
        .from("home_staff_designations")
        .delete()
        .eq("team_id", teamId)
        .eq("staff_id", staff_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home-detail-hsd", teamId] });
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Removed from care team");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRatio = useMutation({
    mutationFn: async (v: {
      client_id: string;
      ratio_staff: number;
      ratio_clients: number;
    }) => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yISO = yesterday.toISOString().slice(0, 10);
      await supabase
        .from("client_ratios")
        .update({ effective_end: yISO } as never)
        .eq("client_id", v.client_id)
        .is("effective_end", null);
      const { error } = await supabase.from("client_ratios").insert({
        organization_id: orgId,
        client_id: v.client_id,
        setting: "residential",
        ratio_staff: v.ratio_staff,
        ratio_clients: v.ratio_clients,
        effective_start: today,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home-detail-ratios", orgId] });
      toast.success("Ratio updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteHome = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-teams", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-clients", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Home deleted");
      navigate({ to: "/dashboard/homes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const team = teamQ.data;
  const clients = clientsQ.data ?? [];
  const staff = staffQ.data ?? [];
  const designations = desigQ.data ?? [];
  const hsds = hsdQ.data ?? [];
  const ratios = ratiosQ.data ?? new Map<string, Ratio>();

  const staffById = useMemo(
    () => new Map(staff.map((s) => [s.id, s])),
    [staff],
  );
  const designationById = useMemo(
    () => new Map(designations.map((d) => [d.id, d])),
    [designations],
  );
  const managerDesigId = designations.find((d) => /manager/i.test(d.label))?.id;

  const residents = clients.filter((c) => c.team_id === teamId);
  const availableClients = clients.filter((c) => c.team_id !== teamId);
  const assignedStaffIds = new Set(hsds.map((h) => h.staff_id));
  const availableStaff = staff.filter((s) => !assignedStaffIds.has(s.id));

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [addClientId, setAddClientId] = useState<string>("");
  const [addStaffId, setAddStaffId] = useState<string>("");
  const [addStaffDesig, setAddStaffDesig] = useState<string>("");

  if (teamQ.isLoading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Loading home…
      </p>
    );
  }
  if (!team) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Home not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/dashboard/homes">Back to Homes & Teams</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          to="/dashboard/homes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Homes &amp; Teams
        </Link>
        <div className="flex items-center gap-2">
          <Home className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {team.team_name}
          </h1>
        </div>
      </div>

      {/* Home details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Home details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Home name</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={nameDraft ?? team.team_name}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <Button
                disabled={
                  !nameDraft ||
                  nameDraft.trim() === team.team_name ||
                  updateHome.isPending
                }
                onClick={() => {
                  if (!nameDraft) return;
                  updateHome.mutate(
                    { team_name: nameDraft.trim() },
                    { onSuccess: () => setNameDraft(null) },
                  );
                }}
              >
                Save
              </Button>
            </div>
          </div>
          <div>
            <Label>Setting</Label>
            <Select
              value={team.setting ?? "residential"}
              onValueChange={(v) => updateHome.mutate({ setting: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETTINGS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Residents + ratios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshake className="h-4 w-4 text-accent" />
            Residents · {residents.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label>Add resident to this home</Label>
              <Select value={addClientId} onValueChange={setAddClientId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick a resident…" />
                </SelectTrigger>
                <SelectContent>
                  {availableClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!addClientId}
              onClick={() => {
                setClientHome.mutate(
                  { id: addClientId, team_id: teamId },
                  { onSuccess: () => setAddClientId("") },
                );
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {residents.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No residents yet.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {residents.map((c) => {
                const r = ratios.get(c.id);
                const currentRatio = r
                  ? `${r.ratio_staff}:${r.ratio_clients}`
                  : "";
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <HeartHandshake className="h-4 w-4 text-accent" />
                      <span className="font-medium">
                        {c.first_name} {c.last_name}
                      </span>
                      {r && (
                        <Badge variant="secondary">
                          Ratio {r.ratio_staff}:{r.ratio_clients}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentRatio}
                        onValueChange={(v) => {
                          const opt = RATIO_OPTIONS.find(
                            (o) => `${o.staff}:${o.clients}` === v,
                          );
                          if (!opt) return;
                          setRatio.mutate({
                            client_id: c.id,
                            ratio_staff: opt.staff,
                            ratio_clients: opt.clients,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue placeholder="Set ratio" />
                        </SelectTrigger>
                        <SelectContent>
                          {RATIO_OPTIONS.map((o) => (
                            <SelectItem
                              key={o.label}
                              value={`${o.staff}:${o.clients}`}
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setClientHome.mutate({ id: c.id, team_id: null })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Care team */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Care team · {hsds.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <Label>Staff member</Label>
              <Select value={addStaffId} onValueChange={setAddStaffId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick a staff member…" />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label>Role</Label>
              <Select value={addStaffDesig} onValueChange={setAddStaffDesig}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick role…" />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!addStaffId || !addStaffDesig}
              onClick={() => {
                upsertHsd.mutate(
                  { staff_id: addStaffId, designation_id: addStaffDesig },
                  {
                    onSuccess: () => {
                      setAddStaffId("");
                      setAddStaffDesig("");
                    },
                  },
                );
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {hsds.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No care team assigned.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {hsds
                .map((h) => ({
                  h,
                  s: staffById.get(h.staff_id),
                  d: designationById.get(h.designation_id),
                }))
                .filter((x) => x.s)
                .sort(
                  (a, b) =>
                    (a.d?.sort ?? 999) - (b.d?.sort ?? 999) ||
                    (a.s?.name ?? "").localeCompare(b.s?.name ?? ""),
                )
                .map(({ h, s, d }) => {
                  const isMgr = d?.id === managerDesigId;
                  return (
                    <div
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="flex items-center gap-2">
                        {isMgr ? (
                          <Star className="h-4 w-4 fill-warning text-warning-foreground" />
                        ) : (
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{s!.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={d?.id ?? ""}
                          onValueChange={(v) =>
                            upsertHsd.mutate({
                              staff_id: s!.id,
                              designation_id: v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {designations.map((dx) => (
                              <SelectItem key={dx.id} value={dx.id}>
                                {dx.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeHsd.mutate(s!.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            className="gap-1"
            onClick={() => {
              if (
                confirm(
                  `Delete ${team.team_name}? Residents will become unassigned.`,
                )
              ) {
                deleteHome.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete this home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
