// Bulk caseload editor for a single client. Multi-select staff with
// per-service-code scope (default "All codes", optionally a subset of the
// client's authorized codes). Saves via setClientCaseload.
//
// Two modes:
//   • Live mode (clientId set, draftMode unset): fetches the current
//     assignments + authorized codes for the client and writes to DB.
//   • Draft mode (draftMode=true, controlled by value/onChange + explicit
//     authorizedCodes): used during the import-finalize step, BEFORE the
//     client row exists. Parent persists the chosen assignments after the
//     client is created.
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Search, Save, X, Tag } from "lucide-react";
import { setClientCaseload } from "@/lib/scheduler/setup.functions";

type StaffOption = { id: string; name: string };

/** value semantics: null = "all codes"; string[] = explicit subset. */
export type CaseloadDraftValue = Map<string, string[] | null>;

export type CaseloadEditorProps = {
  clientId?: string;
  draftMode?: boolean;
  /** Required when draftMode=true. */
  authorizedCodes?: string[];
  /** Controlled state in draft mode. */
  value?: CaseloadDraftValue;
  onChange?: (next: CaseloadDraftValue) => void;
};

export function CaseloadEditor(props: CaseloadEditorProps) {
  const { clientId, draftMode = false, authorizedCodes, value, onChange } = props;
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const saveFn = useServerFn(setClientCaseload);

  // Staff pool (same in both modes).
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

  // Live mode only: existing assignments + client's authorized codes.
  const currentQ = useQuery({
    enabled: !draftMode && !!orgId && !!clientId,
    queryKey: ["caseload-editor-current-v2", orgId, clientId],
    queryFn: async (): Promise<{
      assignments: Array<{ staff_id: string; service_codes: string[] | null }>;
      codes: string[];
    }> => {
      const [a, c] = await Promise.all([
        supabase
          .from("staff_assignments")
          .select("staff_id, service_codes")
          .eq("organization_id", orgId!)
          .eq("client_id", clientId!),
        supabase
          .from("clients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("authorized_dspd_codes, job_code" as any)
          .eq("id", clientId!)
          .maybeSingle(),
      ]);
      if (a.error) throw a.error;
      if (c.error) throw c.error;
      const codes = Array.from(new Set([
        ...(((c.data as { authorized_dspd_codes?: string[] } | null)?.authorized_dspd_codes) ?? []),
        ...(((c.data as { job_code?: string[] } | null)?.job_code) ?? []),
      ].filter(Boolean)));
      return {
        assignments: ((a.data ?? []) as Array<{ staff_id: string; service_codes: string[] | null }>),
        codes,
      };
    },
  });

  // Local state for live mode; draft mode is controlled via value/onChange.
  const [liveState, setLiveState] = useState<CaseloadDraftValue>(new Map());
  const [search, setSearch] = useState("");

  // Seed live state once.
  useEffect(() => {
    if (draftMode) return;
    if (!currentQ.data) return;
    const next: CaseloadDraftValue = new Map();
    for (const r of currentQ.data.assignments) {
      next.set(r.staff_id, r.service_codes ?? null);
    }
    setLiveState(next);
  }, [draftMode, currentQ.data]);

  const codes = draftMode
    ? (authorizedCodes ?? [])
    : (currentQ.data?.codes ?? []);

  const state: CaseloadDraftValue = draftMode ? (value ?? new Map()) : liveState;
  const setState = (next: CaseloadDraftValue) => {
    if (draftMode) onChange?.(next);
    else setLiveState(next);
  };

  const original = useMemo<CaseloadDraftValue>(() => {
    if (draftMode) return new Map(); // draft starts empty; parent owns persistence
    const m: CaseloadDraftValue = new Map();
    for (const r of currentQ.data?.assignments ?? []) m.set(r.staff_id, r.service_codes ?? null);
    return m;
  }, [draftMode, currentQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = staffQ.data ?? [];
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q));
  }, [staffQ.data, search]);

  function eqCodes(a: string[] | null, b: string[] | null): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }

  const { toAdd, toRemove, toChange } = useMemo(() => {
    const add: string[] = [];
    const remove: string[] = [];
    const change: string[] = [];
    for (const [id, codes] of state.entries()) {
      if (!original.has(id)) add.push(id);
      else if (!eqCodes(original.get(id) ?? null, codes)) change.push(id);
    }
    for (const id of original.keys()) {
      if (!state.has(id)) remove.push(id);
    }
    return { toAdd: add, toRemove: remove, toChange: change };
  }, [state, original]);
  const dirty = toAdd.length + toRemove.length + toChange.length > 0;

  const saveM = useMutation({
    mutationFn: () => {
      const assignments = Array.from(state.entries()).map(([staff_id, service_codes]) => ({
        staff_id, service_codes,
      }));
      return saveFn({
        data: {
          organization_id: orgId!,
          client_id: clientId!,
          assignments,
        },
      });
    },
    onSuccess: (r: { added: number; removed: number; updated?: number }) => {
      toast.success(
        `Caseload saved — ${r.added} added, ${r.updated ?? 0} updated, ${r.removed} removed.`,
      );
      qc.invalidateQueries({ queryKey: ["caseload-editor-current-v2"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
      qc.invalidateQueries({ queryKey: ["finish-onboarding", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleStaff(id: string) {
    const next = new Map(state);
    if (next.has(id)) next.delete(id);
    else next.set(id, null); // default = All codes
    setState(next);
  }

  function setStaffCodes(id: string, codes: string[] | null) {
    const next = new Map(state);
    next.set(id, codes);
    setState(next);
  }

  function reset() {
    setState(new Map(original));
  }

  function scopeSummary(v: string[] | null | undefined): string {
    if (v === null || v === undefined) return "All codes";
    if (v.length === 0) return "No codes";
    return v.join(", ");
  }

  const showSaveBar = !draftMode;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">
            {draftMode
              ? "Assign staff — who can work with this client"
              : "Caseload — staff who can work with this client"}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Each staff defaults to <strong>All codes</strong>. Open the
            scope picker to limit a staff to specific service codes (e.g.
            “Julie covers HHS only”). Only assigned staff can be scheduled or
            take open shifts for this client.
          </p>
        </div>
        {showSaveBar && (
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
              disabled={!dirty || saveM.isPending || !orgId || !clientId}
              className="min-h-11"
            >
              <Save className="h-4 w-4 mr-1" />
              {saveM.isPending
                ? "Saving…"
                : `Save (${toAdd.length}+/${toChange.length}~/${toRemove.length}−)`}
            </Button>
          </div>
        )}
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
            {state.size} assigned
          </Badge>
        </div>

        {staffQ.isLoading || (!draftMode && currentQ.isLoading) ? (
          <p className="text-sm text-muted-foreground">Loading staff…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff match.</p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 max-h-[420px] overflow-y-auto rounded border p-2">
            {filtered.map((s) => {
              const checked = state.has(s.id);
              const wasOriginal = original.has(s.id);
              const scope = state.get(s.id) ?? null;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted min-h-11 ${
                    checked ? "bg-muted/40" : ""
                  }`}
                >
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStaff(s.id)}
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                  </label>
                  {checked && (
                    <CodeScopePopover
                      authorized={codes}
                      value={scope}
                      onChange={(c) => setStaffCodes(s.id, c)}
                      summary={scopeSummary(scope)}
                    />
                  )}
                  {checked && !wasOriginal && (
                    <Badge variant="default" className="text-[10px]">new</Badge>
                  )}
                  {!checked && wasOriginal && (
                    <Badge variant="destructive" className="text-[10px]">remove</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CodeScopePopover({
  authorized,
  value,
  onChange,
  summary,
}: {
  authorized: string[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  summary: string;
}) {
  const isAll = value === null;
  const subset = new Set(value ?? []);

  function toggle(code: string) {
    // Start from current effective set.
    const cur = new Set<string>(isAll ? authorized : value ?? []);
    if (cur.has(code)) cur.delete(code);
    else cur.add(code);
    const arr = Array.from(cur);
    if (arr.length === 0) {
      // Treat empty pick as "no codes" — but the writer drops empty,
      // so let the user uncheck the staff entirely. Keep as empty so the
      // summary reflects intent; parent validates on submit.
      onChange([]);
      return;
    }
    if (authorized.length > 0 && arr.length === authorized.length) {
      onChange(null);
    } else {
      onChange(arr);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] gap-1"
        >
          <Tag className="h-3 w-3" />
          <span className="max-w-[140px] truncate">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="text-xs font-medium px-1 pb-1">Service-code scope</div>
        {authorized.length === 0 ? (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            No authorized codes on this client yet — staff will be assigned to
            All codes by default. Add codes on the client&apos;s billing tab to
            narrow scope.
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`w-full text-left text-xs rounded px-2 py-1.5 hover:bg-muted ${isAll ? "bg-muted font-medium" : ""}`}
              onClick={() => onChange(null)}
            >
              All codes ({authorized.length})
            </button>
            <div className="my-1 h-px bg-border" />
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {authorized.map((c) => {
                const on = isAll ? true : subset.has(c);
                return (
                  <label
                    key={c}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox checked={on} onCheckedChange={() => toggle(c)} />
                    <span className="font-mono">{c}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
