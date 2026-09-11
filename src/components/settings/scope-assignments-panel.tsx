import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { setScopeAssignments } from "@/lib/permissions.functions";
import { ROLE_LABEL, type ProviderRole } from "@/lib/rbac";
import { adminScopeSummary, parseAdminScope, type ParsedAdminScope } from "@/lib/admin-scope";
import { AdminScopeFields } from "@/components/employees/admin-scope-fields";

interface ScopedMember {
  user_id: string;
  full_name: string;
  role: string;
  scope: ParsedAdminScope;
}

export function ScopeAssignmentsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ScopedMember | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["scope-assignments", orgId],
    queryFn: async (): Promise<ScopedMember[]> => {
      const { data: om } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", orgId)
        .eq("active", true)
        .in("role", ["manager", "program_manager"]);
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

      return om.map((m) => {
        const myScopes = (scopesRaw ?? []).filter((s) => s.user_id === m.user_id);
        return {
          user_id: m.user_id,
          full_name: nameMap.get(m.user_id) ?? "Unknown",
          role: m.role,
          scope: parseAdminScope(myScopes),
        };
      });
    },
    enabled: !!orgId,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Admin scope is not caseload. Supervisors and program managers only see clients, staff, and
        data inside this assignment. Owners stay whole-organization. Edit the same scope on the
        employee Profile.
      </p>
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : !members.length ? (
          <div className="p-6 text-sm text-muted-foreground">
            No supervisors or program managers to scope yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-medium">{m.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE_LABEL[m.role as ProviderRole] ?? m.role} · {adminScopeSummary(m.scope)}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                  Edit scope
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditScopeDrawer
          orgId={orgId}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["scope-assignments", orgId] });
            qc.invalidateQueries({ queryKey: ["staff-admin-scope", orgId, editing.user_id] });
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
  onClose,
  onSaved,
}: {
  orgId: string;
  member: ScopedMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ParsedAdminScope>(member.scope);
  const [saving, setSaving] = useState(false);
  const setScopeFn = useServerFn(setScopeAssignments);

  const save = async () => {
    if (draft.mode === "selected" && !draft.clientIds.length && !draft.staffIds.length) {
      toast.error("Select at least one client or staff member.");
      return;
    }
    if (draft.mode === "service_code" && !draft.serviceCodes.length) {
      toast.error("Select at least one service code.");
      return;
    }
    setSaving(true);
    try {
      await setScopeFn({
        data: {
          organizationId: orgId,
          targetUserId: member.user_id,
          mode: draft.mode,
          clientIds: draft.clientIds,
          staffIds: draft.staffIds,
          serviceCodes: draft.serviceCodes,
        },
      });
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
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Admin scope — {member.full_name}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <AdminScopeFields
            orgId={orgId}
            role={member.role}
            editing
            draft={draft}
            onChange={setDraft}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save scope"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
