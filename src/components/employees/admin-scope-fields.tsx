import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import {
  adminScopeIsLockedWholeOrg,
  adminScopeSummary,
  type AdminScopeMode,
  type ParsedAdminScope,
} from "@/lib/admin-scope";

const MODE_LABEL: Record<AdminScopeMode, string> = {
  all: "Whole organization",
  selected: "Selected clients and staff",
  service_code: "Service code",
};

export function AdminScopeFields({
  orgId,
  role,
  editing,
  draft,
  onChange,
}: {
  orgId: string;
  role: string | null;
  editing: boolean;
  draft: ParsedAdminScope;
  onChange: (next: ParsedAdminScope) => void;
}) {
  const locked = adminScopeIsLockedWholeOrg(role);
  const [clientSearch, setClientSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");

  const clientsQ = useQuery({
    queryKey: ["admin-scope-clients", orgId, clientSearch],
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .limit(40);
      if (clientSearch.trim()) q = q.ilike("first_name", `%${clientSearch.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!orgId && editing && !locked && draft.mode === "selected",
  });

  const staffQ = useQuery({
    queryKey: ["admin-scope-staff", orgId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", orgId)
        .eq("active", true);
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", ids);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));
      return (members ?? [])
        .map((m) => ({
          user_id: m.user_id,
          role: m.role,
          full_name: nameById.get(m.user_id) ?? "Unknown",
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    enabled: !!orgId && editing && !locked && draft.mode === "selected",
  });

  const toggle = (list: "clientIds" | "staffIds" | "serviceCodes", id: string) => {
    const cur = draft[list];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange({ ...draft, [list]: next });
  };

  const setMode = (mode: AdminScopeMode) => {
    onChange({
      mode,
      clientIds: mode === "selected" ? draft.clientIds : [],
      staffIds: mode === "selected" ? draft.staffIds : [],
      serviceCodes: mode === "service_code" ? draft.serviceCodes : [],
      legacyStaffGroupIds: [],
    });
  };

  if (locked || !editing) {
    return (
      <div className="space-y-1">
        <p className="text-sm">{locked ? "Whole organization" : adminScopeSummary(draft)}</p>
        {locked ? (
          <p className="text-xs text-muted-foreground">Owner always sees the whole organization.</p>
        ) : null}
      </div>
    );
  }

  const staffRows = (staffQ.data ?? []).filter((s) =>
    staffSearch.trim()
      ? s.full_name.toLowerCase().includes(staffSearch.trim().toLowerCase())
      : true,
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Admin scope is not caseload. It limits which clients and staff this
        supervisor or program manager can see in the Provider Interface.
      </p>
      <RadioGroup value={draft.mode} onValueChange={(v) => setMode(v as AdminScopeMode)} className="space-y-2">
        {(Object.keys(MODE_LABEL) as AdminScopeMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
            <RadioGroupItem value={mode} /> {MODE_LABEL[mode]}
          </label>
        ))}
      </RadioGroup>

      {draft.mode === "selected" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clients</p>
            <Input
              placeholder="Search clients"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {(clientsQ.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={draft.clientIds.includes(c.id)}
                    onCheckedChange={() => toggle("clientIds", c.id)}
                  />
                  {c.first_name} {c.last_name}
                </label>
              ))}
              {draft.clientIds
                .filter((id) => !(clientsQ.data ?? []).some((c) => c.id === id))
                .map((id) => (
                  <label key={id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                    <Checkbox checked onCheckedChange={() => toggle("clientIds", id)} />
                    Selected client
                  </label>
                ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</p>
            <Input
              placeholder="Search staff"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
            />
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {staffRows.map((s) => (
                <label key={s.user_id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={draft.staffIds.includes(s.user_id)}
                    onCheckedChange={() => toggle("staffIds", s.user_id)}
                  />
                  {s.full_name}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {draft.mode === "service_code" && (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
          {EVV_SERVICE_CODES.map((c) => (
            <label key={c.code} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
              <Checkbox
                checked={draft.serviceCodes.includes(c.code)}
                onCheckedChange={() => toggle("serviceCodes", c.code)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
