import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";

type ScopeType = "all" | "service_code" | "staff_group" | "client";

interface ScopedMember {
  user_id: string;
  full_name: string;
  role: string;
  scopeType: ScopeType;
  refIds: string[];
  refLabels: string[];
}

interface ScopeRow {
  user_id: string;
  scope_type: ScopeType;
  scope_ref_id: string | null;
}

function scopeSummary(m: ScopedMember): string {
  if (m.scopeType === "all") return "All — no restriction";
  const typeLabel = m.scopeType === "service_code" ? "Service code" : m.scopeType === "staff_group" ? "Staff group" : "Client";
  if (!m.refLabels.length) return `${typeLabel}: none selected`;
  return `${typeLabel}: ${m.refLabels.join(", ")}`;
}

export function ScopeAssignmentsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ScopedMember | null>(null);

  const { data: staffGroups = [] } = useQuery({
    queryKey: ["staff-groups-simple", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("staff_groups").select("id, name").eq("organization_id", orgId).order("name");
      return data ?? [];
    },
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["scope-assignments", orgId],
    queryFn: async (): Promise<ScopedMember[]> => {
      const { data: om } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", orgId)
        .eq("active", true)
        .in("role", ["manager"]);
      if (!om?.length) return [];

      const userIds = om.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", userIds);
      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));

      const { data: scopesRaw } = await supabase
        .from("scope_assignments")
        .select("user_id, scope_type, scope_ref_id")
        .eq("organization_id", orgId)
        .in("user_id", userIds);
      const scopes = (scopesRaw ?? []) as ScopeRow[];

      const clientIds = scopes
        .filter((s) => s.scope_type === "client" && s.scope_ref_id)
        .map((s) => s.scope_ref_id as string);
      let clientNameMap = new Map<string, string>();
      if (clientIds.length) {
        const { data: clients } = await supabase.from("clients").select("id, first_name, last_name").in("id", clientIds);
        clientNameMap = new Map((clients ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));
      }
      const groupNameMap = new Map((staffGroups as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]));

      return om.map((m) => {
        const myScopes = scopes.filter((s) => s.user_id === m.user_id);
        const scopeType: ScopeType = myScopes[0]?.scope_type ?? "all";
        const refIds = myScopes.map((s) => s.scope_ref_id).filter(Boolean) as string[];
        const refLabels = refIds.map((id) => {
          if (scopeType === "client") return clientNameMap.get(id) ?? id;
          if (scopeType === "staff_group") return groupNameMap.get(id) ?? id;
          const code = EVV_SERVICE_CODES.find((c) => c.code === id);
          return code?.code ?? id;
        });
        return {
          user_id: m.user_id,
          full_name: nameMap.get(m.user_id) ?? "Unknown",
          role: m.role,
          scopeType,
          refIds,
          refLabels,
        };
      });
    },
    enabled: !!orgId,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This person will only see clients, staff, and data that falls within their assigned
        scope. If no scope is set, they see everything their permissions allow.
      </p>
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : !members.length ? (
          <div className="p-6 text-sm text-muted-foreground">No supervisors to scope yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-medium">{m.full_name}</div>
                  <div className="text-xs text-muted-foreground">Supervisor · {scopeSummary(m)}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(m)}>Edit scope</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditScopeDrawer
          orgId={orgId}
          member={editing}
          staffGroups={staffGroups as Array<{ id: string; name: string }>}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["scope-assignments", orgId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditScopeDrawer({
  orgId,
  member,
  staffGroups,
  onClose,
  onSaved,
}: {
  orgId: string;
  member: ScopedMember;
  staffGroups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scopeType, setScopeType] = useState<ScopeType>(member.scopeType);
  const [selected, setSelected] = useState<string[]>(member.refIds);
  const [clientSearch, setClientSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["scope-client-search", orgId, clientSearch],
    queryFn: async () => {
      let q = supabase.from("clients").select("id, first_name, last_name").eq("organization_id", orgId).limit(25);
      if (clientSearch) q = q.ilike("first_name", `%${clientSearch}%`);
      const { data } = await q;
      return data ?? [];
    },
    enabled: scopeType === "client",
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("scope_assignments")
        .delete()
        .eq("organization_id", orgId)
        .eq("user_id", member.user_id);
      if (delErr) throw new Error(delErr.message);

      if (scopeType === "all") {
        const { error } = await supabase.from("scope_assignments").insert({
          organization_id: orgId,
          user_id: member.user_id,
          scope_type: "all",
          scope_ref_id: null,
        });
        if (error) throw new Error(error.message);
      } else if (selected.length) {
        const { error } = await supabase.from("scope_assignments").insert(
          selected.map((refId) => ({
            organization_id: orgId,
            user_id: member.user_id,
            scope_type: scopeType,
            scope_ref_id: refId,
          })),
        );
        if (error) throw new Error(error.message);
      }
      toast.success("Scope updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update scope");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit scope — {member.full_name}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <p className="text-xs text-muted-foreground">
            This person will only see clients, staff, and data that falls within their assigned
            scope. If no scope is set, they see everything their permissions allow.
          </p>

          <RadioGroup value={scopeType} onValueChange={(v) => { setScopeType(v as ScopeType); setSelected([]); }} className="space-y-2">
            <label className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
              <RadioGroupItem value="all" /> All data in org (no restriction)
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
              <RadioGroupItem value="service_code" /> Specific service codes
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
              <RadioGroupItem value="staff_group" /> Specific staff groups
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
              <RadioGroupItem value="client" /> Specific clients
            </label>
          </RadioGroup>

          {scopeType === "service_code" && (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {EVV_SERVICE_CODES.map((c) => (
                <label key={c.code} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.includes(c.code)} onCheckedChange={() => toggle(c.code)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}

          {scopeType === "staff_group" && (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {!staffGroups.length && <p className="p-2 text-xs text-muted-foreground">No staff groups yet.</p>}
              {staffGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.includes(g.id)} onCheckedChange={() => toggle(g.id)} />
                  {g.name}
                </label>
              ))}
            </div>
          )}

          {scopeType === "client" && (
            <div className="space-y-2">
              <Input placeholder="Search clients…" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                {clients.map((c: { id: string; first_name: string; last_name: string }) => (
                  <label key={c.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-muted/40">
                    <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                    {c.first_name} {c.last_name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={saving || (scopeType !== "all" && !selected.length)}
              onClick={save}
            >
              {saving ? "Saving…" : "Save scope"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
