import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, Plus, Pencil, Users, Contact2, Check, X, Loader2, FlaskConical, ShieldCheck, ShieldOff } from "lucide-react";
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
type StaffRow = { id: string; name: string; team_id: string | null };
type ClientRow = { id: string; first_name: string; last_name: string; team_id: string | null };

const UNASSIGNED = "__unassigned__";

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
      const { data: mems } = await supabase.from("organization_members").select("user_id")
        .eq("organization_id", orgId!).eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, team_id" as any).in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((profs ?? []) as any[]).map((p) => ({
        id: p.id, name: p.full_name || p.email || "—", team_id: p.team_id ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["teams-clients", orgId],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase.from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, team_id" as any)
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

  const updateTeam = useMutation({
    mutationFn: async (v: { id: string; team_name?: string; manager_id?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (v.team_name !== undefined) patch.team_name = v.team_name;
      if (v.manager_id !== undefined) patch.manager_id = v.manager_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("teams") as any).update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Team updated"); qc.invalidateQueries({ queryKey: ["teams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignStaff = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("profiles").update({ team_id: v.team_id } as any).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Staff reassigned"); qc.invalidateQueries({ queryKey: ["teams-staff"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignClient = useMutation({
    mutationFn: async (v: { id: string; team_id: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("clients").update({ team_id: v.team_id } as any).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Client reassigned"); qc.invalidateQueries({ queryKey: ["teams-clients"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const allTeams = teamsQ.data ?? [];
  const allStaff = staffQ.data ?? [];
  const allClients = clientsQ.data ?? [];

  const MARCUS_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const [simulateManager, setSimulateManager] = useState(false);
  const marcusTeamId = allStaff.find((s) => s.id === MARCUS_ID)?.team_id ?? null;

  const teams = simulateManager && marcusTeamId ? allTeams.filter((t) => t.id === marcusTeamId) : allTeams;
  const staff = simulateManager && marcusTeamId
    ? allStaff.filter((s) => s.team_id === marcusTeamId && s.id !== MARCUS_ID)
    : allStaff;
  const clients = simulateManager && marcusTeamId ? allClients.filter((c) => c.team_id === marcusTeamId) : allClients;

  const staffName = (id: string | null) => allStaff.find((s) => s.id === id)?.name ?? "—";
  const countStaff = (tid: string) => allStaff.filter((s) => s.team_id === tid).length;
  const countClients = (tid: string) => allClients.filter((c) => c.team_id === tid).length;

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
          🔒 Filtered to Canyon View Residential only — staff & clients from sibling homes are blocked by the access firewall.
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Home className="h-6 w-6 text-primary" /> Facility & Team Organizational Hub
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize staff and clients into distinct group homes or operational units.
          </p>
        </div>
        <CreateTeamDialog staff={staff} onCreate={(v) => createTeam.mutate(v)} pending={createTeam.isPending} />
      </div>

      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teams">Team Cards</TabsTrigger>
          <TabsTrigger value="matrix">Assignment Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-4">
          {teamsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading teams…</p>
          ) : !teams.length ? (
            <Card className="p-10 text-center">
              <Home className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No teams yet. Create your first group home above.</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <TeamCard
                  key={t.id}
                  team={t}
                  staff={staff}
                  staffCount={countStaff(t.id)}
                  clientCount={countClients(t.id)}
                  managerName={staffName(t.manager_id)}
                  onRename={(name) => updateTeam.mutate({ id: t.id, team_name: name })}
                  onChangeManager={(mid) => updateTeam.mutate({ id: t.id, manager_id: mid })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Staff Roster Allocation
              </h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                    <span className="text-sm font-medium truncate">{s.name}</span>
                    <Select
                      value={s.team_id ?? UNASSIGNED}
                      onValueChange={(v) => assignStaff.mutate({ id: s.id, team_id: v === UNASSIGNED ? null : v })}
                    >
                      <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                        {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {!staff.length && <p className="text-sm text-muted-foreground">No staff in org.</p>}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Contact2 className="h-4 w-4" /> Client Roster Allocation
              </h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                    <span className="text-sm font-medium truncate">{c.first_name} {c.last_name}</span>
                    <Select
                      value={c.team_id ?? UNASSIGNED}
                      onValueChange={(v) => assignClient.mutate({ id: c.id, team_id: v === UNASSIGNED ? null : v })}
                    >
                      <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                        {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {!clients.length && <p className="text-sm text-muted-foreground">No clients yet.</p>}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
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

function TeamCard({
  team, staff, staffCount, clientCount, managerName, onRename, onChangeManager,
}: {
  team: Team; staff: StaffRow[]; staffCount: number; clientCount: number; managerName: string;
  onRename: (name: string) => void; onChangeManager: (mid: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.team_name);
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { onRename(draft.trim() || team.team_name); setEditing(false); }}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setDraft(team.team_name); setEditing(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button className="flex items-center gap-1.5 text-left group" onClick={() => setEditing(true)}>
            <Home className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-base">{team.team_name}</h3>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">House Manager</Label>
        <Select
          value={team.manager_id ?? UNASSIGNED}
          onValueChange={(v) => onChangeManager(v === UNASSIGNED ? null : v)}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder={managerName} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>— No manager —</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-1">
        <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" /> {staffCount} Staff</Badge>
        <Badge variant="secondary" className="gap-1"><Contact2 className="h-3 w-3" /> {clientCount} Clients</Badge>
      </div>
    </Card>
  );
}
