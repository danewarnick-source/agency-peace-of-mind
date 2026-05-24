import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Loader2, X, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/assignments")({
  head: () => ({ meta: [{ title: "Caseloads — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <AssignmentsPage />
    </RequirePermission>
  ),
});

type Assignment = { id: string; staff_id: string; client_id: string };

function AssignmentsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [clientId, setClientId] = useState("");

  const { data: staff } = useQuery({
    enabled: !!org,
    queryKey: ["assign-staff", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase.from("organization_members").select("user_id")
        .eq("organization_id", org!.organization_id).eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["assign-clients", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name").eq("organization_id", org!.organization_id)
        .order("last_name");
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    enabled: !!org,
    queryKey: ["assignments", org?.organization_id],
    queryFn: async (): Promise<Assignment[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("staff_assignments" as any)
        .select("id, staff_id, client_id").eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const addMut = useMutation({
    mutationFn: async (v: { staff_id: string; client_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("staff_assignments" as any).insert({
        organization_id: org!.organization_id, staff_id: v.staff_id, client_id: v.client_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caseload assignment added");
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      setClientId("");
    },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Already assigned" : e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("staff_assignments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    (assignments ?? []).forEach((a) => {
      if (!m.has(a.staff_id)) m.set(a.staff_id, []);
      m.get(a.staff_id)!.push(a);
    });
    return m;
  }, [assignments]);

  const staffName = (id: string) => staff?.find((s) => s.id === id)?.name ?? "—";
  const clientName = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="h-6 w-6 text-muted-foreground" /> Caseload Assignments
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Map staff to the clients they may serve. Staff only see assigned clients in Time Clock and Daily Logs.
        </p>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Assign a client to staff</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label className="text-xs">Staff</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => addMut.mutate({ staff_id: staffId, client_id: clientId })}
              disabled={!staffId || !clientId || addMut.isPending}
            >
              {addMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Assign
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Current caseloads</h3>
        {!staff?.length ? (
          <p className="text-sm text-muted-foreground">No staff members yet.</p>
        ) : (
          <div className="space-y-3">
            {staff.map((s) => {
              const rows = grouped.get(s.id) ?? [];
              return (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">{s.name}</p>
                  {!rows.length ? (
                    <p className="text-xs text-muted-foreground">No clients assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map((a) => (
                        <Badge key={a.id} variant="secondary" className="gap-1 font-normal">
                          {clientName(a.client_id)}
                          <button onClick={() => removeMut.mutate(a.id)} className="ml-0.5 rounded-full hover:bg-muted-foreground/20">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
