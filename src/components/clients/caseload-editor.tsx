// Bulk caseload editor for a single client. Multi-select staff with
// add/remove diff, saves via setClientCaseload.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Save, X } from "lucide-react";
import { setClientCaseload } from "@/lib/scheduler/setup.functions";

type StaffOption = { id: string; name: string };

export function CaseloadEditor({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const saveFn = useServerFn(setClientCaseload);

  // Pool of staff in the org
  const staffQ = useQuery({
    enabled: !!orgId,
    queryKey: ["caseload-editor-staff", orgId],
    queryFn: async (): Promise<StaffOption[]> => {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (mErr) throw mErr;
      const ids = (members ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name, is_active")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profs ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        full_name: string | null; is_active: boolean | null;
      }>)
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          name:
            (p.full_name?.trim()) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Current assignments for this client
  const currentQ = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["caseload-editor-current", orgId, clientId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("staff_assignments")
        .select("staff_id")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { staff_id: string }).staff_id);
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Seed selection from current once both queries land
  useEffect(() => {
    if (currentQ.data) setSelected(new Set(currentQ.data));
  }, [currentQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = staffQ.data ?? [];
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q));
  }, [staffQ.data, search]);

  const original = useMemo(
    () => new Set(currentQ.data ?? []),
    [currentQ.data],
  );
  const toAdd = useMemo(
    () => Array.from(selected).filter((id) => !original.has(id)),
    [selected, original],
  );
  const toRemove = useMemo(
    () => Array.from(original).filter((id) => !selected.has(id)),
    [selected, original],
  );
  const dirty = toAdd.length > 0 || toRemove.length > 0;

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organization_id: orgId!,
          client_id: clientId,
          staff_ids: Array.from(selected),
        },
      }),
    onSuccess: (r: { added: number; removed: number }) => {
      toast.success(
        `Caseload saved — ${r.added} added, ${r.removed} removed.`,
      );
      qc.invalidateQueries({ queryKey: ["caseload-editor-current"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
      qc.invalidateQueries({ queryKey: ["finish-onboarding", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function reset() {
    setSelected(new Set(currentQ.data ?? []));
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Caseload — staff who can work with this client</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Add or remove several staff at once. Only assigned staff can be
            scheduled or take open shifts for this client.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={!dirty || saveM.isPending}
            className="min-h-11"
          >
            <X className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button
            size="sm"
            onClick={() => saveM.mutate()}
            disabled={!dirty || saveM.isPending || !orgId}
            className="min-h-11"
          >
            <Save className="h-4 w-4 mr-1" />
            {saveM.isPending ? "Saving…" : `Save (${toAdd.length}+/${toRemove.length}−)`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Badge variant="outline" className="ml-auto">
            {selected.size} selected
          </Badge>
        </div>

        {staffQ.isLoading || currentQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading staff…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff match.</p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[420px] overflow-y-auto rounded border p-2">
            {filtered.map((s) => {
              const checked = selected.has(s.id);
              const wasOriginal = original.has(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 rounded px-2 py-2 text-sm cursor-pointer hover:bg-muted min-h-11 ${
                    checked ? "bg-muted/40" : ""
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {checked && !wasOriginal && (
                    <Badge variant="default" className="text-[10px]">new</Badge>
                  )}
                  {!checked && wasOriginal && (
                    <Badge variant="destructive" className="text-[10px]">remove</Badge>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
