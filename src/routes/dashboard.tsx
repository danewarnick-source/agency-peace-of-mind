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

  LogOut, Users, Building2, Contact2, ClipboardCheck, Wallet, Pill, Menu, Clock, CalendarDays, HelpCircle, Lock, CreditCard, Activity, LifeBuoy, Receipt, FolderArchive, Database, ShieldCheck, ArrowRightLeft, Plus, UserCog, ExternalLink, Sparkles, MapPin, TrendingUp,
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
  { to: "/dashboard/ask-nectar", label: "Ask NECTAR", icon: Sparkles },
  { to: "/dashboard/courses", label: "My Trainings", icon: GraduationCap },
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
  { to: "/dashboard/financial", label: "Financial", icon: TrendingUp, perm: "manage_billing" },
  { to: "/dashboard/audit", label: "Audit", icon: FolderArchive },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NECTAR_NAV: NavItem[] = [
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle },
  { to: "/dashboard/authoritative-sources", label: "Authoritative Sources", icon: ShieldCheck },
  { to: "/dashboard/nectar-docs", label: "Company Docs", icon: Database },
  { to: "/dashboard/external-compliance", label: "External Compliance", icon: ExternalLink },
  { to: "/dashboard/internal-audit", label: "Internal Audit", icon: ClipboardCheck },
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
  const { view, setView, stateCode, setStateCode, subView, setSubView } = usePortalView();
  const [states, setStates] = useState<PlatformStateLite[]>([]);
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
  const baseNav: NavItem[] =
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
    if (isHiveExecView && !pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard/hive-exec" });
    } else if (!isHiveExecView && !isStatePreview && pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard" });
    }
  }, [isHiveExecView, isStatePreview, pathname, navigate]);

  const currentPreviewState = isStatePreview
    ? states.find((s) => s.code === stateCode) ?? null
    : null;
  const isComingSoonPreview = isStatePreview && currentPreviewState?.status === "coming_soon";

  if (loading || !session) {
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
          <SidebarBody {...sidebarProps} />
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
          {!isHiveExecView && !isStatePreview && <DemoOrgBanner org={org} isLoading={orgLoading} />}

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

          <main className={isMobilePreview ? "flex-1 bg-secondary/40" : "flex-1 bg-secondary/40 px-4 py-6 md:px-8"}>
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
