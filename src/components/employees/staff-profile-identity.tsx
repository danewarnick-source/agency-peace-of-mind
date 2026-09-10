import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IfPermission } from "@/components/rbac-guard";
import { setMemberGrants } from "@/lib/team-access.functions";
import { onStaffHired } from "@/lib/staff-assignment-hooks.functions";

export type StaffIdentityProfile = {
  full_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  hire_date: string | null;
  start_date: string | null;
};

export type StaffIdentityMember = {
  id: string;
  role: string;
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

export function StaffProfileIdentity({
  orgId,
  staffId,
  profile,
  member,
  onSaved,
}: {
  orgId: string;
  staffId: string;
  profile: StaffIdentityProfile | null;
  member: StaffIdentityMember;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const setGrantsFn = useServerFn(setMemberGrants);
  const hireHookFn = useServerFn(onStaffHired);
  const [draft, setDraft] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "employee",
    hire_date: "",
  });

  const startEdit = () => {
    setDraft({
      full_name: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      role: member.role,
      hire_date: profile?.hire_date ?? profile?.start_date ?? "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          full_name: draft.full_name,
          email: draft.email || null,
          phone: draft.phone || null,
          hire_date: draft.hire_date || null,
          start_date: draft.hire_date || null,
        } as any)
        .eq("id", staffId);
      if (error) throw new Error(error.message);
      if (draft.hire_date) {
        try {
          await hireHookFn({ data: { organizationId: orgId, staffId } });
        } catch (e) {
          console.warn("[obligations] hire auto-assign failed:", e);
        }
      }
      if (draft.role !== member.role) {
        await setGrantsFn({
          data: {
            organization_id: orgId,
            membership_id: member.id,
            target_user_id: staffId,
            explicit_role: draft.role as "admin" | "program_manager" | "committee_member" | "employee" | "manager",
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      onSaved();
    },
    onError: (e) =>
      toast.error(
        (e as Error).message.includes("Unauthorized")
          ? "Only organization admins can change user roles."
          : (e as Error).message,
      ),
  });

  const hireDate = profile?.hire_date ?? profile?.start_date ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Identity & job
        </CardTitle>
        <IfPermission perm="edit_staff_records">
          <button
            type="button"
            aria-label={editing ? "Cancel edit" : "Edit identity"}
            onClick={editing ? () => setEditing(false) : startEdit}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:border-muted-foreground/40"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </IfPermission>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="space-y-0">
            <Row label="Full name" value={profile?.full_name ?? "—"} />
            <Row label="Email" value={profile?.email ?? "—"} />
            <Row label="Username" value={profile?.username ?? "—"} />
            <Row label="Phone" value={profile?.phone ?? "—"} />
            <Row label="Role" value={member.role} />
            <Row label="Hire date" value={hireDate} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Full name</Label>
              <Input
                type="text"
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Username</Label>
              <Input type="text" value={profile?.username ?? ""} disabled className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</Label>
              <Input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="(801) 555-0100"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Role</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Staff</SelectItem>
                  <SelectItem value="manager">Supervisor</SelectItem>
                  <SelectItem value="program_manager">Program Manager</SelectItem>
                  <SelectItem value="admin">Owner</SelectItem>
                  <SelectItem value="committee_member">Committee Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Hire date</Label>
              <Input
                type="date"
                value={draft.hire_date}
                onChange={(e) => setDraft({ ...draft, hire_date: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
