import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { GraduationCap, ShoppingCart, Users, Loader2, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  checkout: z.enum(["success", "cancelled"]).optional(),
  session_id: z.string().optional(),
}).partial();

export const Route = createFileRoute("/dashboard/hive-training/")({
  component: HiveTrainingHub,
  validateSearch: searchSchema,
});

type CatalogRow = {
  id: string;
  sku: string;
  name: string;
  kind: string;
  price_cents: number;
  currency: string;
  active: boolean;
};

type AssignmentRow = {
  id: string;
  organization_id: string | null;
  user_id: string;
  course_id: string;
  status: string;
  progress_pct: number | null;
  completed_at: string | null;
  expires_at: string | null;
  payment_model: string | null;
  course: { title: string; slug: string; cert_validity_months: number | null } | null;
};

type Member = { id: string; label: string };

function HiveTrainingHub() {
  const { data: org } = useCurrentOrg();
  const search = useSearch({ from: Route.id });
  const qc = useQueryClient();
  const [tab, setTab] = useState<"my" | "buy" | "assignments">("my");

  const isAdmin = !!org && ["admin", "manager", "super_admin"].includes(org.role);

  if (search.checkout === "success") {
    setTimeout(() => toast.success("Payment received. Seats/assignments will appear shortly."), 0);
  } else if (search.checkout === "cancelled") {
    setTimeout(() => toast.info("Checkout cancelled."), 0);
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-4">
      <header className="flex items-center gap-3">
        <div className="rounded-lg p-2 bg-[#1A2B47] text-white">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-[#1A2B47]">HIVE Training</h1>
          <p className="text-sm text-muted-foreground">DSPD-aligned courses, competency sign-off, and shareable certificates.</p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="my">My trainings</TabsTrigger>
          {isAdmin && <TabsTrigger value="buy">Buy</TabsTrigger>}
          {isAdmin && <TabsTrigger value="assignments">Team assignments</TabsTrigger>}
        </TabsList>

        <TabsContent value="my" className="pt-4">
          <MyAssignments />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="buy" className="pt-4">
            <BuyTab orgId={org.organization_id} onPurchased={() => qc.invalidateQueries({ queryKey: ["ht-orders"] })} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="assignments" className="pt-4">
            <AdminAssignmentsTab orgId={org.organization_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// -------- MY TRAININGS (learner, mobile-first) --------

function MyAssignments() {
  const { data, isLoading } = useQuery({
    queryKey: ["ht-my-assignments"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return [];
      const { data, error } = await supabase
        .from("hive_training_assignments")
        .select("id, organization_id, user_id, course_id, status, progress_pct, completed_at, expires_at, payment_model, course:hive_training_courses(title, slug, cert_validity_months)")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No trainings assigned yet. Your admin can assign courses, or you can purchase one from the Buy tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((a) => (
        <Card key={a.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{a.course?.title ?? "Course"}</CardTitle>
              <StatusBadge status={a.status} />
            </div>
            <CardDescription>
              {a.progress_pct != null ? `${a.progress_pct}% complete` : "Not started"}
              {a.expires_at ? ` · expires ${new Date(a.expires_at).toLocaleDateString()}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              to="/dashboard/hive-training/course/$assignmentId"
              params={{ assignmentId: a.id }}
              className="inline-flex"
            >
              <Button size="sm" className="bg-[#1A2B47] hover:bg-[#1A2B47]/90 text-white">
                <PlayCircle className="h-4 w-4 mr-1" />
                {a.status === "completed" ? "Review" : a.status === "not_started" ? "Start" : "Continue"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: "Not started", cls: "bg-muted text-muted-foreground" },
    in_progress: { label: "In progress", cls: "bg-[#C8881E]/15 text-[#C8881E]" },
    completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
    expired: { label: "Expired", cls: "bg-red-100 text-red-700" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

// -------- BUY TAB (admin) --------

function BuyTab({ orgId, onPurchased }: { orgId: string; onPurchased: () => void }) {
  const { data: catalog } = useQuery({
    queryKey: ["ht-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_catalog")
        .select("id, sku, name, kind, price_cents, currency, active")
        .eq("active", true)
        .order("sort", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["ht-members", orgId],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as Member[];
      const { data: profs } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email, username")
        .in("id", ids);
      return (profs ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({ id: p.id, label: p.full_name || p.email || p.username || "—" }));
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Buy in bulk (seats you assign later) or per-staff. Payment goes through Stripe hosted checkout.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {(catalog ?? []).map((c) => (
          <CatalogCard key={c.id} row={c} members={members ?? []} onPurchased={onPurchased} />
        ))}
      </div>
    </div>
  );
}

function CatalogCard({ row, members, onPurchased }: { row: CatalogRow; members: Member[]; onPurchased: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"bulk_seats" | "individual">("bulk_seats");
  const [qty, setQty] = useState(1);
  const [assignee, setAssignee] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const price = (row.price_cents / 100).toLocaleString(undefined, { style: "currency", currency: row.currency || "USD" });
  const total = ((row.price_cents * (mode === "bulk_seats" ? qty : 1)) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: row.currency || "USD",
  });

  const startCheckout = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { mode_context: mode, catalog_id: row.id };
      if (mode === "bulk_seats") body.quantity = qty;
      if (mode === "individual") body.assignee_user_id = assignee || undefined;

      const { data, error } = await supabase.functions.invoke("create-training-checkout", { body });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("Checkout URL missing");
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Checkout failed";
      if (msg.includes("payments_not_configured")) {
        toast.error("Payments are not configured yet. Add STRIPE_SECRET_KEY to enable checkout.");
      } else {
        toast.error(msg);
      }
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{row.name}</CardTitle>
          <Badge variant="outline" className="border-[#C8881E] text-[#C8881E]">{price}</Badge>
        </div>
        <CardDescription>{row.kind === "full_program" ? "Includes CPR, Mandt, and DSPD" : "À la carte course"}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1A2B47] hover:bg-[#1A2B47]/90 text-white w-full">
              <ShoppingCart className="h-4 w-4 mr-1" /> Buy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Purchase — {row.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Purchase type</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bulk_seats">Bulk seats (assign later)</SelectItem>
                    <SelectItem value="individual">Assign to one staff now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "bulk_seats" ? (
                <div>
                  <Label>Number of seats</Label>
                  <Input type="number" min={1} max={500} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              ) : (
                <div>
                  <Label>Assign to</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-sm">Total: <span className="font-semibold text-[#1A2B47]">{total}</span></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={startCheckout}
                disabled={busy || (mode === "individual" && !assignee)}
                className="bg-[#C8881E] hover:bg-[#C8881E]/90 text-white"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------- ADMIN ASSIGNMENTS TAB --------

function AdminAssignmentsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();

  const { data: assignments } = useQuery({
    queryKey: ["ht-org-assignments", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_assignments")
        .select("id, organization_id, user_id, course_id, status, progress_pct, completed_at, expires_at, payment_model, course:hive_training_courses(title, slug, cert_validity_months)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  const { data: seats } = useQuery({
    queryKey: ["ht-org-seats", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_seats")
        .select("id, catalog_id, status, assigned_to_user_id, catalog:hive_training_catalog(name, sku, fulfills_course_ids)")
        .eq("organization_id", orgId)
        .eq("status", "available");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["ht-members", orgId],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as Member[];
      const { data: profs } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email, username")
        .in("id", ids);
      return (profs ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({ id: p.id, label: p.full_name || p.email || p.username || "—" }));
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (members ?? []).forEach((mem) => m.set(mem.id, mem.label));
    return m;
  }, [members]);

  const assignSeat = useMutation({
    mutationFn: async ({ seatId, userId, catalogId }: { seatId: string; userId: string; catalogId: string }) => {
      // Get the catalog row to know which courses it fulfills.
      const { data: cat } = await supabase
        .from("hive_training_catalog")
        .select("fulfills_course_ids")
        .eq("id", catalogId)
        .maybeSingle();
      const courseIds: string[] = (cat?.fulfills_course_ids as string[] | null) ?? [];
      if (courseIds.length === 0) throw new Error("This SKU has no course mapping yet.");

      // Consume the seat.
      const { error: sErr } = await supabase
        .from("hive_training_seats")
        .update({ status: "consumed", assigned_to_user_id: userId, consumed_at: new Date().toISOString() })
        .eq("id", seatId)
        .eq("status", "available");
      if (sErr) throw sErr;

      // Create one assignment per fulfilled course.
      const rows = courseIds.map((courseId) => ({
        organization_id: orgId,
        user_id: userId,
        course_id: courseId,
        payment_model: "bulk_seats" as const,
        seat_id: seatId,
        status: "not_started" as const,
      }));
      const { error: aErr } = await supabase.from("hive_training_assignments").insert(rows);
      if (aErr) throw aErr;
    },
    onSuccess: () => {
      toast.success("Seat assigned");
      qc.invalidateQueries({ queryKey: ["ht-org-assignments", orgId] });
      qc.invalidateQueries({ queryKey: ["ht-org-seats", orgId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Assign failed"),
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold mb-2 text-[#1A2B47]">Available seats ({seats?.length ?? 0})</h2>
        {seats && seats.length > 0 ? (
          <div className="grid gap-2">
            {seats.map((s) => (
              <SeatRow
                key={s.id}
                seat={s as unknown as { id: string; catalog_id: string; catalog: { name: string } | null }}
                members={members ?? []}
                onAssign={(userId) => assignSeat.mutate({ seatId: s.id, userId, catalogId: s.catalog_id })}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No unassigned seats. Buy more from the Buy tab.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2 text-[#1A2B47]">Team assignments ({assignments?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">Staff</th>
                <th className="p-2">Course</th>
                <th className="p-2">Status</th>
                <th className="p-2">Progress</th>
                <th className="p-2">Cert expires</th>
              </tr>
            </thead>
            <tbody>
              {(assignments ?? []).map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{nameById.get(a.user_id) ?? a.user_id.slice(0, 8)}</td>
                  <td className="p-2">{a.course?.title ?? "—"}</td>
                  <td className="p-2"><StatusBadge status={a.status} /></td>
                  <td className="p-2">{a.progress_pct ?? 0}%</td>
                  <td className="p-2">{a.expires_at ? new Date(a.expires_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {(!assignments || assignments.length === 0) && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No assignments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SeatRow({
  seat, members, onAssign,
}: {
  seat: { id: string; catalog_id: string; catalog: { name: string } | null };
  members: Member[];
  onAssign: (userId: string) => void;
}) {
  const [user, setUser] = useState("");
  return (
    <div className="flex items-center gap-2 border rounded-md p-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm flex-1">{seat.catalog?.name ?? "Seat"}</span>
      <Select value={user} onValueChange={setUser}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Assign to…" /></SelectTrigger>
        <SelectContent>
          {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!user} onClick={() => user && onAssign(user)}>Assign</Button>
    </div>
  );
}
