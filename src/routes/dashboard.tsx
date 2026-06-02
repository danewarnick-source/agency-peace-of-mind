import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { usePortalView } from "@/hooks/use-portal-view";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import {
  LayoutDashboard, GraduationCap, Settings, Hexagon,

  LogOut, Users, Building2, Contact2, ClipboardCheck, Wallet, Pill, Menu, Clock, CalendarDays, HelpCircle, Lock, CreditCard, Activity, LifeBuoy, Receipt, FolderArchive, Database, ShieldCheck, ArrowRightLeft, Plus, UserCog, ExternalLink,
} from "lucide-react";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffMobileShell } from "@/components/staff-mobile/staff-mobile-shell";
import { StaffMobilePreviewFrame } from "@/components/staff-mobile/staff-mobile-preview-frame";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { ListChecks } from "lucide-react";


export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HIVE" }] }),
  component: DashboardLayout,
});

import type { Permission } from "@/lib/rbac";
type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm?: Permission };

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/timeclock", label: "General Time Clock", icon: Clock },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/courses", label: "My Trainings", icon: GraduationCap },
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Company Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/records-desk", label: "Records Desk", icon: ClipboardCheck },
  { to: "/dashboard/pba-ledger", label: "PBA Trust Ledger", icon: Wallet },
  { to: "/dashboard/scheduling", label: "Scheduling", icon: CalendarDays },
  { to: "/dashboard/employees", label: "Employees", icon: Users },
  { to: "/dashboard/clients", label: "Clients", icon: Contact2 },
  { to: "/dashboard/teams", label: "Teams & Homes", icon: Building2 },
  { to: "/dashboard/billing", label: "Billing", icon: Receipt, perm: "view_billing" },
  { to: "/dashboard/audit", label: "Audit", icon: FolderArchive },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NECTAR_NAV: NavItem[] = [
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle },
  { to: "/dashboard/authoritative-sources", label: "Authoritative Sources", icon: ShieldCheck },
  { to: "/dashboard/nectar-docs", label: "Company Docs", icon: Database },
  { to: "/dashboard/external-compliance", label: "External Compliance", icon: ExternalLink },
];

function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView } = usePortalView();
  const { isExecutive } = useIsHiveExecutive();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    supabase.from("profiles").select("must_change_password").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.must_change_password) navigate({ to: "/reset-password" });
      });
    return () => { cancelled = true; };
  }, [session?.user?.id, navigate]);

  const role: Role = org?.role ?? "employee";
  const isAdminCapable = can("manage_users") || role === "admin" || role === "manager" || role === "super_admin";
  const allowedViews: Array<"staff" | "admin" | "staff_mobile" | "hive_exec"> = ["staff"];
  if (isAdminCapable) { allowedViews.push("admin", "staff_mobile"); }
  if (isExecutive) { allowedViews.push("hive_exec"); }
  const rawView = allowedViews.includes(view as "staff" | "admin" | "staff_mobile" | "hive_exec")
    ? (view as "staff" | "admin" | "staff_mobile" | "hive_exec")
    : "staff";
  const isMobilePreview = rawView === "staff_mobile";
  const isHiveExecView  = rawView === "hive_exec";
  // HIVE Executive is its own context — never mixed with a company's admin/staff nav.
  const effectiveView: "staff" | "admin" | "hive_exec" =
    isHiveExecView ? "hive_exec" : (rawView === "admin" ? "admin" : "staff");
  const execNav: NavItem[] = [
    { to: "/dashboard/hive-exec", label: "HIVE Overview", icon: LayoutDashboard, exact: true },
    { to: "/dashboard/hive-exec/new-company", label: "Add Company", icon: Plus },
    { to: "/dashboard/hive-exec/permissions", label: "Permissions & Roles", icon: UserCog },
    { to: "/dashboard/hive-exec/plans", label: "Plans & Billing", icon: CreditCard },
    { to: "/dashboard/hive-exec/health", label: "Account Health", icon: Activity },
    { to: "/dashboard/hive-exec/tickets", label: "Support Queue", icon: LifeBuoy },
    { to: "/dashboard/hive-exec/company-migration", label: "Company Migration", icon: ArrowRightLeft },
  ];
  const baseNav: NavItem[] =
    effectiveView === "hive_exec" ? execNav :
    effectiveView === "admin"     ? ADMIN_NAV : STAFF_NAV;
  const nav: NavItem[] = baseNav.filter((n) => !n.perm || can(n.perm) || role === "admin" || role === "super_admin");

  // Keep view and content strictly aligned: leaving HIVE View must also leave
  // /dashboard/hive-exec, and entering HIVE View jumps to the platform landing.
  useEffect(() => {
    if (isHiveExecView && !pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard/hive-exec" });
    } else if (!isHiveExecView && pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard" });
    }
  }, [isHiveExecView, pathname, navigate]);

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }





  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };


  const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6 font-display text-lg font-bold tracking-tight">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Hexagon className="h-4 w-4" strokeWidth={2.5} />
        </span>
        HIVE
      </div>


      {(isAdminCapable || isExecutive) && (
        <div className="border-b border-sidebar-border px-4 py-4">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            Portal View
          </label>
          <Select value={rawView} onValueChange={(v) => setView(v as "staff" | "admin" | "staff_mobile" | "hive_exec")}>
            <SelectTrigger className="w-full border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">
                <span className="inline-flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5" /> Staff View
                </span>
              </SelectItem>
              {isAdminCapable && (
                <SelectItem value="admin">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" /> Admin View
                  </span>
                </SelectItem>
              )}
              {isAdminCapable && (
                <SelectItem value="staff_mobile">
                  <span className="inline-flex items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5" /> Staff Mobile (Preview)
                  </span>
                </SelectItem>
              )}
              {isExecutive && (
                <SelectItem value="hive_exec">
                  <span className="inline-flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> HIVE Executive
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}


      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          const slug = item.to.replace(/^\/dashboard\/?/, "") || "home";
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              data-tour={`nav.${slug}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}

        {effectiveView === "admin" && (
          <div className="mt-5 border-t border-sidebar-border pt-5">
            {/* Premium NECTAR section header */}
            <div className="mb-2.5 flex items-start gap-2.5 px-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f4a93a]/15 ring-1 ring-[#f4a93a]/20">
                <Hexagon className="h-4 w-4 text-[#f4a93a]" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <span className="text-sm font-bold tracking-wide text-[#f4a93a]">NECTAR</span>
                <p className="text-[11px] leading-relaxed text-sidebar-foreground/50">
                  The brain. Tabs below feed it the data the rest of HIVE reads from.
                </p>
              </div>
            </div>

            {/* NECTAR nav cluster — unified amber family */}
            <div className="mx-1 space-y-0.5 rounded-xl border border-[#f4a93a]/10 bg-[#f4a93a]/[0.04] p-1.5">
              {NECTAR_NAV.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                const Icon = item.icon;
                const slug = item.to.replace(/^\/dashboard\/?/, "") || "home";
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    data-tour={`nav.${slug}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-[#d97a1c] text-white shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-[#f4a93a]/10 hover:text-[#f4a93a]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-white" : "text-[#f4a93a]/80"}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 text-xs text-sidebar-foreground/60">
          <div className="font-medium text-sidebar-foreground">{user?.user_metadata?.full_name ?? user?.email}</div>
          <div className="flex items-center justify-between">
            <span className="truncate">
              {isHiveExecView ? "HIVE Platform" : (org?.organization_name ?? "Your workspace")}
            </span>
            <span className="ml-2 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {isHiveExecView ? "HIVE Exec" : ROLE_LABEL[role]}
            </span>
          </div>

        </div>

        <Button
          onClick={signOut}
          variant="outline"
          size="sm"
          className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </>
  );

  const nectarNavForView = effectiveView === "admin" ? NECTAR_NAV : [];
  const allNav = [...nav, ...nectarNavForView];
  const pageTitle =
    allNav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Dashboard";
  const isStaffView = effectiveView === "staff";

  return (
    <div className="flex min-h-screen flex-col">
      <ImpersonationBanner />

      {/* Mobile shell — staff view only (below md) */}
      {isStaffView && !isMobilePreview && (
        <StaffMobileShell title={pageTitle}>
          <Outlet />
        </StaffMobileShell>
      )}

      {/* Desktop layout (md+) — unchanged. Also used on mobile for Admin View. */}
      <div
        className={`grid flex-1 md:grid-cols-[260px_1fr] ${isStaffView && !isMobilePreview ? "hidden md:grid" : ""}`}
      >
        <aside className="hidden flex-col bg-sidebar text-sidebar-foreground md:flex">
          <SidebarBody />
        </aside>

        <div className="flex flex-col">
          <header className="flex h-16 items-center justify-between gap-2 border-b border-border bg-background px-4 md:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex h-full flex-col">
                    <SidebarBody onNavigate={() => setMobileOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight">
                  {pageTitle}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {isHiveExecView
                    ? "HIVE Platform · HIVE Executive"
                    : `${org?.organization_name ?? "Workspace"} · ${ROLE_LABEL[role]}`}

                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTaskCenterOpen(true)}
                data-tour="nav.help"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-1 text-xs font-medium text-[#9a3412] hover:bg-[#ffedd5]"
                title="Open NECTAR Task Center"
              >
                <ListChecks className="h-3.5 w-3.5" /> <span className="hidden md:inline">Guide me</span>
              </button>
              {isAdminCapable && effectiveView === "admin" && <NotificationBell />}
              <Button onClick={signOut} variant="ghost" size="sm" className="md:hidden">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <NectarTaskCenter open={taskCenterOpen} onOpenChange={setTaskCenterOpen} />

          <main className={isMobilePreview ? "flex-1 bg-secondary/40" : "flex-1 bg-secondary/40 px-4 py-6 md:px-8"}>
            {isMobilePreview ? (
              <StaffMobilePreviewFrame title={pageTitle}>
                <Outlet />
              </StaffMobilePreviewFrame>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
