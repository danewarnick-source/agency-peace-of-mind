import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Plus,
  Trash2,
  Tag,
  Clock,
  Users,
  FileText,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Shell with 4 sub-tabs
// ============================================================================
type SetupTab = "codes" | "shifts" | "ratios" | "auths";

export function SchedulingSetup() {
  const [tab, setTab] = useState<SetupTab>("codes");
  const tabs: { key: SetupTab; label: string; icon: React.ReactNode }[] = [
    { key: "codes", label: "Service codes", icon: <Tag className="h-3.5 w-3.5" /> },
    { key: "shifts", label: "Shift templates", icon: <Clock className="h-3.5 w-3.5" /> },
    { key: "ratios", label: "Client ratios", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "auths", label: "Authorizations", icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Setup</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tell the scheduler what your services, shifts, ratios, and authorizations look like.
          Hints are advisory — nothing here blocks scheduling.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tab === "codes" && <ServiceCodesPanel />}
      {tab === "shifts" && <ShiftTemplatesPanel />}
      {tab === "ratios" && <ClientRatiosPanel />}
      {tab === "auths" && <AuthorizationsPanel />}
    </div>
  );
}

// ============================================================================
// 1. Service codes
// ============================================================================
type CodeRow = {
  id: string;
  code: string;
  label: string | null;
  kind: "continuous" | "discrete";
  unit: "day" | "hour" | "unit15";
  carve_out: boolean;
  status: string;
  sort: number;
};

function ServiceCodesPanel() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-codes", orgId],
    queryFn: async (): Promise<CodeRow[]> => {
      const { data, error } = await supabase
        .from("provider_authorized_codes")
        .select("id, code, label, kind, unit, carve_out, status, sort")
        .eq("organization_id", orgId!)
        .order("sort")
        .order("code");
      if (error) throw error;
      return (data ?? []) as CodeRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (v: Partial<CodeRow> & { id?: string; code?: string }) => {
      if (v.id) {
        const { error } = await supabase
          .from("provider_authorized_codes")
          .update(v as never)
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("provider_authorized_codes")
          .insert({
            organization_id: orgId,
            code: v.code,
            label: v.label ?? null,
            kind: v.kind ?? "discrete",
            unit: v.unit ?? "hour",
            carve_out: v.carve_out ?? true,
            source: "manual",
            status: "active",
            sort: 100,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-codes", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("provider_authorized_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setup-codes", orgId] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const codes = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-base font-semibold">Service codes</p>
          <p className="text-sm text-muted-foreground">
            The billable services you run. Each code says whether it is continuous (24h day
            coverage) or discrete (per hour or per 15-minute unit), and whether it carves out
            of residential coverage.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add row */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="grow basis-32">
            <Label className="text-xs">Code</Label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. RHS"
            />
          </div>
          <div className="grow basis-64">
            <Label className="text-xs">Label</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Residential Habilitation Services"
            />
          </div>
          <Button
            onClick={() => {
              if (!newCode.trim()) return toast.error("Code required");
              upsert.mutate(
                { code: newCode.trim(), label: newLabel.trim() || null },
                {
                  onSuccess: () => {
                    setNewCode("");
                    setNewLabel("");
                    toast.success("Code added");
                  },
                },
              );
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> Add code
          </Button>
        </div>

        {codes.length === 0 ? (
          <EmptyState
            icon={<Tag className="h-5 w-5" />}
            title="No service codes yet"
            description="Add the codes your contract covers — RHS, DSI, HHS, and so on."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Code</th>
                  <th className="px-2 py-2 text-left">Label</th>
                  <th className="px-2 py-2 text-left">Kind</th>
                  <th className="px-2 py-2 text-left">Unit</th>
                  <th className="px-2 py-2 text-left">Carve-out</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <Input
                        defaultValue={c.code}
                        onBlur={(e) =>
                          e.target.value !== c.code &&
                          upsert.mutate({ id: c.id, code: e.target.value })
                        }
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        defaultValue={c.label ?? ""}
                        onBlur={(e) =>
                          (e.target.value || null) !== c.label &&
                          upsert.mutate({ id: c.id, label: e.target.value || null })
                        }
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={c.kind}
                        onValueChange={(v) =>
                          upsert.mutate({ id: c.id, kind: v as CodeRow["kind"] })
                        }
                      >
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continuous">Continuous</SelectItem>
                          <SelectItem value="discrete">Discrete</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={c.unit}
                        onValueChange={(v) =>
                          upsert.mutate({ id: c.id, unit: v as CodeRow["unit"] })
                        }
                      >
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="hour">Hour</SelectItem>
                          <SelectItem value="unit15">15 min</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Switch
                        checked={c.carve_out}
                        onCheckedChange={(v) =>
                          upsert.mutate({ id: c.id, carve_out: v })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Remove ${c.code}?`)) del.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 2. Shift templates (per home)
// ============================================================================
type TeamMini = { id: string; team_name: string };
type Template = {
  id: string;
  team_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  active: boolean;
  sort: number;
};

function ShiftTemplatesPanel() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const teamsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-teams", orgId],
    queryFn: async (): Promise<TeamMini[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId!)
        .order("team_name");
      if (error) throw error;
      return (data ?? []) as TeamMini[];
    },
  });

  const tmplQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-templates", orgId],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("shift_templates")
        .select("id, team_id, name, start_time, end_time, active, sort")
        .eq("organization_id", orgId!)
        .order("team_id", { ascending: true, nullsFirst: true })
        .order("sort");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (v: Partial<Template> & { id?: string; team_id?: string | null }) => {
      if (v.id) {
        const { error } = await supabase
          .from("shift_templates")
          .update(v as never)
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shift_templates").insert({
          organization_id: orgId,
          team_id: v.team_id ?? null,
          name: v.name ?? "New shift",
          start_time: v.start_time ?? "07:00",
          end_time: v.end_time ?? "15:00",
          sort: v.sort ?? 100,
          active: true,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-templates", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-templates", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [selTeam, setSelTeam] = useState<string>("__org__");
  const teams = teamsQ.data ?? [];
  const templates = tmplQ.data ?? [];
  const teamId = selTeam === "__org__" ? null : selTeam;
  const visible = templates
    .filter((t) => (t.team_id ?? null) === teamId)
    .sort((a, b) => a.sort - b.sort);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-base font-semibold">Shift templates</p>
          <p className="text-sm text-muted-foreground">
            The shift bands the scheduler offers. Set org-wide defaults, then override per
            home as needed.
          </p>
        </div>
        <Select value={selTeam} onValueChange={setSelTeam}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__org__">Org-wide defaults</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-5 w-5" />}
            title="No shift bands yet"
            description={
              teamId
                ? "No overrides for this home. Add one to shadow the org defaults."
                : "Add bands like Morning 07:00–15:00, Evening 15:00–23:00, Overnight 23:00–07:00."
            }
            action={
              <Button
                onClick={() =>
                  upsert.mutate({ team_id: teamId, name: "New shift", sort: 100 })
                }
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Add band
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Start</th>
                    <th className="px-2 py-2 text-left">End</th>
                    <th className="px-2 py-2 text-left">Order</th>
                    <th className="px-2 py-2 text-left">Active</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          defaultValue={t.name}
                          onBlur={(e) =>
                            e.target.value !== t.name &&
                            upsert.mutate({ id: t.id, name: e.target.value })
                          }
                          className="h-8"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="time"
                          defaultValue={t.start_time?.slice(0, 5)}
                          onBlur={(e) =>
                            e.target.value !== t.start_time?.slice(0, 5) &&
                            upsert.mutate({ id: t.id, start_time: e.target.value })
                          }
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="time"
                          defaultValue={t.end_time?.slice(0, 5)}
                          onBlur={(e) =>
                            e.target.value !== t.end_time?.slice(0, 5) &&
                            upsert.mutate({ id: t.id, end_time: e.target.value })
                          }
                          className="h-8 w-28"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          defaultValue={t.sort}
                          onBlur={(e) =>
                            Number(e.target.value) !== t.sort &&
                            upsert.mutate({ id: t.id, sort: Number(e.target.value) })
                          }
                          className="h-8 w-20"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Switch
                          checked={t.active}
                          onCheckedChange={(v) => upsert.mutate({ id: t.id, active: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => confirm(`Delete ${t.name}?`) && del.mutate(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                upsert.mutate({
                  team_id: teamId,
                  name: "New shift",
                  sort: (visible.at(-1)?.sort ?? 100) + 10,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add band
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 3. Client ratios (per client, per setting)
// ============================================================================
type ClientMini = { id: string; first_name: string; last_name: string };
type Ratio = {
  id: string;
  client_id: string;
  setting: "residential" | "day_program" | "overnight_awake" | "overnight_asleep";
  ratio_staff: number;
  ratio_clients: number;
  effective_start: string;
  effective_end: string | null;
};

const SETTINGS: { value: Ratio["setting"]; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "day_program", label: "Day program" },
  { value: "overnight_awake", label: "Overnight awake" },
  { value: "overnight_asleep", label: "Overnight asleep" },
];

function ClientRatiosPanel() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-clients", orgId],
    queryFn: async (): Promise<ClientMini[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, account_status")
        .eq("organization_id", orgId!)
        .order("last_name");
      if (error) throw error;
      return (data ?? [])
        .filter((c) => ((c.account_status as string) ?? "active") !== "archived")
        .map((c) => ({
          id: c.id as string,
          first_name: c.first_name as string,
          last_name: c.last_name as string,
        }));
    },
  });

  const ratiosQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-ratios", orgId],
    queryFn: async (): Promise<Ratio[]> => {
      const { data, error } = await supabase
        .from("client_ratios")
        .select("id, client_id, setting, ratio_staff, ratio_clients, effective_start, effective_end")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Ratio[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (v: Partial<Ratio> & { id?: string; client_id?: string }) => {
      if (v.id) {
        const { error } = await supabase
          .from("client_ratios")
          .update(v as never)
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_ratios").insert({
          organization_id: orgId,
          client_id: v.client_id,
          setting: v.setting ?? "residential",
          ratio_staff: v.ratio_staff ?? 1,
          ratio_clients: v.ratio_clients ?? 1,
          effective_start: v.effective_start ?? new Date().toISOString().slice(0, 10),
          effective_end: v.effective_end ?? null,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-ratios", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_ratios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-ratios", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clients = clientsQ.data ?? [];
  const ratios = ratiosQ.data ?? [];
  const byClient = useMemo(() => {
    const m = new Map<string, Ratio[]>();
    for (const r of ratios) {
      const arr = m.get(r.client_id) ?? [];
      arr.push(r);
      m.set(r.client_id, arr);
    }
    return m;
  }, [ratios]);

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No active clients"
        description="Add clients first, then set their per-setting ratios here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {clients.map((c) => {
        const rows = byClient.get(c.id) ?? [];
        return (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <p className="font-display text-sm font-semibold">
                  {c.first_name} {c.last_name}
                </p>
                {rows.length === 0 && (
                  <p className="text-xs text-warning-foreground">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    No ratio set — add one to drive coverage
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => upsert.mutate({ client_id: c.id })}
              >
                <Plus className="h-3.5 w-3.5" /> Add ratio
              </Button>
            </CardHeader>
            {rows.length > 0 && (
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left">Setting</th>
                        <th className="px-2 py-2 text-left">Staff</th>
                        <th className="px-2 py-2 text-left">: Clients</th>
                        <th className="px-2 py-2 text-left">From</th>
                        <th className="px-2 py-2 text-left">Until</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Select
                              value={r.setting}
                              onValueChange={(v) =>
                                upsert.mutate({ id: r.id, setting: v as Ratio["setting"] })
                              }
                            >
                              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SETTINGS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min={1}
                              defaultValue={r.ratio_staff}
                              onBlur={(e) =>
                                Number(e.target.value) !== r.ratio_staff &&
                                upsert.mutate({
                                  id: r.id,
                                  ratio_staff: Math.max(1, Number(e.target.value)),
                                })
                              }
                              className="h-8 w-20 tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min={1}
                              defaultValue={r.ratio_clients}
                              onBlur={(e) =>
                                Number(e.target.value) !== r.ratio_clients &&
                                upsert.mutate({
                                  id: r.id,
                                  ratio_clients: Math.max(1, Number(e.target.value)),
                                })
                              }
                              className="h-8 w-20 tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="date"
                              defaultValue={r.effective_start}
                              onBlur={(e) =>
                                e.target.value !== r.effective_start &&
                                upsert.mutate({ id: r.id, effective_start: e.target.value })
                              }
                              className="h-8 w-36"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="date"
                              defaultValue={r.effective_end ?? ""}
                              onBlur={(e) =>
                                (e.target.value || null) !== r.effective_end &&
                                upsert.mutate({
                                  id: r.id,
                                  effective_end: e.target.value || null,
                                })
                              }
                              className="h-8 w-36"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => del.mutate(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================================
// 4. Authorizations (per client × code: annual_unit_authorization + dates)
// ============================================================================
type Auth = {
  id: string;
  client_id: string;
  service_code: string;
  unit_type: string;
  annual_unit_authorization: number;
  service_start_date: string | null;
  service_end_date: string | null;
};

function AuthorizationsPanel() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-clients", orgId],
    queryFn: async (): Promise<ClientMini[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, account_status")
        .eq("organization_id", orgId!)
        .order("last_name");
      if (error) throw error;
      return (data ?? [])
        .filter((c) => ((c.account_status as string) ?? "active") !== "archived")
        .map((c) => ({
          id: c.id as string,
          first_name: c.first_name as string,
          last_name: c.last_name as string,
        }));
    },
  });

  const codesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-codes-mini", orgId],
    queryFn: async (): Promise<CodeRow[]> => {
      const { data, error } = await supabase
        .from("provider_authorized_codes")
        .select("id, code, label, kind, unit, carve_out, status, sort")
        .eq("organization_id", orgId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as CodeRow[];
    },
  });

  const authsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["setup-auths", orgId],
    queryFn: async (): Promise<Auth[]> => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("id, client_id, service_code, unit_type, annual_unit_authorization, service_start_date, service_end_date")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Auth[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (v: Partial<Auth> & { id?: string; client_id?: string; service_code?: string }) => {
      if (v.id) {
        const { error } = await supabase
          .from("client_billing_codes")
          .update(v as never)
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_billing_codes").insert({
          organization_id: orgId,
          client_id: v.client_id,
          service_code: v.service_code,
          unit_type: v.unit_type ?? "H",
          annual_unit_authorization: v.annual_unit_authorization ?? 0,
          rate_per_unit: 0,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-auths", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_billing_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-auths", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [selClient, setSelClient] = useState<string>("");
  const [addCode, setAddCode] = useState<string>("");

  const clients = clientsQ.data ?? [];
  const codes = codesQ.data ?? [];
  const auths = authsQ.data ?? [];
  const activeClientId = selClient || clients[0]?.id;
  const rows = auths.filter((a) => a.client_id === activeClientId);
  const codeByName = new Map(codes.map((c) => [c.code, c]));
  const taken = new Set(rows.map((r) => r.service_code));
  const addable = codes.filter((c) => !taken.has(c.code));

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No active clients"
        description="Add clients first, then list each authorized code and amount here."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-base font-semibold">Authorizations</p>
          <p className="text-sm text-muted-foreground">
            Per client, the authorized amount for each code in the current plan year
            (e.g. RHS 365 days, DSI 520 hours).
          </p>
        </div>
        <Select value={activeClientId ?? ""} onValueChange={setSelClient}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Pick a client" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="grow basis-48">
            <Label className="text-xs">Add code</Label>
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger>
                <SelectValue placeholder={addable.length ? "Pick a code" : "All codes added"} />
              </SelectTrigger>
              <SelectContent>
                {addable.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.code}{c.label ? ` — ${c.label}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!addCode || !activeClientId}
            onClick={() => {
              const c = codeByName.get(addCode);
              upsert.mutate(
                {
                  client_id: activeClientId,
                  service_code: addCode,
                  unit_type:
                    c?.unit === "day" ? "D" : c?.unit === "unit15" ? "Q" : "H",
                  annual_unit_authorization: 0,
                },
                { onSuccess: () => setAddCode("") },
              );
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No authorizations for this client yet"
            description="Add the first authorized code above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Code</th>
                  <th className="px-2 py-2 text-left">Annual amount</th>
                  <th className="px-2 py-2 text-left">Unit</th>
                  <th className="px-2 py-2 text-left">Plan year start</th>
                  <th className="px-2 py-2 text-left">Plan year end</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const cdef = codeByName.get(a.service_code);
                  return (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">{a.service_code}</Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {cdef?.label ?? ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={a.annual_unit_authorization}
                          onBlur={(e) => {
                            const n = Math.max(0, Number(e.target.value) || 0);
                            if (n !== a.annual_unit_authorization)
                              upsert.mutate({ id: a.id, annual_unit_authorization: n });
                          }}
                          className="h-8 w-28 tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {a.unit_type === "D" ? "days" : a.unit_type === "Q" ? "15-min units" : "hours"}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          defaultValue={a.service_start_date ?? ""}
                          onBlur={(e) =>
                            (e.target.value || null) !== a.service_start_date &&
                            upsert.mutate({
                              id: a.id,
                              service_start_date: e.target.value || null,
                            })
                          }
                          className="h-8 w-36"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          defaultValue={a.service_end_date ?? ""}
                          onBlur={(e) =>
                            (e.target.value || null) !== a.service_end_date &&
                            upsert.mutate({
                              id: a.id,
                              service_end_date: e.target.value || null,
                            })
                          }
                          className="h-8 w-36"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            confirm(`Remove ${a.service_code}?`) && del.mutate(a.id)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
