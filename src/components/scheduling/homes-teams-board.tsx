import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  HeartHandshake,
  Plus,
  Star,
  Trash2,
  UserRound,
  Users,
  CalendarDays,
  ShieldCheck,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncTeamToLocation } from "@/lib/scheduling/locations.functions";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================================
// Types
// ============================================================================
type TeamRow = {
  id: string;
  team_name: string;
  manager_id: string | null;
  organization_id: string | null;
  setting: string | null;
};
type StaffRow = { id: string; name: string; team_id: string | null; photo_path: string | null };
type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
};
type Designation = { id: string; label: string; sort: number };
type Hsd = {
  id: string;
  team_id: string;
  staff_id: string;
  designation_id: string;
};
type Ratio = {
  client_id: string;
  setting: string;
  ratio_staff: number;
  ratio_clients: number;
  effective_start: string;
  effective_end: string | null;
};

const SETTINGS: { value: string; label: string }[] = [
  { value: "residential", label: "RHS" },
  { value: "slh", label: "SLH" },
  { value: "host-home", label: "Host home" },
  { value: "day-program", label: "Day program" },
];
const settingLabel = (v: string | null) =>
  SETTINGS.find((s) => s.value === (v ?? "residential"))?.label ?? "RHS";

// ============================================================================
// Coverage requirement (client-side mirror of generate_coverage_requirements
// for the per-card pill — kept advisory only).
// ============================================================================
function computeRequiredStaff(
  clients: ClientRow[],
  ratios: Map<string, Ratio>,
): number {
  const groups = new Map<string, { staff: number; cap: number; n: number }>();
  let unsized = 0;
  for (const c of clients) {
    const r = ratios.get(c.id);
    if (!r) {
      unsized += 1;
      continue;
    }
    if (r.ratio_clients === 1) {
      groups.set(`solo:${c.id}`, { staff: r.ratio_staff, cap: 1, n: 1 });
    } else {
      const k = `${r.ratio_staff}:${r.ratio_clients}`;
      const g = groups.get(k);
      if (g) g.n += 1;
      else groups.set(k, { staff: r.ratio_staff, cap: r.ratio_clients, n: 1 });
    }
  }
  let need = 0;
  for (const g of groups.values()) need += Math.ceil(g.n / g.cap) * g.staff;
  // unsized clients (no ratio) count as 1:1 advisory
  need += unsized;
  return need;
}

// ============================================================================
// Main
// ============================================================================
export function HomesTeamsBoard() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;
  const today = new Date().toISOString().slice(0, 10);
  const syncLocationCall = useServerFn(syncTeamToLocation);

  const teamsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["ht-teams", orgId],
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name, manager_id, organization_id, setting" as never)
        .eq("organization_id", orgId!)
        .order("team_name");
      if (error) throw error;
      return (data ?? []) as unknown as TeamRow[];
    },
  });

  const staffQ = useQuery({
    enabled: !!orgId,
    queryKey: ["ht-staff", orgId],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, team_id, photo_path")
        .in("id", ids);
      return (profs ?? [])
        .map((p) => ({
          id: p.id as string,
          name: (p.full_name as string) || (p.email as string) || "—",
          team_id: (p.team_id as string | null) ?? null,
          photo_path: (p.photo_path as string | null) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["ht-clients", orgId],
    queryFn: async (): Promise<ClientRow[]> => {
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

  const desigQ = useQuery({
    enabled: !!orgId,
    queryKey: ["ht-designations", orgId],
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
    enabled: !!orgId,
    queryKey: ["ht-hsd", orgId],
    queryFn: async (): Promise<Hsd[]> => {
      const { data, error } = await supabase
        .from("home_staff_designations")
        .select("id, team_id, staff_id, designation_id")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Hsd[];
    },
  });

  const ratiosQ = useQuery({
    enabled: !!orgId && !!clientsQ.data?.length,
    queryKey: ["ht-ratios", orgId],
    queryFn: async (): Promise<Map<string, Ratio>> => {
      const ids = (clientsQ.data ?? []).map((c) => c.id);
      if (!ids.length) return new Map();
      const { data, error } = await supabase
        .from("client_ratios")
        .select(
          "client_id, setting, ratio_staff, ratio_clients, effective_start, effective_end",
        )
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

  // --- Mutations ---------------------------------------------------------
  const setClientHome = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      const { error } = await supabase
        .from("clients")
        .update({ team_id: v.team_id } as never)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-clients", orgId] });
      toast.success("Resident moved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertHsd = useMutation({
    mutationFn: async (v: {
      team_id: string;
      staff_id: string;
      designation_id: string;
    }) => {
      const { error } = await supabase
        .from("home_staff_designations")
        .upsert(
          {
            organization_id: orgId!,
            team_id: v.team_id,
            staff_id: v.staff_id,
            designation_id: v.designation_id,
          },
          { onConflict: "team_id,staff_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Care team updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeHsd = useMutation({
    mutationFn: async (v: { team_id: string; staff_id: string }) => {
      const { error } = await supabase
        .from("home_staff_designations")
        .delete()
        .eq("team_id", v.team_id)
        .eq("staff_id", v.staff_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Removed from care team");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createHome = useMutation({
    mutationFn: async (v: { team_name: string; setting: string }) => {
      const { data: row, error } = await supabase.from("teams").insert({
        organization_id: orgId,
        team_name: v.team_name,
        setting: v.setting,
      } as never).select("id").single();
      if (error) throw error;
      // teams is the source of truth for homes — mirror into locations so the
      // scheduler's Locations panel / coverage requirements see the new home.
      const teamId = (row as { id?: string } | null)?.id;
      if (teamId && orgId) {
        await syncLocationCall({ data: { organizationId: orgId, teamId } }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-teams", orgId] });
      qc.invalidateQueries({ queryKey: ["locations", orgId] });
      toast.success("Home added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateHome = useMutation({
    mutationFn: async (v: {
      id: string;
      team_name?: string;
      setting?: string;
    }) => {
      // Capture the pre-update name so a rename can find its locations row.
      const previousName = teamsQ.data?.find((t) => t.id === v.id)?.team_name;
      const patch: Record<string, string> = {};
      if (v.team_name != null) patch.team_name = v.team_name;
      if (v.setting != null) patch.setting = v.setting;
      const { error } = await supabase
        .from("teams")
        .update(patch as never)
        .eq("id", v.id);
      if (error) throw error;
      if (orgId) {
        await syncLocationCall({
          data: { organizationId: orgId, teamId: v.id, previousName },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-teams", orgId] });
      qc.invalidateQueries({ queryKey: ["locations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRatio = useMutation({
    mutationFn: async (v: {
      client_id: string;
      ratio_staff: number;
      ratio_clients: number;
    }) => {
      // Close any prior open ratio rows for this client (any setting),
      // then insert a fresh row effective today. Keeps history intact.
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
      qc.invalidateQueries({ queryKey: ["ht-ratios", orgId] });
      toast.success("Staffing ratio updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteHome = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-teams", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-clients", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-hsd", orgId] });
      toast.success("Home deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Derived -----------------------------------------------------------
  const teams = teamsQ.data ?? [];
  const staff = staffQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const designations = desigQ.data ?? [];
  const hsds = hsdQ.data ?? [];
  const ratios = ratiosQ.data ?? new Map<string, Ratio>();

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams],
  );
  const staffById = useMemo(
    () => new Map(staff.map((s) => [s.id, s])),
    [staff],
  );
  const designationById = useMemo(
    () => new Map(designations.map((d) => [d.id, d])),
    [designations],
  );
  const managerDesigId = designations.find((d) =>
    /manager/i.test(d.label),
  )?.id;

  // staff_id -> teams the staffer is on
  const staffHomes = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of hsds) {
      const arr = m.get(h.staff_id) ?? [];
      arr.push(h.team_id);
      m.set(h.staff_id, arr);
    }
    return m;
  }, [hsds]);

  const unassignedClients = clients.filter((c) => !c.team_id);
  const unassignedStaff = staff.filter((s) => !staffHomes.get(s.id)?.length);

  // --- UI state ----------------------------------------------------------
  const [newHomeOpen, setNewHomeOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSetting, setNewSetting] = useState("residential");
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [moveClient, setMoveClient] = useState<ClientRow | null>(null);
  const [openStaff, setOpenStaff] = useState<{
    staff: StaffRow;
    teamId: string;
  } | null>(null);

  if (
    teamsQ.isLoading ||
    staffQ.isLoading ||
    clientsQ.isLoading ||
    desigQ.isLoading
  ) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Loading homes…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <Home className="h-5 w-5 text-primary" /> Homes & Teams
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Households with their residents and care teams. Tap any chip to
            move someone — changes apply instantly.
          </p>
        </div>
        <Button onClick={() => setNewHomeOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add home
        </Button>
      </div>

      {/* Unassigned rail */}
      {(unassignedClients.length > 0 || unassignedStaff.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning-foreground" />
              Unassigned
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {unassignedClients.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Residents without a home · {unassignedClients.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unassignedClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setMoveClient(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1 text-xs hover:border-primary hover:bg-primary/5"
                    >
                      <HeartHandshake className="h-3 w-3 text-accent" />
                      {c.first_name} {c.last_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {unassignedStaff.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Staff with no home · {unassignedStaff.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unassignedStaff.map((s) => (
                    <AddStaffToHomePopover
                      key={s.id}
                      staff={s}
                      teams={teams}
                      designations={designations}
                      onAdd={(team_id, designation_id) =>
                        upsertHsd.mutate({
                          team_id,
                          staff_id: s.id,
                          designation_id,
                        })
                      }
                    >
                      <button className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1 text-xs hover:border-primary hover:bg-primary/5">
                        <UserRound className="h-3 w-3 text-primary" />
                        {s.name}
                      </button>
                    </AddStaffToHomePopover>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Home grid */}
      {teams.length === 0 ? (
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title="No homes yet"
          description="Add your first household to start placing residents and a care team."
          action={
            <Button onClick={() => setNewHomeOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add home
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => {
            const residents = clients.filter((c) => c.team_id === t.id);
            const teamHsds = hsds.filter((h) => h.team_id === t.id);
            const required = computeRequiredStaff(residents, ratios);
            const careCount = teamHsds.length;
            const inRatio = careCount >= required;
            return (
              <Card
                key={t.id}
                className="flex flex-col overflow-hidden shadow-card"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4 shrink-0 text-primary" />
                        <Link
                          to="/dashboard/homes/$teamId"
                          params={{ teamId: t.id }}
                          className="truncate font-display text-base font-semibold tracking-tight hover:underline"
                        >
                          {t.team_name}
                        </Link>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="gap-1">
                          {settingLabel(t.setting)}
                        </Badge>
                        <Badge
                          variant={inRatio ? "success" : "warning"}
                          className="gap-1"
                        >
                          {inRatio ? (
                            <>
                              <ShieldCheck className="h-3 w-3" /> In ratio
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-3 w-3" /> Watch
                              coverage
                            </>
                          )}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  {/* Lives here */}
                  <section>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <HeartHandshake className="mr-1 inline h-3 w-3 text-accent" />
                        Lives here · {residents.length}
                      </p>
                      <AddResidentPopover
                        allClients={clients}
                        teamId={t.id}
                        teamsById={teamsById}
                        onPick={(id) =>
                          setClientHome.mutate({ id, team_id: t.id })
                        }
                      />
                    </div>
                    {residents.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        No residents yet
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {residents.map((c) => {
                          const r = ratios.get(c.id);
                          return (
                            <ResidentChip
                              key={c.id}
                              client={c}
                              ratio={r ?? null}
                              onSetRatio={(staff, clients) =>
                                setRatio.mutate({
                                  client_id: c.id,
                                  ratio_staff: staff,
                                  ratio_clients: clients,
                                })
                              }
                              onMove={() => setMoveClient(c)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Care team */}
                  <section>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Users className="mr-1 inline h-3 w-3 text-primary" />
                        Care team · {careCount}
                      </p>
                      <AddStaffPopover
                        allStaff={staff}
                        teamHsds={teamHsds}
                        designations={designations}
                        onAdd={(staff_id, designation_id) =>
                          upsertHsd.mutate({
                            team_id: t.id,
                            staff_id,
                            designation_id,
                          })
                        }
                      />
                    </div>
                    {teamHsds.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        No care team assigned
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {teamHsds
                          .map((h) => {
                            const s = staffById.get(h.staff_id);
                            const d = designationById.get(h.designation_id);
                            return { h, s, d };
                          })
                          .filter((x) => x.s)
                          .sort(
                            (a, b) =>
                              (a.d?.sort ?? 999) - (b.d?.sort ?? 999) ||
                              (a.s?.name ?? "").localeCompare(b.s?.name ?? ""),
                          )
                          .map(({ h, s, d }) => {
                            const isMgr = d?.id === managerDesigId;
                            const otherHomes = (
                              staffHomes.get(s!.id) ?? []
                            ).filter((id) => id !== t.id);
                            return (
                              <button
                                key={h.id}
                                onClick={() =>
                                  setOpenStaff({ staff: s!, teamId: t.id })
                                }
                                className="group flex items-center gap-2 rounded-md border border-transparent bg-card px-2 py-1.5 text-left text-xs hover:border-border hover:bg-muted/50"
                              >
                                {isMgr ? (
                                  <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning-foreground" />
                                ) : (
                                  <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="flex-1 truncate font-medium">
                                  {s!.name}
                                </span>
                                <Badge
                                  variant={isMgr ? "warning" : "secondary"}
                                  className="shrink-0"
                                >
                                  {d?.label ?? "—"}
                                </Badge>
                                {otherHomes.length > 0 && (
                                  <span className="hidden shrink-0 text-[10px] italic text-muted-foreground md:inline">
                                    also at{" "}
                                    {otherHomes
                                      .map(
                                        (id) =>
                                          teamsById.get(id)?.team_name ?? "",
                                      )
                                      .filter(Boolean)
                                      .join(", ")}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </section>
                </CardContent>

                {/* Footer */}
                <div className="border-t bg-surface-warm/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Needs{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {required}
                      </span>{" "}
                      staff / shift
                    </span>
                    <Link
                      to="/dashboard/scheduling"
                      search={{ tab: "schedule" }}
                      className="font-medium text-primary hover:underline"
                    >
                      View schedule →
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New / edit home dialogs */}
      <Dialog open={newHomeOpen} onOpenChange={setNewHomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a home</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Home name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Maple House"
              />
            </div>
            <div>
              <Label>Setting</Label>
              <Select value={newSetting} onValueChange={setNewSetting}>
                <SelectTrigger>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewHomeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newName.trim()) {
                  toast.error("Name required");
                  return;
                }
                createHome.mutate(
                  { team_name: newName.trim(), setting: newSetting },
                  {
                    onSuccess: () => {
                      setNewHomeOpen(false);
                      setNewName("");
                      setNewSetting("residential");
                    },
                  },
                );
              }}
              disabled={createHome.isPending}
            >
              Add home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit home</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Home name</Label>
                <Input
                  defaultValue={editing.team_name}
                  onBlur={(e) =>
                    e.target.value !== editing.team_name &&
                    updateHome.mutate({
                      id: editing.id,
                      team_name: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Setting</Label>
                <Select
                  defaultValue={editing.setting ?? "residential"}
                  onValueChange={(v) =>
                    updateHome.mutate({ id: editing.id, setting: v })
                  }
                >
                  <SelectTrigger>
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
              <div className="flex justify-between pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete ${editing.team_name}? Residents will become unassigned.`,
                      )
                    ) {
                      deleteHome.mutate(editing.id);
                      setEditing(null);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete home
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Move client */}
      <Dialog
        open={!!moveClient}
        onOpenChange={(o) => !o && setMoveClient(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move {moveClient?.first_name} {moveClient?.last_name}
            </DialogTitle>
          </DialogHeader>
          {moveClient && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Residents live in exactly one home. Choose where they belong.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {teams.map((t) => (
                  <Button
                    key={t.id}
                    variant={
                      moveClient.team_id === t.id ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setClientHome.mutate(
                        { id: moveClient.id, team_id: t.id },
                        { onSuccess: () => setMoveClient(null) },
                      );
                    }}
                  >
                    {t.team_name}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setClientHome.mutate(
                      { id: moveClient.id, team_id: null },
                      { onSuccess: () => setMoveClient(null) },
                    );
                  }}
                >
                  Unassign
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Staff actions */}
      <Dialog
        open={!!openStaff}
        onOpenChange={(o) => !o && setOpenStaff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openStaff?.staff.name}</DialogTitle>
          </DialogHeader>
          {openStaff && (
            <StaffPanel
              staff={openStaff.staff}
              currentTeamId={openStaff.teamId}
              teams={teams}
              designations={designations}
              hsds={hsds}
              onChangeDesig={(designation_id) =>
                upsertHsd.mutate({
                  team_id: openStaff.teamId,
                  staff_id: openStaff.staff.id,
                  designation_id,
                })
              }
              onAddHome={(team_id, designation_id) =>
                upsertHsd.mutate({
                  team_id,
                  staff_id: openStaff.staff.id,
                  designation_id,
                })
              }
              onRemove={(team_id) => {
                removeHsd.mutate(
                  { team_id, staff_id: openStaff.staff.id },
                  {
                    onSuccess: () => {
                      if (team_id === openStaff.teamId)
                        setOpenStaff(null);
                    },
                  },
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================
function AddResidentPopover({
  allClients,
  teamId,
  teamsById,
  onPick,
}: {
  allClients: ClientRow[];
  teamId: string;
  teamsById: Map<string, TeamRow>;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const candidates = allClients.filter((c) => c.team_id !== teamId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-0.5 px-1.5 text-xs"
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="mb-1.5 text-xs text-muted-foreground">
          Moves the resident here.
        </p>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {candidates.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              Everyone is placed
            </p>
          )}
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPick(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">
                {c.first_name} {c.last_name}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {c.team_id
                  ? teamsById.get(c.team_id)?.team_name ?? ""
                  : "Unassigned"}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddStaffPopover({
  allStaff,
  teamHsds,
  designations,
  onAdd,
}: {
  allStaff: StaffRow[];
  teamHsds: Hsd[];
  designations: Designation[];
  onAdd: (staff_id: string, designation_id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [desigId, setDesigId] = useState(designations[0]?.id ?? "");
  const onHome = new Set(teamHsds.map((h) => h.staff_id));
  const candidates = allStaff.filter((s) => !onHome.has(s.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-0.5 px-1.5 text-xs"
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-2">
        <div>
          <Label className="text-[11px]">Role</Label>
          <Select value={desigId} onValueChange={setDesigId}>
            <SelectTrigger className="h-8">
              <SelectValue />
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
        <div className="max-h-56 overflow-y-auto">
          {candidates.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              Everyone is already on this care team
            </p>
          )}
          {candidates.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                if (!desigId) {
                  toast.error("Pick a role first");
                  return;
                }
                onAdd(s.id, desigId);
                setOpen(false);
              }}
              className="block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
            >
              {s.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddStaffToHomePopover({
  staff,
  teams,
  designations,
  onAdd,
  children,
}: {
  staff: StaffRow;
  teams: TeamRow[];
  designations: Designation[];
  onAdd: (team_id: string, designation_id: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [desigId, setDesigId] = useState(designations[0]?.id ?? "");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-2" align="start">
        <p className="text-xs text-muted-foreground">
          Add <span className="font-medium">{staff.name}</span> to a home.
        </p>
        <div>
          <Label className="text-[11px]">Role</Label>
          <Select value={desigId} onValueChange={setDesigId}>
            <SelectTrigger className="h-8">
              <SelectValue />
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
        <div className="max-h-56 overflow-y-auto">
          {teams.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No homes yet
            </p>
          )}
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (!desigId) {
                  toast.error("Pick a role first");
                  return;
                }
                onAdd(t.id, desigId);
                setOpen(false);
              }}
              className="block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
            >
              {t.team_name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StaffPanel({
  staff,
  currentTeamId,
  teams,
  designations,
  hsds,
  onChangeDesig,
  onAddHome,
  onRemove,
}: {
  staff: StaffRow;
  currentTeamId: string;
  teams: TeamRow[];
  designations: Designation[];
  hsds: Hsd[];
  onChangeDesig: (designation_id: string) => void;
  onAddHome: (team_id: string, designation_id: string) => void;
  onRemove: (team_id: string) => void;
}) {
  const mine = hsds.filter((h) => h.staff_id === staff.id);
  const currentHsd = mine.find((h) => h.team_id === currentTeamId);
  const onTeams = new Set(mine.map((h) => h.team_id));
  const addable = teams.filter((t) => !onTeams.has(t.id));
  const [addDesig, setAddDesig] = useState(designations[0]?.id ?? "");

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label className="text-xs">
          Role at{" "}
          {teams.find((t) => t.id === currentTeamId)?.team_name ?? "—"}
        </Label>
        <Select
          value={currentHsd?.designation_id}
          onValueChange={onChangeDesig}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick role" />
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

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Also on
        </p>
        {mine.filter((h) => h.team_id !== currentTeamId).length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            Only at this home
          </p>
        ) : (
          <div className="space-y-1">
            {mine
              .filter((h) => h.team_id !== currentTeamId)
              .map((h) => {
                const t = teams.find((x) => x.id === h.team_id);
                const d = designations.find(
                  (x) => x.id === h.designation_id,
                );
                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded border border-border px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t?.team_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {d?.label}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(h.team_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {addable.length > 0 && (
        <div className="space-y-2 rounded border border-dashed border-border p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add to another home
          </p>
          <Select value={addDesig} onValueChange={setAddDesig}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {designations.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5">
            {addable.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  if (!addDesig) {
                    toast.error("Pick a role first");
                    return;
                  }
                  onAddHome(t.id, addDesig);
                }}
              >
                <Plus className="h-3 w-3" /> {t.team_name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onRemove(currentTeamId)}
        >
          Remove from this home
        </Button>
      </DialogFooter>
    </div>
  );
}

// ============================================================================
// ResidentChip — tap to set the resident's staffing ratio inline.
// Advisory only. Writes go to client_ratios (setting='residential'); a prior
// open ratio row is closed first so the new one is the active one.
// ============================================================================
const RATIO_OPTIONS: { label: string; staff: number; clients: number; hint: string }[] = [
  { label: "1:1", staff: 1, clients: 1, hint: "One staff dedicated to this resident" },
  { label: "1:2", staff: 1, clients: 2, hint: "Shared 1:2 with another resident" },
  { label: "1:3", staff: 1, clients: 3, hint: "Shared 1:3 with two other residents" },
  { label: "2:1", staff: 2, clients: 1, hint: "Enhanced — two staff for this resident" },
];

function ResidentChip({
  client,
  ratio,
  onSetRatio,
  onMove,
}: {
  client: ClientRow;
  ratio: Ratio | null;
  onSetRatio: (staff: number, clients: number) => void;
  onMove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeKey = ratio ? `${ratio.ratio_staff}:${ratio.ratio_clients}` : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-primary hover:bg-primary/5"
          aria-label={`Set staffing ratio for ${client.first_name} ${client.last_name}`}
        >
          <span className="font-medium">
            {client.first_name} {client.last_name}
          </span>
          <span
            className={`rounded px-1 py-px text-[10px] tabular-nums ${
              ratio
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {ratio ? `${ratio.ratio_staff}:${ratio.ratio_clients}` : "set ratio"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Staffing ratio · {client.first_name}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {RATIO_OPTIONS.map((opt) => {
            const k = `${opt.staff}:${opt.clients}`;
            const isActive = k === activeKey;
            return (
              <button
                key={k}
                onClick={() => {
                  onSetRatio(opt.staff, opt.clients);
                  setOpen(false);
                }}
                title={opt.hint}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium tabular-nums transition ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary hover:bg-primary/5"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Sets this resident's coverage ratio. Required staff per shift is
          summed across residents in the home.
        </p>
        <div className="mt-2 flex justify-end border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
          >
            Move to another home…
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
