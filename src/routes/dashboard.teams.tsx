import { createFileRoute } from "@tanstack/react-router";
import { useState, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Home, Plus, Loader2, FlaskConical, ShieldCheck, ShieldOff,
  UserRound, HeartHandshake, Package, ChevronLeft, ChevronRight, GripVertical, Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/teams")({
  head: () => ({ meta: [{ title: "Teams & Group Homes — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <TeamsPage />
    </RequirePermission>
  ),
});

type Team = { id: string; team_name: string; manager_id: string | null; organization_id: string | null };
type StaffRow = { id: string; name: string; team_id: string | null; role?: string | null };
type ClientRow = { id: string; first_name: string; last_name: string; team_id: string | null; job_code?: string[] | null };

const UNASSIGNED = "__unassigned__";
type DragKind = "staff" | "client";
type DragPayload = { kind: DragKind; id: string; from: string | null };

function TeamsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const teamsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["teams", orgId],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name, manager_id, organization_id")
        .eq("organization_id", orgId!)
        .order("team_name");
      if (error) throw error;
      return (data ?? []) as unknown as Team[];
    },
  });

  const staffQ = useQuery({
    enabled: !!orgId,
    queryKey: ["teams-staff", orgId],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data: mems } = await supabase.from("organization_members").select("user_id, role")
        .eq("organization_id", orgId!).eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      const roleMap = new Map((mems ?? []).map((m) => [m.user_id, m.role as string]));
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, team_id" as any).in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((profs ?? []) as any[]).map((p) => ({
        id: p.id, name: p.full_name || p.email || "—",
        team_id: p.team_id ?? null, role: roleMap.get(p.id) ?? "staff",
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["teams-clients", orgId],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase.from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, team_id, job_code" as any)
        .eq("organization_id", orgId!).order("last_name");
      if (error) throw error;
      return (data ?? []) as unknown as ClientRow[];
    },
  });

  const createTeam = useMutation({
    mutationFn: async (v: { team_name: string; manager_id: string | null }) => {
      const { error } = await supabase.from("teams").insert({
        organization_id: orgId, team_name: v.team_name, manager_id: v.manager_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Team created"); qc.invalidateQueries({ queryKey: ["teams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignStaff = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("profiles").update({ team_id: v.team_id } as any).eq("id", v.id);
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["teams-staff", orgId] });
      const prev = qc.getQueryData<StaffRow[]>(["teams-staff", orgId]);
      qc.setQueryData<StaffRow[]>(["teams-staff", orgId], (old) =>
        (old ?? []).map((s) => (s.id === v.id ? { ...s, team_id: v.team_id } : s)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["teams-staff", orgId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success("Staff reassigned"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["teams-staff"] }),
  });

  const assignClient = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("clients").update({ team_id: v.team_id } as any).eq("id", v.id);
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["teams-clients", orgId] });
      const prev = qc.getQueryData<ClientRow[]>(["teams-clients", orgId]);
      qc.setQueryData<ClientRow[]>(["teams-clients", orgId], (old) =>
        (old ?? []).map((c) => (c.id === v.id ? { ...c, team_id: v.team_id } : c)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["teams-clients", orgId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success("Client reassigned"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["teams-clients"] }),
  });

  const allTeams = teamsQ.data ?? [];
  const allStaff = staffQ.data ?? [];
  const allClients = clientsQ.data ?? [];

  const MARCUS_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const [simulateManager, setSimulateManager] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const marcusTeamId = allStaff.find((s) => s.id === MARCUS_ID)?.team_id ?? null;

  const teams = simulateManager && marcusTeamId ? allTeams.filter((t) => t.id === marcusTeamId) : allTeams;
  const staff = simulateManager && marcusTeamId
    ? allStaff.filter((s) => s.team_id === marcusTeamId)
    : allStaff;
  const clients = simulateManager && marcusTeamId ? allClients.filter((c) => c.team_id === marcusTeamId) : allClients;

  const staffName = (id: string | null) => allStaff.find((s) => s.id === id)?.name ?? "—";
  const unassignedStaff = staff.filter((s) => !s.team_id);
  const unassignedClients = clients.filter((c) => !c.team_id);

  const handleDrop = (teamId: string | null, accept: DragKind) => (e: DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let p: DragPayload;
    try { p = JSON.parse(raw); } catch { return; }
    if (p.kind !== accept) {
      toast.error(`Cannot drop a ${p.kind} into the ${accept} zone`);
      return;
    }
    if (p.from === teamId) return;
    if (p.kind === "staff") assignStaff.mutate({ id: p.id, team_id: teamId });
    else assignClient.mutate({ id: p.id, team_id: teamId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
          <FlaskConical className="h-4 w-4" /> 🧪 Sandbox Environment: Mock Hierarchy Loaded
        </span>
        <Button
          size="sm"
          variant={simulateManager ? "default" : "outline"}
          onClick={() => setSimulateManager((v) => !v)}
          className="gap-1.5"
        >
          {simulateManager ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {simulateManager ? "Exit Marcus Vance view" : "Simulate Manager Login (Marcus Vance)"}
        </Button>
      </div>

      {simulateManager && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          🔒 Filtered to Canyon View Residential only — sibling homes blocked by access firewall.
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Home className="h-6 w-6 text-primary" /> Facility & Team Organizational Hub
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag staff & client cards between homes. Updates sync instantly.
          </p>
        </div>
        <CreateTeamDialog staff={allStaff} onCreate={(v) => createTeam.mutate(v)} pending={createTeam.isPending} />
      </div>

      <div className="flex gap-4 items-start">
        {/* Unassigned drawer */}
        <div className={`shrink-0 transition-all ${drawerOpen ? "w-72" : "w-12"}`}>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 p-2">
              {drawerOpen && (
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Package className="h-4 w-4" /> Unassigned Roster
                </span>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerOpen((v) => !v)}>
                {drawerOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
            {drawerOpen && (
              <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
                <DropZone
                  kind="staff"
                  className="rounded-md bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 p-2 min-h-[60px] space-y-1.5"
                  onDrop={handleDrop(null, "staff")}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    <UserRound className="h-3 w-3" /> Staff · {unassignedStaff.length}
                  </div>
                  {unassignedStaff.map((s) => <StaffCard key={s.id} s={s} from={null} />)}
                  {!unassignedStaff.length && <p className="text-[11px] text-muted-foreground italic">All staff assigned</p>}
                </DropZone>

                <DropZone
                  kind="client"
                  className="rounded-md bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 p-2 min-h-[60px] space-y-1.5"
                  onDrop={handleDrop(null, "client")}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    <HeartHandshake className="h-3 w-3" /> Clients · {unassignedClients.length}
                  </div>
                  {unassignedClients.map((c) => <ClientCard key={c.id} c={c} from={null} />)}
                  {!unassignedClients.length && <p className="text-[11px] text-muted-foreground italic">All clients placed</p>}
                </DropZone>
              </div>
            )}
          </Card>
        </div>

        {/* Kanban board */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          {teamsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading teams…</p>
          ) : !teams.length ? (
            <Card className="p-10 text-center">
              <Home className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No teams yet. Create your first group home above.</p>
            </Card>
          ) : (
            <div className="flex gap-4 pb-3" style={{ minWidth: "min-content" }}>
              {teams.map((t) => {
                const tStaff = staff.filter((s) => s.team_id === t.id);
                const tClients = clients.filter((c) => c.team_id === t.id);
                return (
                  <Card key={t.id} className="w-72 shrink-0 flex flex-col">
                    <div className="border-b p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Home className="h-4 w-4 text-primary" />
                        <h3 className="font-bold text-base truncate">{t.team_name}</h3>
                      </div>
                      <Badge variant="secondary" className="gap-1 font-medium">
                        <UserRound className="h-3 w-3" /> Mgr: {staffName(t.manager_id)}
                      </Badge>
                      <div className="flex gap-1.5 pt-0.5">
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200 gap-1">
                          🟢 {tStaff.length} Staff
                        </Badge>
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 gap-1">
                          👥 {tClients.length} Clients
                        </Badge>
                      </div>
                    </div>

                    <div className="p-2 space-y-2 flex-1">
                      <DropZone
                        kind="staff"
                        className="rounded-md bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40 p-2 min-h-[100px] space-y-1.5"
                        onDrop={handleDrop(t.id, "staff")}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                          👤 Staff Roster
                        </div>
                        {tStaff.map((s) => <StaffCard key={s.id} s={s} from={t.id} />)}
                        {!tStaff.length && <p className="text-[11px] text-muted-foreground italic">Drop staff here</p>}
                      </DropZone>

                      <DropZone
                        kind="client"
                        className="rounded-md bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/40 p-2 min-h-[100px] space-y-1.5"
                        onDrop={handleDrop(t.id, "client")}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          🏠 Client Roster
                        </div>
                        {tClients.map((c) => <ClientCard key={c.id} c={c} from={t.id} />)}
                        {!tClients.length && <p className="text-[11px] text-muted-foreground italic">Drop clients here</p>}
                      </DropZone>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DropZone({
  kind, className, onDrop, children,
}: {
  kind: DragKind;
  className?: string;
  onDrop: (e: DragEvent) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState<"valid" | "invalid" | null>(null);
  return (
    <div
      className={`${className ?? ""} transition-all ${
        over === "valid" ? "ring-2 ring-primary ring-offset-1" : ""
      } ${over === "invalid" ? "ring-2 ring-destructive ring-offset-1" : ""}`}
      onDragOver={(e) => {
        const t = e.dataTransfer.types.find((x) => x.startsWith("kind/"));
        const draggedKind = t ? t.slice(5) : null;
        if (draggedKind === kind) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver("valid");
        } else if (draggedKind) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "none";
          setOver("invalid");
        }
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { setOver(null); onDrop(e); }}
    >
      {children}
    </div>
  );
}

function startDrag(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/json", JSON.stringify(payload));
  // Custom MIME marker so dropzones can validate kind during dragover
  e.dataTransfer.setData(`kind/${payload.kind}`, "1");
}

function StaffCard({ s, from }: { s: StaffRow; from: string | null }) {
  return (
    <div
      draggable
      onDragStart={(e) => startDrag(e, { kind: "staff", id: s.id, from })}
      className="group flex items-center gap-1.5 rounded-md border bg-card p-2 text-xs shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing"
    >
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="font-medium truncate flex-1">{s.name}</span>
      <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[10px] capitalize">
        <UserRound className="h-2.5 w-2.5" />{s.role ?? "staff"}
      </Badge>
    </div>
  );
}

function ClientCard({ c, from }: { c: ClientRow; from: string | null }) {
  const funding = c.job_code?.[0] ?? "Self-pay";
  return (
    <div
      draggable
      onDragStart={(e) => startDrag(e, { kind: "client", id: c.id, from })}
      className="group rounded-md border bg-card p-2 text-xs shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing border-l-2 border-l-emerald-500"
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium truncate flex-1">{c.first_name} {c.last_name}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 pl-4 text-[10px] text-muted-foreground">
        <Wallet className="h-2.5 w-2.5" /> {funding}
      </div>
    </div>
  );
}

function CreateTeamDialog({
  staff, onCreate, pending,
}: { staff: StaffRow[]; onCreate: (v: { team_name: string; manager_id: string | null }) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mgr, setMgr] = useState<string>(UNASSIGNED);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Create New Team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a Group Home / Team</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Team / House Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenbriar Residential House" />
          </div>
          <div className="grid gap-1.5">
            <Label>House Manager</Label>
            <Select value={mgr} onValueChange={setMgr}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>— None —</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() => {
              onCreate({ team_name: name.trim(), manager_id: mgr === UNASSIGNED ? null : mgr });
              setOpen(false); setName(""); setMgr(UNASSIGNED);
            }}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tabs/legacy types kept for type-cleanliness
type _UnusedContact = typeof Contact2;
type _UnusedUsers = typeof Users;
const _u: [_UnusedContact, _UnusedUsers] | null = null;
void _u;
