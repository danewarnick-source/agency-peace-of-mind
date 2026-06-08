import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Loader2, ChevronDown, ChevronRight, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { isDailyServiceCode } from "@/lib/service-billing";
import { getUnmetStaffMandates } from "@/lib/forms.functions";

export const Route = createFileRoute("/dashboard/assignments")({
  head: () => ({ meta: [{ title: "Caseloads — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <AssignmentsPage />
    </RequirePermission>
  ),
});

type AssignmentRow = {
  id: string;
  staff_id: string;
  client_id: string;
  service_codes: string[] | null;
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_code: string[] | null;
};

function AssignmentsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");

  const { data: staff } = useQuery({
    enabled: !!org,
    queryKey: ["assign-staff", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", ids);
      return (profs ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["assign-clients", org?.organization_id],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, job_code" as any)
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      return ((data ?? []) as unknown) as ClientRow[];
    },
  });

  const { data: assignments } = useQuery({
    enabled: !!org && !!staffId,
    queryKey: ["assignments-for-staff", org?.organization_id, staffId],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("staff_assignments")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, staff_id, client_id, service_codes" as any)
        .eq("organization_id", org!.organization_id)
        .eq("staff_id", staffId);
      if (error) throw error;
      return ((data ?? []) as unknown) as AssignmentRow[];
    },
  });

  // Local working state: { clientId: Set<code> }. Empty/missing = unassigned.
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!assignments || !clients) return;
    const next: Record<string, Set<string>> = {};
    for (const a of assignments) {
      const c = clients.find((x) => x.id === a.client_id);
      const all = (c?.job_code ?? []).filter(Boolean);
      // null service_codes = legacy "all codes"
      next[a.client_id] = new Set(a.service_codes && a.service_codes.length ? a.service_codes : all);
    }
    setDraft(next);
  }, [assignments, clients]);

  const counts = useMemo(() => {
    let clientsN = 0;
    let servicesN = 0;
    for (const [, codes] of Object.entries(draft)) {
      if (codes.size > 0) {
        clientsN += 1;
        servicesN += codes.size;
      }
    }
    return { clientsN, servicesN };
  }, [draft]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!org || !staffId) return;
      // Diff: upsert rows where codes>0, delete rows that exist but are now empty/unassigned.
      const existing = new Map<string, AssignmentRow>();
      (assignments ?? []).forEach((a) => existing.set(a.client_id, a));

      const toDelete: string[] = [];
      const toUpsert: { client_id: string; codes: string[] }[] = [];

      const allClientIds = new Set<string>([
        ...Object.keys(draft),
        ...Array.from(existing.keys()),
      ]);
      for (const cid of allClientIds) {
        const codes = Array.from(draft[cid] ?? new Set<string>()).sort();
        const wasAssigned = existing.has(cid);
        if (codes.length === 0 && wasAssigned) {
          toDelete.push(existing.get(cid)!.id);
        } else if (codes.length > 0) {
          toUpsert.push({ client_id: cid, codes });
        }
      }

      if (toDelete.length) {
        const { error } = await supabase
          .from("staff_assignments")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      for (const row of toUpsert) {
        const existingRow = existing.get(row.client_id);
        if (existingRow) {
          const { error } = await supabase
            .from("staff_assignments")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ service_codes: row.codes } as any)
            .eq("id", existingRow.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("staff_assignments")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({
              organization_id: org.organization_id,
              staff_id: staffId,
              client_id: row.client_id,
              service_codes: row.codes,
            } as any);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Caseload saved");
      qc.invalidateQueries({ queryKey: ["assignments-for-staff"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      qc.invalidateQueries({ queryKey: ["nectar-pay-period"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stage-2 staff-mandate WARN-AND-NEVER-BLOCK at caseload save.
  // We run detection only when the save would create at least one NEW
  // (staff, client) assignment. Edits to existing assignments and deletions
  // never warn. The detection is best-effort: on any error we proceed.
  const fetchUnmet = useServerFn(getUnmetStaffMandates);
  const [pendingWarning, setPendingWarning] = useState<{ names: string[] } | null>(null);

  async function attemptSave() {
    if (!org || !staffId) return;
    const existingClientIds = new Set((assignments ?? []).map((a) => a.client_id));
    const hasNewAssignment = Object.entries(draft).some(
      ([cid, codes]) => codes.size > 0 && !existingClientIds.has(cid),
    );
    if (!hasNewAssignment) {
      saveMut.mutate();
      return;
    }
    try {
      const res = await fetchUnmet({ data: { staffId } });
      const names = (res?.unmet ?? []).map((u) => u.name);
      if (names.length > 0) {
        setPendingWarning({ names });
        return;
      }
    } catch (err) {
      // Best-effort: never block the save on detection failure.
      console.warn("[assignments] unmet-mandate detection failed; proceeding without warning", err);
    }
    saveMut.mutate();
  }

  function toggleCode(cid: string, code: string) {
    setDraft((prev) => {
      const next = { ...prev };
      const set = new Set(next[cid] ?? []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      next[cid] = set;
      return next;
    });
  }

  function toggleClientAll(cid: string, allCodes: string[]) {
    setDraft((prev) => {
      const cur = prev[cid] ?? new Set<string>();
      const next = { ...prev };
      // If any are selected → clear all. Else select all.
      if (cur.size > 0) next[cid] = new Set();
      else next[cid] = new Set(allCodes);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="h-6 w-6 text-muted-foreground" /> Caseload Assignment Center
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign staff to specific clients <strong>and</strong> the service codes they cover for each.
          Staff only see their assigned clients and codes in Time Clock, Daily Logs, and NECTAR.
        </p>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-1.5">
            <Label className="text-xs">Staff member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
              <SelectContent>
                {staff?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold tabular-nums text-[color:var(--navy-900,#0d112b)]">
              {counts.clientsN} clients · {counts.servicesN} services selected
            </span>
            <Button
              onClick={() => { void attemptSave(); }}
              disabled={!staffId || saveMut.isPending}
              className="h-11 bg-[image:var(--gradient-amber)] text-[#412402] hover:brightness-95"
            >
              {saveMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save caseload
            </Button>
          </div>
        </div>
      </Card>

      {staffId && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Clients & service codes</h3>
          {!clients?.length ? (
            <p className="text-sm text-muted-foreground">No clients yet.</p>
          ) : (
            <ul className="space-y-2">
              {clients.map((c) => (
                <ClientAssignRow
                  key={c.id}
                  client={c}
                  selected={draft[c.id] ?? new Set()}
                  onToggleCode={(code) => toggleCode(c.id, code)}
                  onToggleAll={(codes) => toggleClientAll(c.id, codes)}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      <AlertDialog
        open={!!pendingWarning}
        onOpenChange={(o) => { if (!o) setPendingWarning(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Required forms not complete
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This staffer has {pendingWarning?.names.length} incomplete required form
                  {(pendingWarning?.names.length ?? 0) === 1 ? "" : "s"}:
                </p>
                <ul className="list-disc pl-5">
                  {pendingWarning?.names.map((n) => (<li key={n}>{n}</li>))}
                </ul>
                <p className="text-muted-foreground">
                  You can proceed; this will be recorded.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingWarning(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setPendingWarning(null); saveMut.mutate(); }}
            >
              Proceed anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientAssignRow({
  client,
  selected,
  onToggleCode,
  onToggleAll,
}: {
  client: ClientRow;
  selected: Set<string>;
  onToggleCode: (code: string) => void;
  onToggleAll: (codes: string[]) => void;
}) {
  const codes = (client.job_code ?? []).filter(Boolean);
  const [open, setOpen] = useState(false);

  const allChecked = codes.length > 0 && codes.every((c) => selected.has(c));
  const someChecked = codes.some((c) => selected.has(c)) && !allChecked;

  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 p-3">
        <Checkbox
          checked={allChecked ? true : someChecked ? "indeterminate" : false}
          onCheckedChange={() => onToggleAll(codes)}
          aria-label={`Assign all services for ${client.first_name} ${client.last_name}`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            {client.first_name} {client.last_name}
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {selected.size}/{codes.length} codes
            </span>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-muted/20 p-3">
          {!codes.length ? (
            <p className="text-xs text-muted-foreground">
              No service codes on file for this client.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {codes.map((code) => {
                const daily = isDailyServiceCode(code);
                const checked = selected.has(code);
                return (
                  <label
                    key={code}
                    className={[
                      "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition",
                      checked
                        ? "border-[color:var(--amber-600,#f59324)] bg-[image:var(--gradient-amber)]/40"
                        : "border-border bg-background hover:border-[color:var(--amber-600,#f59324)]/50",
                    ].join(" ")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleCode(code)}
                      aria-label={`Assign ${code}`}
                    />
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {code}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          daily
                            ? "bg-[color:var(--navy-900,#0d112b)] text-white"
                            : "bg-[image:var(--gradient-amber)] text-[#412402]",
                        ].join(" ")}
                      >
                        {daily ? "Daily" : "Hourly"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
