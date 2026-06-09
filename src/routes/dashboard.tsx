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

  LogOut, Users, Building2, Contact2, ClipboardCheck, Wallet, Pill, Menu, CalendarDays, HelpCircle, Lock, CreditCard, Activity, LifeBuoy, Receipt, FolderArchive, Database, ShieldCheck, ArrowRightLeft, Plus, UserCog, ExternalLink, Sparkles, MapPin, TrendingUp, HandCoins, Scale, FileText, Inbox,
} from "lucide-react";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffMobileShell } from "@/components/staff-mobile/staff-mobile-shell";
import { StaffMobilePreviewFrame } from "@/components/staff-mobile/staff-mobile-preview-frame";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { ListChecks } from "lucide-react";
import { OrgSwitcher, DemoBadge, DemoOrgBanner } from "@/components/org-switcher";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInboxUnreadCount } from "@/lib/inbox-messages.functions";


export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HIVE" }] }),
  component: DashboardLayout,
});

import type { Permission } from "@/lib/rbac";
type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm?: Permission };

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/ask-nectar", label: "Ask NECTAR", icon: Sparkles },
  { to: "/dashboard/courses", label: "My Trainings", icon: GraduationCap },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/hub/employees", label: "Employees", icon: Users },
  { to: "/dashboard/hub/clients", label: "Clients", icon: Contact2 },
  { to: "/dashboard/scheduling", label: "Scheduling", icon: CalendarDays },
  { to: "/dashboard/hub/documentation", label: "Documentation", icon: ClipboardCheck },
  { to: "/dashboard/hub/finances", label: "Finances", icon: Receipt, perm: "view_billing" },
  { to: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NECTAR_NAV: NavItem[] = [
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle },
  { to: "/dashboard/hub/knowledge", label: "Knowledge base", icon: Database },
];


type PlatformStateLite = { code: string; name: string; status: "draft" | "active" | "coming_soon" };

type PV = "staff" | "admin" | "staff_mobile" | "hive_exec" | "state_preview";

type SidebarBodyProps = {
  user: ReturnType<typeof useAuth>["user"];
  role: Role;
  isAdminCapable: boolean;
  isExecutive: boolean;
  isHiveExecView: boolean;
  rawView: PV;
  setView: (v: PV) => void;
  isStatePreview: boolean;
  stateCode: string | null;
  setStateCode: (code: string | null) => void;
  subView: "admin" | "staff";
  setSubView: (s: "admin" | "staff") => void;
  states: PlatformStateLite[];
  currentPreviewState: PlatformStateLite | null;
  nav: NavItem[];
  showNectarCluster: boolean;
  pathname: string;
  signOut: () => Promise<void>;
  onNavigate?: () => void;
};



function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView, stateCode, setStateCode, subView, setSubView, hydrated: viewHydrated } = usePortalView();
  const [states, setStates] = useState<PlatformStateLite[]>([]);
  const { isExecutive, isLoading: execLoading } = useIsHiveExecutive();
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
    supabase.from("profiles").select("must_change_password, bc_role").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.must_change_password) {
          navigate({ to: "/reset-password" });
          return;
        }
        // Behaviorists (bc_role set) route directly to their caseload — no time clock,
        // no staff caseload. Only redirect from the dashboard home, not from deep links.
        if (data?.bc_role && pathname === "/dashboard") {
          navigate({ to: "/dashboard/behaviorist", replace: true });
        }
      });
    return () => { cancelled = true; };
  }, [session?.user?.id, pathname, navigate]);

  const role: Role = org?.role ?? "employee";
  const isCommitteeMember = role === "committee_member";
  const isAdminCapable = !isCommitteeMember && (can("manage_users") || role === "admin" || role === "manager" || role === "super_admin");

  // Fail-closed gate: a committee_member can ONLY access /dashboard/hrc.
  // Redirect away from anything else immediately.
  useEffect(() => {
    if (!loading && session && isCommitteeMember && !pathname.startsWith("/dashboard/hrc")) {
      navigate({ to: "/dashboard/hrc", replace: true });
    }
  }, [loading, session, isCommitteeMember, pathname, navigate]);
  // PV type is hoisted to module scope.
  const allowedViews: PV[] = ["staff"];
  if (isAdminCapable) { allowedViews.push("admin", "staff_mobile"); }
  if (isExecutive) { allowedViews.push("hive_exec", "state_preview"); }
  const rawView: PV = allowedViews.includes(view as PV) ? (view as PV) : "staff";
  const isMobilePreview = rawView === "staff_mobile";
  const isHiveExecView  = rawView === "hive_exec";
  const isStatePreview  = rawView === "state_preview";
  // HIVE Executive is its own context — never mixed with a company's admin/staff nav.
  const effectiveView: "staff" | "admin" | "hive_exec" =
    isHiveExecView ? "hive_exec"
    : isStatePreview ? (subView === "staff" ? "staff" : "admin")
    : (rawView === "admin" ? "admin" : "staff");
  const execNav: NavItem[] = [
    { to: "/dashboard/hive-exec", label: "HIVE Overview", icon: LayoutDashboard, exact: true },
    { to: "/dashboard/hive-exec/new-company", label: "Add Company", icon: Plus },
    { to: "/dashboard/hive-exec/states", label: "States", icon: MapPin },
    { to: "/dashboard/hive-exec/approvals", label: "Extraction Approvals", icon: ShieldCheck },
    { to: "/dashboard/hive-exec/permissions", label: "Permissions & Roles", icon: UserCog },
    { to: "/dashboard/hive-exec/plans", label: "Plans & Billing", icon: CreditCard },
    { to: "/dashboard/hive-exec/health", label: "Account Health", icon: Activity },
    { to: "/dashboard/hive-exec/tickets", label: "Support Queue", icon: LifeBuoy },
    { to: "/dashboard/hive-exec/company-migration", label: "Company Migration", icon: ArrowRightLeft },
    { to: "/dashboard/hive-exec/nectar", label: "NECTAR", icon: Hexagon },
  ];
  const COMMITTEE_NAV: NavItem[] = [
    { to: "/dashboard/hrc", label: "Human Rights Committee", icon: Scale, exact: true },
  ];
  const baseNav: NavItem[] =
    isCommitteeMember            ? COMMITTEE_NAV :
    effectiveView === "hive_exec" ? execNav :
    effectiveView === "admin"     ? ADMIN_NAV : STAFF_NAV;
  const nav: NavItem[] = baseNav.filter((n) => !n.perm || can(n.perm) || role === "admin" || role === "super_admin");

  // Load states for the State portal dropdown (executives only).
  useEffect(() => {
    if (!isExecutive) return;
    let cancelled = false;
    supabase.from("platform_states").select("code, name, status").order("name").then(({ data }) => {
      if (cancelled) return;
      setStates((data ?? []) as PlatformStateLite[]);
    });
    return () => { cancelled = true; };
  }, [isExecutive]);

  // Default the previewed state to the first reference/active when entering the mode.
  useEffect(() => {
    if (isStatePreview && !stateCode && states.length > 0) {
      const pick = states.find((s) => s.status === "active") ?? states[0];
      if (pick) setStateCode(pick.code);
    }
  }, [isStatePreview, stateCode, states, setStateCode]);

  // Keep view and content strictly aligned: leaving HIVE View must also leave
  // /dashboard/hive-exec, and entering HIVE View jumps to the platform landing.
  useEffect(() => {
    // Don't reconcile view↔route until ALL bootstrap signals are ready:
    //   - executive status resolved (so allowedViews includes hive_exec)
    //   - portal view hydrated from localStorage
    //   - org/role loaded (drives allowedViews for admin)
    // Without this, the brief window after login (queryClient.clear)
    // shows isExecutive=false / role=employee while pathname is still
    // /dashboard/hive-exec, and the kick-back at line E would bounce the
    // user off, only for the forward push to send them back once the
    // queries settle — the reload/refresh loop the user reported.
    if (execLoading || !viewHydrated || orgLoading) return;
    if (isHiveExecView && !pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard/hive-exec", replace: true });
    } else if (!isHiveExecView && !isStatePreview && pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [execLoading, viewHydrated, orgLoading, isHiveExecView, isStatePreview, pathname, navigate]);

  const currentPreviewState = isStatePreview
    ? states.find((s) => s.code === stateCode) ?? null
    : null;
  const isComingSoonPreview = isStatePreview && currentPreviewState?.status === "coming_soon";

  if (loading || !session || execLoading || !viewHydrated || orgLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }





  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };


  const nectarNavForView = effectiveView === "admin" ? NECTAR_NAV : [];
  const allNav = [...nav, ...nectarNavForView];
  const pageTitle =
    allNav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Dashboard";
  const isStaffView = effectiveView === "staff";

  const sidebarProps: Omit<SidebarBodyProps, "onNavigate"> = {
    user,
    role,
    isAdminCapable,
    isExecutive,
    isHiveExecView,
    rawView,
    setView,
    isStatePreview,
    stateCode,
    setStateCode,
    subView,
    setSubView,
    states,
    currentPreviewState,
    nav,
    showNectarCluster: effectiveView === "admin",
    pathname,
    signOut,
  };



  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ImpersonationBanner />

      {/* Mobile shell — staff view only (below md) */}
      {isStaffView && !isMobilePreview && (
        <StaffMobileShell title={pageTitle}>
          <Outlet />
        </StaffMobileShell>
      )}

      {/* Desktop layout (md+) — unchanged. Also used on mobile for Admin View. */}
      <div
        className={`grid w-full min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)] ${isStaffView && !isMobilePreview ? "hidden md:grid" : ""}`}
      >
        <aside className="hidden h-full flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
          <SidebarBody {...sidebarProps} />
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">

          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4 md:px-6">
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
                    <SidebarBody {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
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
                    : isStatePreview
                      ? `State Build/Preview · ${currentPreviewState?.name ?? "—"} · ${subView === "admin" ? "Admin" : "Staff"} view`
                      : (
                        <span className="inline-flex items-center gap-1.5">
                          {org?.organization_name ?? "Workspace"}
                          {org?.is_demo && <DemoBadge />}
                          <span>· {ROLE_LABEL[role]}</span>
                        </span>
                      )}

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
          {!isHiveExecView && !isStatePreview && <DemoOrgBanner />}

          {isStatePreview && (
            <div className="flex items-center justify-between gap-3 border-b border-[#f4a93a]/30 bg-[#f4a93a]/[0.08] px-4 py-2 text-xs md:px-6">
              <div className="flex items-center gap-2 text-[#9a3412]">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-semibold uppercase tracking-wider">State Build/Preview</span>
                <span className="text-[#9a3412]/80">
                  {currentPreviewState?.name ?? "No state selected"} ·{" "}
                  {subView === "admin" ? "Admin view" : "Staff view"} · template/sample data, not live company records
                </span>
              </div>
              {currentPreviewState && (
                <Link
                  to="/dashboard/hive-exec/states/$stateCode"
                  params={{ stateCode: currentPreviewState.code }}
                  className="hidden md:inline-flex items-center gap-1 rounded-md border border-[#f4a93a]/40 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#9a3412] hover:bg-white"
                >
                  Edit template
                </Link>
              )}
            </div>
          )}

          <main className={isMobilePreview ? "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-secondary/40" : "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-secondary/40 px-4 py-6 md:px-8"}>
            {isStatePreview && !stateCode ? (
              <div className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
                Select a state from the sidebar to load the platform configured as that state.
              </div>
            ) : isComingSoonPreview ? (
              <div className="mx-auto max-w-xl rounded-lg border border-dashed border-[#f4a93a]/40 bg-[#f4a93a]/[0.06] p-10 text-center">
                <MapPin className="mx-auto h-8 w-8 text-[#f4a93a]" />
                <h2 className="mt-3 text-lg font-semibold tracking-tight">
                  Coming soon for {currentPreviewState?.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  No template has been built for this state yet. Configure the state's skeleton to enable the {subView === "admin" ? "admin" : "staff"} preview.
                </p>
                {currentPreviewState && (
                  <Link
                    to="/dashboard/hive-exec/states/$stateCode"
                    params={{ stateCode: currentPreviewState.code }}
                    className="mt-4 inline-flex items-center gap-1 rounded-md border border-[#f4a93a]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#9a3412] hover:bg-[#f4a93a]/10"
                  >
                    Build {currentPreviewState.name} template
                  </Link>
                )}
              </div>
            ) : isMobilePreview ? (
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

/**
 * Hoisted to module scope so it keeps a stable component identity across
 * re-renders of DashboardLayout. Defining it inside the parent caused React
 * to unmount/remount the entire sidebar on every parent render, which made
 * sidebar nav clicks fail intermittently.
 */
function SidebarBody({
  user,
  role,
  isAdminCapable,
  isExecutive,
  isHiveExecView,
  rawView,
  setView,
  isStatePreview,
  stateCode,
  setStateCode,
  subView,
  setSubView,
  states,
  currentPreviewState,
  nav,
  showNectarCluster,
  pathname,
  signOut,
  onNavigate,
}: SidebarBodyProps) {
  return (
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
          <Select value={rawView} onValueChange={(v) => setView(v as PV)}>
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
              {isExecutive && (
                <SelectItem value="state_preview">
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> State (Build/Preview)
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {isStatePreview && (
            <div className="mt-3 space-y-2 rounded-md border border-[#f4a93a]/30 bg-[#f4a93a]/[0.06] p-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                State
              </label>
              <Select value={stateCode ?? ""} onValueChange={(v) => setStateCode(v)}>
                <SelectTrigger className="w-full border-sidebar-border bg-sidebar text-sidebar-foreground">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => {
                    const isActive = s.status === "active";
                    return (
                      <SelectItem key={s.code} value={s.code}>
                        <span className="inline-flex items-center gap-2">
                          {s.name}
                          <span
                            className={`rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wider ${
                              isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {isActive ? "Active" : s.status === "coming_soon" ? "Coming soon" : "Inactive"}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setSubView("admin")}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    subView === "admin"
                      ? "bg-[#d97a1c] text-white"
                      : "bg-sidebar text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => setSubView("staff")}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    subView === "staff"
                      ? "bg-[#d97a1c] text-white"
                      : "bg-sidebar text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  }`}
                >
                  Staff
                </button>
              </div>
              {currentPreviewState && (
                <Link
                  to="/dashboard/hive-exec/states/$stateCode"
                  params={{ stateCode: currentPreviewState.code }}
                  className="block rounded-md border border-[#f4a93a]/30 bg-sidebar px-2 py-1 text-center text-[11px] font-medium text-[#f4a93a] hover:bg-[#f4a93a]/10"
                >
                  Edit {currentPreviewState.name} template
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          const slug = item.to.replace(/^\/dashboard\/?/, "") || "home";
          const isNectar = item.label === "NECTAR";
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              data-tour={`nav.${slug}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? isNectar
                    ? "bg-[#d97a1c] text-white shadow-sm"
                    : "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : isNectar
                    ? "text-[#f4a93a] hover:bg-[#f4a93a]/10 hover:text-[#d97a1c]"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? (isNectar ? "text-white" : "") : isNectar ? "text-[#f4a93a]" : ""}`} /> {item.label}
            </Link>
          );
        })}

        {showNectarCluster && (
          <div className="mt-5 border-t border-sidebar-border pt-5">
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
          <div className="mt-2">
            {isHiveExecView ? (
              <div className="flex items-center justify-between">
                <span className="truncate">HIVE Platform</span>
                <span className="ml-2 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">HIVE Exec</span>
              </div>
            ) : (
              <>
                <OrgSwitcher />
                <div className="mt-1.5 flex justify-end">
                  <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {ROLE_LABEL[role]}
                  </span>
                </div>
              </>
            )}
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
}
