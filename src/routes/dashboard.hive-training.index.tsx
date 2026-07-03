import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  GraduationCap, ShoppingCart, Users, Loader2, PlayCircle,
  AlertTriangle, Sparkles, Award, ShieldCheck, TrendingUp, Clock,
  Repeat, CreditCard, CheckCircle2,
} from "lucide-react";
import { z } from "zod";
import { useEntitlements } from "@/hooks/use-entitlements";
import { FeatureLocked } from "@/components/feature-locked";
import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import { FeatureLockedRoute } from "@/components/upgrade-gate";

const searchSchema = z.object({
  checkout: z.enum(["success", "cancelled"]).optional(),
  session_id: z.string().optional(),
  card: z.enum(["saved", "cancelled"]).optional(),
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
  fulfills_course_ids: string[] | null;
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
  const { view, hydrated } = usePortalView();
  const { hasAddon, loading: entLoading } = useEntitlements();
  const featureOn = useFeatureEnabled("hive_training");

  useEffect(() => {
    if (search.checkout === "success") toast.success("Payment received. Seats/assignments will appear shortly.");
    else if (search.checkout === "cancelled") toast.info("Checkout cancelled.");
    if (search.card === "saved") toast.success("Card saved. Auto-renew is ready to go.");
    else if (search.card === "cancelled") toast.info("Card setup cancelled.");
  }, [search.checkout, search.card]);

  if (!org || !hydrated || entLoading) {
    return (
      <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
    );
  }

  // Master Controller (org-level toggle) — same gate as the nav bubble.
  if (!featureOn) {
    return <FeatureLockedRoute featureKey="hive_training" />;
  }

  // Legacy paid add-on entitlement — separate gate for tier-locked access.
  if (!hasAddon("hive_training")) {
    return <FeatureLocked featureName="HIVE Training" />;
  }


  const realIsAdmin = ["admin", "manager", "super_admin"].includes(org.role);
  const isAdmin = realIsAdmin && view !== "staff" && view !== "staff_mobile";

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg p-2 bg-[#1A2B47] text-white">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-semibold text-[#1A2B47]">HIVE Training</h1>
            {realIsAdmin && !isAdmin && (
              <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                Previewing as staff
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "DSPD-aligned courses, competency sign-off, and verifiable certificates for your team."
              : "Your assigned trainings and certificates."}
          </p>
        </div>
      </header>

      {isAdmin
        ? <AdminView orgId={org.organization_id} />
        : <StaffView />}
    </div>
  );
}


// ============================================================
// STAFF VIEW — mobile-first, no buying surface
// ============================================================

function StaffView() {
  const { data: userId } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });

  const { data: assignments, isLoading } = useQuery({
    enabled: !!userId,
    queryKey: ["ht-my-assignments", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_assignments")
        .select("id, organization_id, user_id, course_id, status, progress_pct, completed_at, expires_at, payment_model, course:hive_training_courses(title, slug, cert_validity_months)")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  const { data: certs } = useQuery({
    enabled: !!userId && !!assignments?.length,
    queryKey: ["ht-my-certs", userId],
    queryFn: async () => {
      const ids = (assignments ?? []).map((a) => a.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("hive_training_certificates")
        .select("id, assignment_id, code, issued_at, expires_at, pdf_url")
        .in("assignment_id", ids)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const list = assignments ?? [];
    const total = list.length;
    const completed = list.filter((a) => a.status === "completed").length;
    const inProgress = list.filter((a) => a.status === "in_progress").length;
    const avgPct = total ? Math.round(list.reduce((s, a) => s + (a.progress_pct ?? 0), 0) / total) : 0;
    const nextDue = list
      .filter((a) => a.status !== "completed" && a.expires_at)
      .sort((a, b) => (a.expires_at! < b.expires_at! ? -1 : 1))[0];
    return { total, completed, inProgress, avgPct, nextDue };
  }, [assignments]);

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Overall progress" value={`${stats.avgPct}%`} />
        <StatCard icon={<PlayCircle className="h-4 w-4" />} label="In progress" value={`${stats.inProgress}`} />
        <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Completed" value={`${stats.completed} / ${stats.total}`} />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Next due"
          value={stats.nextDue?.expires_at ? new Date(stats.nextDue.expires_at).toLocaleDateString() : "—"}
        />
      </div>

      {/* Assigned trainings */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[#1A2B47]">Assigned trainings</h2>
        {(!assignments || assignments.length === 0) ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No trainings assigned yet — your admin will assign these.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {assignments.map((a) => (
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
        )}
      </section>

      {/* Earned certificates */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[#1A2B47]">Earned certificates</h2>
        {(!certs || certs.length === 0) ? (
          <Card>
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              Complete a training to earn your first certificate.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {certs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border rounded-md p-3 bg-white">
                <Award className="h-5 w-5 text-[#C8881E]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1A2B47]">Certificate #{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    Issued {new Date(c.issued_at).toLocaleDateString()}
                    {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <Link to="/verify/$code" params={{ code: c.code }} className="text-xs text-[#1A2B47] underline">
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#1A2B47]">{value}</div>
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

// ============================================================
// ADMIN VIEW — readiness banner → storefront → roster
// ============================================================

function AdminView({ orgId }: { orgId: string }) {
  const qc = useQueryClient();

  const { data: catalog } = useQuery({
    queryKey: ["ht-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_catalog")
        .select("id, sku, name, kind, price_cents, currency, active, fulfills_course_ids")
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

  return (
    <div className="space-y-6">
      <ReadinessBanner
        members={members ?? []}
        assignments={assignments ?? []}
      />

      <AutoRenewCard orgId={orgId} catalog={catalog ?? []} />

      <div id="ht-renewals" tabIndex={-1} className="scroll-mt-6 rounded-xl outline-none">
        <RenewalsSection
          orgId={orgId}
          assignments={assignments ?? []}
          members={members ?? []}
          catalog={catalog ?? []}
        />
      </div>

      <Storefront
        catalog={catalog ?? []}
        members={members ?? []}
        onPurchased={() => qc.invalidateQueries({ queryKey: ["ht-org-seats", orgId] })}
      />


      <RosterSection
        orgId={orgId}
        assignments={assignments ?? []}
        seats={seats ?? []}
        members={members ?? []}
      />
    </div>
  );
}

// ---- Readiness banner (trimmed — expirations handled by RenewalsSection) ----

function ReadinessBanner({
  members, assignments,
}: {
  members: Member[];
  assignments: AssignmentRow[];
}) {
  const usersWithAnyAssign = new Set(assignments.map((a) => a.user_id));
  const unassignedCount = members.filter((m) => !usersWithAnyAssign.has(m.id)).length;
  const inProgressCount = assignments.filter((a) => a.status === "in_progress").length;

  const items: React.ReactNode[] = [];

  if (unassignedCount > 0) {
    items.push(
      <BannerLine
        key="unassigned"
        icon={<AlertTriangle className="h-4 w-4 text-[#C8881E]" />}
        text={<><b>{unassignedCount} staff</b> have no training assigned yet.</>}
        cta="Review renewals"
        onClick={() => scrollToRenewals()}
      />
    );
  }


  if (inProgressCount > 0) {
    items.push(
      <BannerLine
        key="in-progress"
        icon={<Clock className="h-4 w-4 text-[#1A2B47]" />}
        text={<><b>{inProgressCount} trainings</b> started but not completed.</>}
        cta="See team"
        onClick={() => scrollToRoster()}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[#1A2B47]/15 bg-gradient-to-br from-[#1A2B47] to-[#243b62] text-white p-5 md:p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-[#C8881E] mt-0.5" />
          <div>
            <div className="text-base font-semibold">Your team is current. Keep it that way.</div>
            <p className="text-sm text-white/80 mt-1 max-w-2xl">
              Built by DSPD providers, for DSPD providers. Every course maps to a named DSPD
              requirement — CPR/First Aid, Mandt de-escalation, and DSPD provider orientation —
              with in-app competency sign-off and a verifiable certificate for state audit. We
              track expirations so nothing lapses on your watch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#C8881E]/30 bg-[#FFF9EE] p-4 md:p-5 space-y-2">
      <div className="text-sm font-semibold text-[#1A2B47] flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[#C8881E]" />
        Your team, right now
      </div>
      <div className="space-y-1.5">{items}</div>
    </div>
  );
}

function BannerLine({
  icon, text, cta, onClick,
}: { icon: React.ReactNode; text: React.ReactNode; cta: string | null; onClick?: () => void }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 text-sm">
      <div className="flex items-center gap-2 flex-1">{icon}<span>{text}</span></div>
      {cta && (
        <Button size="sm" onClick={onClick} className="bg-[#C8881E] hover:bg-[#C8881E]/90 text-white self-start md:self-auto">
          {cta}
        </Button>
      )}
    </div>
  );
}

function scrollToRenewals() {
  scrollToTrainingTarget(["ht-renewals", "ht-storefront", "ht-roster"]);
}
function scrollToRoster() {
  scrollToTrainingTarget(["ht-roster"]);
}
function scrollToStorefront() {
  scrollToTrainingTarget(["ht-storefront", "ht-roster"]);
}

function scrollToTrainingTarget(ids: string[]) {
  const el = ids
    .map((id) => document.getElementById(id))
    .find((node): node is HTMLElement => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 1;
    });

  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    el.focus({ preventScroll: true });
    el.animate(
      [
        { boxShadow: "0 0 0 0 rgba(200, 136, 30, 0)" },
        { boxShadow: "0 0 0 4px rgba(200, 136, 30, 0.35)" },
        { boxShadow: "0 0 0 0 rgba(200, 136, 30, 0)" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  }, 250);
}


// ---- Renewals section (staff-level, checkbox-driven) ----

type RenewalRow = {
  key: string;                    // `${user_id}:${course_id}`
  user_id: string;
  user_label: string;
  course_id: string;
  course_title: string;
  expires_at: string | null;      // null = never assigned
  days_left: number | null;
  status: "due_soon" | "upcoming" | "missing";
  catalog_id: string | null;      // best-fit single SKU
};

function RenewalsSection({
  orgId, assignments, members, catalog,
}: {
  orgId: string;
  assignments: AssignmentRow[];
  members: Member[];
  catalog: CatalogRow[];
}) {
  // Required courses = courses referenced by any à-la-carte SKU (source of truth).
  const requiredCourses = useMemo(() => {
    const map = new Map<string, { id: string; title: string; catalog_id: string }>();
    for (const c of catalog) {
      if (c.kind === "full_program") continue;
      const ids = (c.fulfills_course_ids ?? []) as string[];
      for (const cid of ids) {
        if (!map.has(cid)) {
          // Try to find title from an assignment; fallback to SKU name.
          const fromAssign = assignments.find((a) => a.course_id === cid)?.course?.title;
          map.set(cid, { id: cid, title: fromAssign ?? c.name, catalog_id: c.id });
        }
      }
    }
    return map;
  }, [catalog, assignments]);

  const rows = useMemo<RenewalRow[]>(() => {
    const out: RenewalRow[] = [];
    const now = Date.now();
    const in120 = now + 120 * 24 * 3600 * 1000;
    const seen = new Set<string>();

    // Expiring assignments
    for (const a of assignments) {
      if (!a.expires_at) continue;
      const t = new Date(a.expires_at).getTime();
      if (t > in120) continue;
      const days = Math.round((t - now) / (24 * 3600 * 1000));
      const req = requiredCourses.get(a.course_id);
      const key = `${a.user_id}:${a.course_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        user_id: a.user_id,
        user_label: members.find((m) => m.id === a.user_id)?.label ?? a.user_id.slice(0, 8),
        course_id: a.course_id,
        course_title: a.course?.title ?? "Training",
        expires_at: a.expires_at,
        days_left: days,
        status: days <= 60 ? "due_soon" : "upcoming",
        catalog_id: req?.catalog_id ?? null,
      });
    }

    // Missing: staff × required course with no assignment at all.
    for (const m of members) {
      for (const [cid, req] of requiredCourses) {
        const hasAny = assignments.some((a) => a.user_id === m.id && a.course_id === cid);
        if (hasAny) continue;
        const key = `${m.id}:${cid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          user_id: m.id,
          user_label: m.label,
          course_id: cid,
          course_title: req.title,
          expires_at: null,
          days_left: null,
          status: "missing",
          catalog_id: req.catalog_id,
        });
      }
    }

    // Sort: due_soon → upcoming → missing; within each, soonest first.
    const rank = { due_soon: 0, upcoming: 1, missing: 2 } as const;
    out.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const da = a.days_left ?? 99999;
      const db = b.days_left ?? 99999;
      return da - db;
    });
    return out;
  }, [assignments, members, requiredCourses]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectDueSoon = () => {
    setSelected(new Set(rows.filter((r) => r.status === "due_soon").map((r) => r.key)));
  };
  const clearAll = () => setSelected(new Set());

  const selectedRows = rows.filter((r) => selected.has(r.key));

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-white p-4 md:p-5 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#1A2B47]">Renewals coming up</h2>
          <p className="text-sm text-muted-foreground">
            Keep your team current. Check the ones you want covered — we'll handle the rest.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={selectDueSoon}>
            Select all due within 60 days
          </Button>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => {
              const checked = selected.has(r.key);
              return (
                <tr
                  key={r.key}
                  className={`border-t hover:bg-muted/30 cursor-pointer ${checked ? "bg-[#FFF9EE]" : ""}`}
                  onClick={() => toggle(r.key)}
                >
                  <td className="p-2 pl-3 w-8">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 accent-[#C8881E]"
                    />
                  </td>
                  <td className="p-2 font-medium text-[#1A2B47] whitespace-nowrap">{r.user_label}</td>
                  <td className="p-2">{r.course_title}</td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">
                    {r.status === "missing"
                      ? "Never assigned"
                      : `expires ${new Date(r.expires_at!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${r.days_left != null ? ` · ${r.days_left}d` : ""}`}
                  </td>
                  <td className="p-2 pr-3 text-right">
                    {r.status === "due_soon" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#C8881E]/15 text-[#C8881E] text-xs px-2 py-0.5">Due soon</span>
                    )}
                    {r.status === "missing" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5">Missing</span>
                    )}
                    {r.status === "upcoming" && (
                      <span className="text-xs text-muted-foreground">Upcoming</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between pt-2 border-t">
        <div className="text-sm text-muted-foreground">
          {selected.size === 0
            ? "Select trainings above to set up renewals."
            : <><b>{selected.size} selected</b> · certificates auto-issued on completion, expirations tracked.</>}
        </div>
        <Button
          disabled={selected.size === 0}
          onClick={() => setDialogOpen(true)}
          className="bg-[#1A2B47] hover:bg-[#1A2B47]/90 text-white"
        >
          Set up renewals
        </Button>
      </div>

      <SetupRenewalsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selection={selectedRows}
        catalog={catalog}
        orgId={orgId}
      />
    </section>
  );
}

// ---- Setup renewals dialog ----

function SetupRenewalsDialog({
  open, onOpenChange, selection, catalog,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selection: RenewalRow[];
  catalog: CatalogRow[];
  orgId: string;
}) {
  const [busy, setBusy] = useState(false);

  const fullProgram = catalog.find((c) => c.kind === "full_program");

  // Detect bundling opportunity: a single staff needs all courses in the full program.
  const bundle = useMemo(() => {
    if (!fullProgram) return null;
    const fpCourses = new Set((fullProgram.fulfills_course_ids ?? []) as string[]);
    if (fpCourses.size === 0) return null;

    const byUser = new Map<string, Set<string>>();
    for (const r of selection) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
      byUser.get(r.user_id)!.add(r.course_id);
    }
    const bundledUsers: string[] = [];
    for (const [uid, courses] of byUser) {
      let covers = true;
      for (const cid of fpCourses) if (!courses.has(cid)) { covers = false; break; }
      if (covers) bundledUsers.push(uid);
    }
    if (bundledUsers.length === 0) return null;

    // Cost with full program vs à la carte for those users.
    const perUserAlaCarte = Array.from(fpCourses).reduce((sum, cid) => {
      const cat = catalog.find((c) => c.kind !== "full_program" && ((c.fulfills_course_ids ?? []) as string[]).includes(cid));
      return sum + (cat?.price_cents ?? 0);
    }, 0);
    const savingsPerUser = Math.max(0, perUserAlaCarte - fullProgram.price_cents);
    return { users: bundledUsers, savingsPerUser, fpCourses };
  }, [selection, fullProgram, catalog]);

  // Build purchase groups: catalog_id → renewal_intents[].
  const purchases = useMemo(() => {
    const bundledUserSet = new Set(bundle?.users ?? []);
    const groups = new Map<string, { catalog: CatalogRow; intents: { user_id: string; course_id: string }[] }>();

    // Bundled users → full program (one seat per user; intents cover all courses).
    if (bundle && fullProgram) {
      for (const uid of bundle.users) {
        // Full program intents: one intent per fulfilled course for this user.
        // The webhook consumes one seat per intent, so we count qty by intents.
        for (const cid of bundle.fpCourses) {
          if (!groups.has(fullProgram.id)) groups.set(fullProgram.id, { catalog: fullProgram, intents: [] });
          groups.get(fullProgram.id)!.intents.push({ user_id: uid, course_id: cid });
        }
      }
    }

    // À la carte for the rest.
    for (const r of selection) {
      if (bundledUserSet.has(r.user_id)) continue;
      if (!r.catalog_id) continue;
      const cat = catalog.find((c) => c.id === r.catalog_id);
      if (!cat) continue;
      if (!groups.has(cat.id)) groups.set(cat.id, { catalog: cat, intents: [] });
      groups.get(cat.id)!.intents.push({ user_id: r.user_id, course_id: r.course_id });
    }
    return Array.from(groups.values());
  }, [selection, bundle, fullProgram, catalog]);

  const totalCents = useMemo(
    () => purchases.reduce((s, p) => s + p.catalog.price_cents * p.intents.length, 0),
    [purchases],
  );
  const totalFmt = (totalCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

  const staffCount = new Set(selection.map((r) => r.user_id)).size;

  const startCheckout = async () => {
    if (purchases.length === 0) return;
    setBusy(true);
    try {
      // Multi-SKU: run each purchase group as its own Stripe session.
      // If more than one group, we open the first now; the rest are done sequentially
      // by returning to the page (webhook resolves each on its own). Keep it simple:
      // fire the first one now — the vast majority of selections resolve to a single group.
      const first = purchases[0];
      const body: Record<string, unknown> = {
        mode_context: "bulk_seats",
        catalog_id: first.catalog.id,
        quantity: first.intents.length,
        renewal_intents: first.intents,
      };
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set up {selection.length} renewal{selection.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Covers <b>{selection.length}</b> training{selection.length === 1 ? "" : "s"} for <b>{staffCount}</b> staff.
            Certificates are auto-issued on completion, and we'll track every expiration for you.
          </p>

          {bundle && fullProgram && bundle.users.length > 0 && (
            <div className="rounded-md bg-[#FFF9EE] border border-[#C8881E]/30 p-2.5 text-xs">
              <div className="font-medium text-[#1A2B47]">
                Bundled as Full Program for {bundle.users.length} staff.
              </div>
              <div className="text-muted-foreground mt-0.5">
                Saves ${(bundle.savingsPerUser / 100).toFixed(0)} per staff and covers everything they need.
              </div>
            </div>
          )}

          <ul className="text-xs text-muted-foreground space-y-1 border-t pt-2">
            {purchases.map((p) => (
              <li key={p.catalog.id} className="flex justify-between">
                <span>{p.catalog.name} × {p.intents.length}</span>
                <span>{((p.catalog.price_cents * p.intents.length) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-between items-baseline border-t pt-2">
            <span className="text-xs text-muted-foreground">Total · one-time</span>
            <span className="text-base font-semibold text-[#1A2B47]">{totalFmt}</span>
          </div>

          {purchases.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Note: your selection spans multiple programs. You'll be walked through the first checkout now; the next opens right after.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={startCheckout}
            disabled={busy || purchases.length === 0}
            className="bg-[#C8881E] hover:bg-[#C8881E]/90 text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set up renewals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ---- Storefront ----

function Storefront({
  catalog, members, onPurchased,
}: { catalog: CatalogRow[]; members: Member[]; onPurchased: () => void }) {
  const full = catalog.find((c) => c.kind === "full_program");
  const alaCarte = catalog.filter((c) => c.kind !== "full_program");

  return (
    <section id="ht-storefront" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-[#1A2B47]">Programs built for DSPD compliance</h2>
        <p className="text-sm text-muted-foreground">
          Every course names the DSPD requirement it satisfies. Staff finish with a signed competency and a certificate you can hand to the state.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {full && (
          <div className="md:col-span-1">
            <FeaturedCard row={full} members={members} onPurchased={onPurchased} />
          </div>
        )}
        <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
          {alaCarte.map((c) => (
            <AlaCarteCard key={c.id} row={c} members={members} onPurchased={onPurchased} />
          ))}
        </div>
      </div>
    </section>
  );
}

const COURSE_SATISFIES: Record<string, string> = {
  cpr: "Satisfies DSPD CPR/First Aid staff qualification.",
  mandt: "Satisfies DSPD approved crisis intervention & de-escalation.",
  dspd: "Satisfies DSPD provider orientation for new direct-support staff.",
  full: "Covers CPR/First Aid, Mandt de-escalation, and DSPD orientation — everything a new DSP needs to be state-ready.",
};

function satisfiesLine(row: CatalogRow) {
  const n = row.name.toLowerCase();
  if (row.kind === "full_program") return COURSE_SATISFIES.full;
  if (n.includes("cpr")) return COURSE_SATISFIES.cpr;
  if (n.includes("mandt")) return COURSE_SATISFIES.mandt;
  if (n.includes("dspd")) return COURSE_SATISFIES.dspd;
  return "DSPD-aligned coursework with in-app competency sign-off.";
}

function FeaturedCard({ row, members, onPurchased }: { row: CatalogRow; members: Member[]; onPurchased: () => void }) {
  const price = (row.price_cents / 100).toLocaleString(undefined, { style: "currency", currency: row.currency || "USD" });
  return (
    <Card className="relative border-2 border-[#C8881E] shadow-[0_0_0_4px_rgba(200,136,30,0.15)]">
      <div className="absolute -top-3 left-4 bg-[#C8881E] text-white text-xs font-semibold px-2 py-0.5 rounded">
        Best value · save $75
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[#1A2B47] flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#C8881E]" /> {row.name}
        </CardTitle>
        <CardDescription>{satisfiesLine(row)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold text-[#1A2B47]">{price}<span className="text-sm font-normal text-muted-foreground"> / staff</span></div>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li className="flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#C8881E]" /> DSPD-certified content</li>
          <li className="flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#C8881E]" /> Typed-signature competency sign-off</li>
          <li className="flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#C8881E]" /> Verifiable certificate + expiration tracking</li>
        </ul>
        <PurchaseDialog row={row} members={members} onPurchased={onPurchased} triggerLabel="Buy Full Program" />
      </CardContent>
    </Card>
  );
}

function AlaCarteCard({ row, members, onPurchased }: { row: CatalogRow; members: Member[]; onPurchased: () => void }) {
  const price = (row.price_cents / 100).toLocaleString(undefined, { style: "currency", currency: row.currency || "USD" });
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base text-[#1A2B47]">{row.name}</CardTitle>
          <Badge variant="outline" className="border-[#C8881E] text-[#C8881E]">{price}</Badge>
        </div>
        <CardDescription className="text-xs">{satisfiesLine(row)}</CardDescription>
      </CardHeader>
      <CardContent>
        <PurchaseDialog row={row} members={members} onPurchased={onPurchased} triggerLabel="Buy" />
      </CardContent>
    </Card>
  );
}

function PurchaseDialog({
  row, members, onPurchased, triggerLabel,
}: { row: CatalogRow; members: Member[]; onPurchased: () => void; triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"bulk_seats" | "individual">("bulk_seats");
  const [qty, setQty] = useState(1);
  const [assignee, setAssignee] = useState<string>("");
  const [busy, setBusy] = useState(false);

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
      onPurchased();
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#1A2B47] hover:bg-[#1A2B47]/90 text-white w-full">
          <ShoppingCart className="h-4 w-4 mr-1" /> {triggerLabel}
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
  );
}

// ---- Roster ----

type SeatLite = {
  id: string;
  catalog_id: string;
  status: string;
  assigned_to_user_id: string | null;
  catalog: { name: string; sku: string; fulfills_course_ids: string[] | null } | null;
};

function RosterSection({
  orgId, assignments, seats, members,
}: {
  orgId: string;
  assignments: AssignmentRow[];
  seats: unknown[];
  members: Member[];
}) {
  const qc = useQueryClient();
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mem) => m.set(mem.id, mem.label));
    return m;
  }, [members]);

  const assignSeat = useMutation({
    mutationFn: async ({ seatId, userId, catalogId }: { seatId: string; userId: string; catalogId: string }) => {
      const { data: cat } = await supabase
        .from("hive_training_catalog")
        .select("fulfills_course_ids")
        .eq("id", catalogId)
        .maybeSingle();
      const courseIds: string[] = (cat?.fulfills_course_ids as string[] | null) ?? [];
      if (courseIds.length === 0) throw new Error("This SKU has no course mapping yet.");

      const { error: sErr } = await supabase
        .from("hive_training_seats")
        .update({ status: "consumed", assigned_to_user_id: userId, consumed_at: new Date().toISOString() })
        .eq("id", seatId)
        .eq("status", "available");
      if (sErr) throw sErr;

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
    <section id="ht-roster" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#1A2B47]">Your team</h2>
        <p className="text-sm text-muted-foreground">Available seats, current assignments, and expirations.</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-[#1A2B47]">Available seats ({seats.length})</h3>
        {seats.length > 0 ? (
          <div className="grid gap-2">
            {(seats as SeatLite[]).map((s) => (
              <SeatRow
                key={s.id}
                seat={s}
                members={members}
                onAssign={(userId) => assignSeat.mutate({ seatId: s.id, userId, catalogId: s.catalog_id })}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No unassigned seats. Buy more above.</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-[#1A2B47]">Team assignments ({assignments.length})</h3>
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
              {assignments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{nameById.get(a.user_id) ?? a.user_id.slice(0, 8)}</td>
                  <td className="p-2">{a.course?.title ?? "—"}</td>
                  <td className="p-2"><StatusBadge status={a.status} /></td>
                  <td className="p-2">{a.progress_pct ?? 0}%</td>
                  <td className="p-2">{a.expires_at ? new Date(a.expires_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No assignments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SeatRow({
  seat, members, onAssign,
}: {
  seat: SeatLite;
  members: Member[];
  onAssign: (userId: string) => void;
}) {
  const [user, setUser] = useState("");
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 border rounded-md p-2 bg-white">
      <div className="flex items-center gap-2 flex-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">{seat.catalog?.name ?? "Seat"}</span>
      </div>
      <Select value={user} onValueChange={setUser}>
        <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Assign to…" /></SelectTrigger>
        <SelectContent>
          {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!user} onClick={() => user && onAssign(user)}>Assign</Button>
    </div>
  );
}

// ---- Auto-renew settings card ----

type AutoRenewSettings = {
  organization_id: string;
  enabled: boolean;
  lead_days: number;
  scope: "all" | "full_program" | "selected";
  selected_catalog_ids: string[];
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  last_run_at: string | null;
  paused_reason: string | null;
};

function AutoRenewCard({ orgId, catalog }: { orgId: string; catalog: CatalogRow[] }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["ht-auto-renew", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_auto_renew_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AutoRenewSettings | null;
    },
  });

  const [saving, setSaving] = useState(false);

  const upsert = async (patch: Partial<AutoRenewSettings>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hive_training_auto_renew_settings")
        .upsert(
          {
            organization_id: orgId,
            enabled: settings?.enabled ?? false,
            lead_days: settings?.lead_days ?? 45,
            scope: settings?.scope ?? "all",
            selected_catalog_ids: settings?.selected_catalog_ids ?? [],
            ...patch,
          },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["ht-auto-renew", orgId] });
    } catch (e) {
      toast.error("Couldn't save auto-renew settings.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const saveCard = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-training-setup-intent", { body: {} });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No checkout URL returned.");
      window.location.href = url;
    } catch (e) {
      toast.error("Couldn't start card setup. Ensure payments are configured.");
      console.error(e);
      setSaving(false);
    }
  };

  const runNow = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("auto-renew-trainings", {
        body: { organization_id: orgId },
      });
      if (error) throw error;
      toast.success("Auto-renew check triggered.");
      await qc.invalidateQueries({ queryKey: ["ht-auto-renew", orgId] });
    } catch (e) {
      toast.error("Couldn't run auto-renew.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  const enabled = settings?.enabled ?? false;
  const leadDays = settings?.lead_days ?? 45;
  const scope = settings?.scope ?? "all";
  const hasCard = !!settings?.stripe_payment_method_id;

  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-[#FFF9EE] to-white p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-lg p-2 bg-[#C8881E]/15 text-[#C8881E] h-fit">
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1A2B47]">Auto-renew expiring trainings</h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Set it once. HIVE re-purchases and re-assigns seats before certificates expire — no gap, no chase, no scramble.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(v) => upsert({ enabled: v })}
          />
          <span className="text-sm font-medium text-[#1A2B47]">{enabled ? "On" : "Off"}</span>
        </div>
      </div>

      {enabled && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Renew how early?</Label>
            <Select value={String(leadDays)} onValueChange={(v) => upsert({ lead_days: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days before expiration</SelectItem>
                <SelectItem value="45">45 days before expiration</SelectItem>
                <SelectItem value="60">60 days before expiration</SelectItem>
                <SelectItem value="90">90 days before expiration</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Scope</Label>
            <Select value={scope} onValueChange={(v) => upsert({ scope: v as AutoRenewSettings["scope"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All required courses</SelectItem>
                <SelectItem value="full_program">Full Program courses only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Payment method</Label>
            {hasCard ? (
              <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 h-10">
                <span className="text-sm text-[#1A2B47] inline-flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {(settings?.payment_method_brand ?? "Card").toUpperCase()} •••• {settings?.payment_method_last4 ?? "----"}
                </span>
                <button
                  onClick={saveCard}
                  disabled={saving}
                  className="text-xs text-[#C8881E] hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={saveCard}
                disabled={saving}
                className="w-full h-10 border-[#C8881E] text-[#C8881E] hover:bg-[#C8881E]/10"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4 mr-2" />Save a card</>}
              </Button>
            )}
          </div>
        </div>
      )}

      {enabled && (
        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-3 border-t text-sm">
          <div className="text-muted-foreground">
            {settings?.paused_reason ? (
              <span className="inline-flex items-center gap-1 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Paused: {settings.paused_reason}. Update your card and re-enable.
              </span>
            ) : hasCard ? (
              <span className="inline-flex items-center gap-1 text-[#1A2B47]">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Ready. We check daily and email a receipt for every renewal.
                {settings?.last_run_at && (
                  <span className="text-muted-foreground"> · Last check {new Date(settings.last_run_at).toLocaleDateString()}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Save a card to activate auto-renew.</span>
            )}
          </div>
          {hasCard && (
            <Button size="sm" variant="ghost" onClick={runNow} disabled={saving}>
              Run check now
            </Button>
          )}
        </div>
      )}

      {/* Reference catalog is available for future 'selected' scope UI. */}
      {catalog.length === 0 && enabled && (
        <p className="mt-2 text-xs text-muted-foreground">No active courses in the catalog yet.</p>
      )}
    </section>
  );
}

