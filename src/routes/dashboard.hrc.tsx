import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scale, CalendarDays, ClipboardList, Users, UserPlus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/lib/rbac";

export const Route = createFileRoute("/dashboard/hrc")({
  head: () => ({ meta: [{ title: "Human Rights Committee (HRC) — HIVE" }] }),
  component: HrcPage,
});

function ScaffoldNotice() {
  return (
    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-amber-800">
      Scaffold — workflow to be built
    </div>
  );
}

export function HrcPage() {
  const { data: org } = useCurrentOrg();
  const role = (org?.role ?? "employee") as Role;
  const canManage = role === "admin" || role === "manager" || role === "super_admin";
  const isCommittee = role === "committee_member";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-lg border border-border bg-background p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
            <Scale className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">
              Human Rights Committee (HRC)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Client-rights body that reviews and approves restrictions on a person's
              rights (restrictive interventions, limitations). This is <strong>not</strong>{" "}
              Human Resources / staff HR.
            </p>
            {isCommittee && (
              <p className="mt-2 text-xs text-amber-800">
                You are signed in as a Committee Member. You can only view this page —
                nothing else in the app is accessible to your role.
              </p>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-amber-700" /> Clients with rights restrictions
              </CardTitle>
              <CardDescription>
                Clients flagged with an active rights restriction will appear here for committee review.
              </CardDescription>
            </div>
            <ScaffoldNotice />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No clients currently flagged for review.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-amber-700" /> Committee meetings
              </CardTitle>
              <CardDescription>
                Meeting records: date, attendees, minutes, decisions.
              </CardDescription>
            </div>
            <ScaffoldNotice />
          </div>
        </CardHeader>
        <CardContent>
          <MeetingsStub canManage={canManage} orgId={org?.organization_id ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-amber-700" /> Reviews &amp; approvals
              </CardTitle>
              <CardDescription>
                The committee reviews and updates a client's rights restriction
                (status: pending review / approved / needs update).
              </CardDescription>
            </div>
            <ScaffoldNotice />
          </div>
        </CardHeader>
        <CardContent>
          <ReviewsStub canManage={canManage} orgId={org?.organization_id ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-amber-700" /> Committee members
              </CardTitle>
              <CardDescription>
                Roster of HRC members for this organization.
              </CardDescription>
            </div>
            <ScaffoldNotice />
          </div>
        </CardHeader>
        <CardContent>
          <RosterStub canManage={canManage} orgId={org?.organization_id ?? null} />
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-4 w-4 text-amber-700" /> Grant / revoke Committee Member role
                </CardTitle>
                <CardDescription>
                  Promote an existing user in this organization to Committee Member,
                  or revoke the role. Committee Members can only see this page.
                </CardDescription>
              </div>
              <ScaffoldNotice />
            </div>
          </CardHeader>
          <CardContent>
            <RoleGranterStub orgId={org?.organization_id ?? null} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- Sub-stubs (minimal, real reads/writes against scaffold tables) ---------- */

function MeetingsStub({ canManage, orgId }: { canManage: boolean; orgId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendees, setAttendees] = useState("");
  const [decisions, setDecisions] = useState("");

  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["hrc-meetings", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hrc_meetings")
        .select("id, meeting_date, attendees, decisions")
        .eq("organization_id", orgId!)
        .order("meeting_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (values: { meeting_date: string; attendees: string; decisions: string }) => {
      if (!values.meeting_date) throw new Error("Meeting date is required.");
      if (!values.attendees.trim()) throw new Error("Attendees are required.");
      const { error } = await supabase.from("hrc_meetings").insert({
        organization_id: orgId!,
        meeting_date: values.meeting_date,
        attendees: values.attendees.trim(),
        decisions: values.decisions.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting recorded");
      qc.invalidateQueries({ queryKey: ["hrc-meetings", orgId] });
      setOpen(false);
      setMeetingDate(new Date().toISOString().slice(0, 10));
      setAttendees("");
      setDecisions("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data?.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No meetings recorded yet.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.meeting_date ?? "(no date)"}</span>
                <span className="text-xs text-muted-foreground truncate ml-3">
                  {m.attendees ?? ""}
                </span>
              </div>
              {m.decisions && (
                <p className="text-xs text-muted-foreground">{m.decisions}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Add meeting
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record HRC meeting</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Meeting date</Label>
                  <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Attendees</Label>
                  <Input
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    placeholder="Names of committee members present"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Decisions / minutes</Label>
                  <Textarea
                    value={decisions}
                    onChange={(e) => setDecisions(e.target.value)}
                    placeholder="Decisions made and action items"
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={add.isPending}
                  onClick={() => add.mutate({ meeting_date: meetingDate, attendees, decisions })}
                >
                  Save meeting
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function ReviewsStub({ canManage, orgId }: { canManage: boolean; orgId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [restrictionSummary, setRestrictionSummary] = useState("");
  const [status, setStatus] = useState("pending_review");

  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["hrc-reviews", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hrc_reviews")
        .select("id, restriction_summary, status, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (values: { restriction_summary: string; status: string }) => {
      if (!values.restriction_summary.trim()) throw new Error("Restriction summary is required.");
      const { error } = await supabase.from("hrc_reviews").insert({
        organization_id: orgId!,
        restriction_summary: values.restriction_summary.trim(),
        status: values.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review recorded");
      qc.invalidateQueries({ queryKey: ["hrc-reviews", orgId] });
      setOpen(false);
      setRestrictionSummary("");
      setStatus("pending_review");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data?.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No reviews recorded yet.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="truncate">{r.restriction_summary ?? "(no summary)"}</span>
              <Badge variant="outline" className="ml-3 text-[10px] uppercase tracking-wider">
                {r.status?.replace(/_/g, " ")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Add review
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record rights restriction review</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Restriction summary</Label>
                  <Textarea
                    value={restrictionSummary}
                    onChange={(e) => setRestrictionSummary(e.target.value)}
                    placeholder="Describe the rights restriction being reviewed"
                    rows={4}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_review">Pending review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="denied">Denied</SelectItem>
                      <SelectItem value="needs_revision">Needs revision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={add.isPending}
                  onClick={() => add.mutate({ restriction_summary: restrictionSummary, status })}
                >
                  Save review
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function RosterStub({ canManage, orgId }: { canManage: boolean; orgId: string | null }) {
  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["hrc-roster", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hrc_committee_members")
        .select("id, user_id, title, active")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data?.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No committee members on the roster yet.
          {canManage && " Use the grant/revoke section below to add some."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="truncate font-mono text-xs">{m.user_id}</span>
              <span className="text-xs text-muted-foreground">{m.title ?? "Member"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleGranterStub({ orgId }: { orgId: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [action, setAction] = useState<"grant" | "revoke">("grant");

  const { data: members } = useQuery({
    enabled: !!orgId,
    queryKey: ["org-members-for-hrc", orgId, search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id, role, profiles(full_name, email)")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .limit(50);
      if (error) throw error;
      const q = search.trim().toLowerCase();
      return (data ?? []).filter((m) => {
        if (!q) return true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (m as any).profiles as { full_name?: string; email?: string } | null;
        return (
          p?.full_name?.toLowerCase().includes(q) ||
          p?.email?.toLowerCase().includes(q)
        );
      });
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !orgId) throw new Error("Pick a user first");
      const newRole = action === "grant" ? "committee_member" : "employee";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("organization_members")
        .update({ role: newRole })
        .eq("organization_id", orgId)
        .eq("user_id", selectedUser);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        action === "grant"
          ? "User promoted to Committee Member"
          : "Committee Member role revoked (now Employee)"
      );
      qc.invalidateQueries({ queryKey: ["org-members-for-hrc", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <Input
        placeholder="Search organization members…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select value={selectedUser} onValueChange={setSelectedUser}>
        <SelectTrigger className="w-full sm:w-auto min-w-[220px]">
          <SelectValue placeholder="Select a user" />
        </SelectTrigger>
        <SelectContent>
          {(members ?? []).map((m) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = (m as any).profiles as { full_name?: string; email?: string } | null;
            return (
              <SelectItem key={m.user_id} value={m.user_id}>
                {p?.full_name ?? p?.email ?? m.user_id} · {m.role}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Select value={action} onValueChange={(v) => setAction(v as "grant" | "revoke")}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="grant">Grant</SelectItem>
          <SelectItem value="revoke">Revoke</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={() => apply.mutate()} disabled={!selectedUser || apply.isPending}>
        Apply
      </Button>
    </div>
  );
}
