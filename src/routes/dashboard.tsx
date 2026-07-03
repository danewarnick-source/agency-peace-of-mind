import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
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

  LogOut, Users, Building2, Contact2, ClipboardCheck, Wallet, Pill, Menu, CalendarDays, HelpCircle, Lock, CreditCard, Activity, LifeBuoy, Receipt, FolderArchive, Database, ShieldCheck, ArrowRightLeft, Plus, UserCog, ExternalLink, Sparkles, MapPin, TrendingUp, HandCoins, Scale, FileText, Inbox, Search, AlarmClock,
} from "lucide-react";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { EXEC_NAV } from "@/lib/exec-nav";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffMobileShell } from "@/components/staff-mobile/staff-mobile-shell";
import { StaffMobilePreviewFrame } from "@/components/staff-mobile/staff-mobile-preview-frame";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { NectarSearchBar } from "@/components/nectar/nectar-search-bar";
import { ListChecks } from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { OrgSwitcher, DemoBadge, DemoOrgBanner } from "@/components/org-switcher";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInboxUnreadCount } from "@/lib/inbox-messages.functions";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useOrgFeatures } from "@/hooks/use-feature-enabled";

import { BillingBanner } from "@/components/billing/billing-banner";
import { DraftJobsProvider } from "@/components/nectar/draft-jobs-driver";
import { DraftJobsHeaderPill } from "@/components/nectar/draft-jobs-header-pill";



function DashboardShellError({ error }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong in the dashboard shell</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >Reload</button>
          <a href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">Dashboard home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HIVE" }] }),
  // Lockout gate — runs on every dashboard navigation. If the user's active
  // org has org_subscriptions.locked_at set, redirect to /billing-locked.
  // Admins keep access to the billing/subscription page so they can pay.
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return; // SSR has no session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    // Resolve active org (matches use-org.ts contract).
    let activeOrgId: string | null = null;
    try { activeOrgId = window.localStorage.getItem("hive.activeOrgId"); } catch { /* ignore */ }

    // Fetch the caller's memberships once — we need role too.
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", session.user.id)
      .eq("active", true);
    if (!memberships || memberships.length === 0) return;

    const membership =
      memberships.find((m) => m.organization_id === activeOrgId) ?? memberships[0];
    const orgId = membership.organization_id;
    const isAdmin = membership.role === "admin" || membership.role === "super_admin";

    const { data: sub } = await supabase
      .from("org_subscriptions")
      .select("locked_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.locked_at) return;

    // Locked. Allow admins on the billing/subscription page so they can pay.
    const path = location.pathname;
    const billingAllowlist = [
      "/dashboard/billing/subscription",
      "/dashboard/settings/subscription",
    ];
    if (isAdmin && billingAllowlist.some((p) => path === p || path.startsWith(p + "/"))) {
      return;
    }
    throw redirect({ to: "/billing-locked" });
  },
  component: DashboardLayout,
  errorComponent: DashboardShellError,
});

import type { Permission } from "@/lib/rbac";
type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm?: Permission; feature?: string; isLocked?: boolean };

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/schedule", label: "Schedule", icon: CalendarDays, feature: "evv_timesheets" },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/ask-nectar", label: "Ask NECTAR", icon: Sparkles, feature: "nectar" },
  { to: "/dashboard/courses", label: "My Trainings", icon: GraduationCap, feature: "staff_onboarding" },
  { to: "/dashboard/hive-training", label: "HIVE Training", icon: GraduationCap, feature: "hive_training" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/hub/employees", label: "Employees", icon: Users, feature: "staff_onboarding" },
  { to: "/dashboard/hub/clients", label: "Clients", icon: Contact2, feature: "client_intake" },
  { to: "/dashboard/scheduler", label: "Scheduler", icon: CalendarDays, feature: "evv_timesheets" },
  { to: "/dashboard/hub/documentation", label: "Documentation", icon: ClipboardCheck, feature: "pcsp" },
  { to: "/dashboard/deadlines", label: "Deadlines", icon: AlarmClock },
  { to: "/dashboard/summaries", label: "Summaries", icon: FileText },
  { to: "/dashboard/hub/finances", label: "Finances", icon: Receipt, perm: "view_billing", feature: "pba_ledgers" },
  { to: "/dashboard/hive-training", label: "HIVE Training", icon: GraduationCap, feature: "hive_training" },
  { to: "/dashboard/reports", label: "Reports", icon: FileText, perm: "export_reports" },
  { to: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];


const NECTAR_NAV: NavItem[] = [
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle, feature: "nectar" },
  { to: "/dashboard/hub/knowledge", label: "Knowledge base", icon: Database, feature: "nectar" },
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
  nectarNav: NavItem[];
  showNectarCluster: boolean;
  pathname: string;
  signOut: () => Promise<void>;
  onNavigate?: () => void;
  inboxUnread: number;
};



function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, hasStoredView, setView, stateCode, setStateCode, subView, setSubView, hydrated: viewHydrated } = usePortalView();
  const [states, setStates] = useState<PlatformStateLite[]>([]);
  const { isExecutive, isLoading: execLoading } = useIsHiveExecutive();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);



  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);


  // must_change_password is enforced globally at the router root
  // (MustChangePasswordGate in __root.tsx) — no per-layout check needed here.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    supabase.from("profiles").select("bc_role").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
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

  // First-login default: admin-capable users land on the admin portal (Home +
  // admin nav), NOT the empty staff caseload. Persist "admin" once when they
  // have no stored choice, so every view-aware surface (nav, home, caseload,
  // daily logs, forms) agrees. An explicit choice — including Staff View — is
  // preserved and never overridden. The synchronous resolution below keeps the
  // very first frame correct so there's no flash before this persists.
  useEffect(() => {
    if (!viewHydrated || orgLoading || execLoading) return;
    if (!hasStoredView && isAdminCapable) setView("admin");
  }, [viewHydrated, orgLoading, execLoading, hasStoredView, isAdminCapable, setView]);
  // PV type is hoisted to module scope.
  const allowedViews: PV[] = ["staff"];
  if (isAdminCapable) { allowedViews.push("admin", "staff_mobile"); }
  if (isExecutive) { allowedViews.push("hive_exec", "state_preview"); }
  // Default admin-capable users (who haven't explicitly chosen a view) to the
  // admin portal, so a fresh admin lands on the admin Home + nav rather than the
  // empty staff caseload. An explicit choice (incl. Staff View) is preserved.
  const defaultView: PV = isAdminCapable ? "admin" : "staff";
  const resolvedView: PV = hasStoredView ? view : defaultView;
  const rawView: PV = allowedViews.includes(resolvedView) ? resolvedView : "staff";
  const isMobilePreview = rawView === "staff_mobile";
  const isHiveExecView  = rawView === "hive_exec";
  const isStatePreview  = rawView === "state_preview";
  // HIVE Executive is its own context — never mixed with a company's admin/staff nav.
  const effectiveView: "staff" | "admin" | "hive_exec" =
    isHiveExecView ? "hive_exec"
    : isStatePreview ? (subView === "staff" ? "staff" : "admin")
    : (rawView === "admin" ? "admin" : "staff");
  const execNav: NavItem[] = EXEC_NAV as NavItem[];
  const COMMITTEE_NAV: NavItem[] = [
    { to: "/dashboard/hrc", label: "Human Rights Committee", icon: Scale, exact: true },
  ];
  const baseNav: NavItem[] =
    isCommitteeMember            ? COMMITTEE_NAV :
    effectiveView === "hive_exec" ? execNav :
    effectiveView === "admin"     ? ADMIN_NAV : STAFF_NAV;
  const { hasAddon } = useEntitlements();
  const hiveTrainingEntitled = hasAddon("hive_training");
  const { isEnabled: isFeatureOn } = useOrgFeatures();
  const nav: NavItem[] = baseNav
    .filter((n) => !n.perm || can(n.perm) || role === "admin" || role === "super_admin")
    // Legacy add-on tier gate still applies to HIVE Training (paid entitlement).
    .filter((n) => hiveTrainingEntitled || n.to !== "/dashboard/hive-training")
    // Master-Controller gating: keep item visible; mark isLocked when feature is OFF.
    .map((n) => ({ ...n, isLocked: n.feature ? !isFeatureOn(n.feature) : false }));


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

  const unreadFn = useServerFn(getInboxUnreadCount);
  const unreadQ = useQuery({
    enabled: !!org?.organization_id && effectiveView === "admin" && isAdminCapable,
    queryKey: ["inbox-unread", org?.organization_id ?? null],
    queryFn: () => unreadFn({ data: { organization_id: org!.organization_id } }),
    refetchInterval: 60_000,
  });

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


  const nectarNavForView = effectiveView === "admin"
    ? NECTAR_NAV.map((n) => ({ ...n, isLocked: n.feature ? !isFeatureOn(n.feature) : false }))
    : [];
  const allNav = [...nav, ...nectarNavForView];
  const lockedRouteItem = allNav
    .filter((n) => n.feature && n.isLocked)
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => (n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  const pageTitle =
    allNav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Dashboard";
  const isStaffView = effectiveView === "staff";
  const inboxUnread = unreadQ.data?.count ?? 0;

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
    nectarNav: nectarNavForView,
    showNectarCluster: effectiveView === "admin",
    pathname,
    signOut,
    inboxUnread,
  };



  return (
    <DraftJobsProvider>
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden">
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

          <header
            className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4 md:px-6 min-h-16"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingLeft: "max(1rem, env(safe-area-inset-left))",
              paddingRight: "max(1rem, env(safe-area-inset-right))",
            }}
          >
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

            <div className="hidden flex-1 justify-center px-4 md:flex">
              {!isHiveExecView && (
                <NectarSearchBar
                  nav={allNav.map((n) => ({ to: n.to, label: n.label }))}
                  isAdminCapable={isAdminCapable && effectiveView === "admin"}
                  variant="desktop"
                  askRoute="/dashboard/help"
                />
              )}
            </div>


            <div className="flex items-center gap-2">
              {!isHiveExecView && (
                <button
                  type="button"
                  aria-label={mobileSearchOpen ? "Close NECTAR search" : "Open NECTAR search"}
                  aria-expanded={mobileSearchOpen}
                  onClick={() => setMobileSearchOpen((v) => !v)}
                  className="grid h-11 w-11 place-items-center rounded-md border border-white/15 bg-[#0B1126] text-white hover:bg-[#0d1430] md:hidden"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setTaskCenterOpen(true)}
                data-tour="nav.help"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-white/15 bg-[#0B1126] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#0d1430]"
                title="Open NECTAR Task Center"
              >
                <ListChecks className="h-3.5 w-3.5 text-[#f4a93a]" /> <span className="hidden md:inline">Guide me</span>
              </button>
              {isAdminCapable && effectiveView === "admin" && <DraftJobsHeaderPill />}
              {isAdminCapable && effectiveView === "admin" && <NotificationBell />}
              <Button onClick={signOut} variant="ghost" size="sm" className="md:hidden">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          {/* Collapsed-by-default NECTAR ask bar on phones — expands from the
              header icon; the desktop inline bar is unchanged. */}
          {mobileSearchOpen && !isHiveExecView && (
            <div className="border-b border-border bg-[#0d112b] px-4 py-2 md:hidden">
              <NectarSearchBar
                nav={allNav.map((n) => ({ to: n.to, label: n.label }))}
                isAdminCapable={isAdminCapable && effectiveView === "admin"}
                variant="mobile"
                askRoute="/dashboard/help"
              />
            </div>
          )}
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

          {isAdminCapable && effectiveView === "admin" && org?.organization_id && (
            <BillingBanner organizationId={org.organization_id} isAdmin />
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
            ) : lockedRouteItem?.feature ? (
              <FeatureLockedRoute featureKey={lockedRouteItem.feature} />
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
    </DraftJobsProvider>
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
  nectarNav,
  showNectarCluster,
  pathname,
  signOut,
  onNavigate,
  inboxUnread,
}: SidebarBodyProps) {
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | null>(null);
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
          const locked = !!item.isLocked;

          if (locked) {
            return (
              <button
                key={item.to}
                type="button"
                data-tour={`nav.${slug}`}
                onClick={() => item.feature && setUpgradeFeatureKey(item.feature)}
                aria-label={`${item.label} — locked. Click to request upgrade.`}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/60 transition-colors cursor-pointer"
              >
                <Icon className="h-4 w-4 opacity-60" />
                <span className="flex-1 text-left">{item.label}</span>
                <Lock className="h-3 w-3 opacity-70" />
              </button>
            );
          }

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
              <Icon className={`h-4 w-4 ${active ? (isNectar ? "text-white" : "") : isNectar ? "text-[#f4a93a]" : ""}`} />
              <span className="flex-1">{item.label}</span>
              {item.to === "/dashboard/inbox" && inboxUnread > 0 && (
                <span
                  aria-label={`${inboxUnread} unread`}
                  className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                >
                  {inboxUnread > 99 ? "99+" : inboxUnread}
                </span>
              )}
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
              {nectarNav.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                const Icon = item.icon;
                const slug = item.to.replace(/^\/dashboard\/?/, "") || "home";
                const locked = !!item.isLocked;
                if (locked) {
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => item.feature && setUpgradeFeatureKey(item.feature)}
                      data-tour={`nav.${slug}`}
                      aria-label={`${item.label} — locked. Click to request upgrade.`}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40 transition-colors hover:bg-[#f4a93a]/10 hover:text-sidebar-foreground/60"
                    >
                      <Icon className="h-4 w-4 text-[#f4a93a]/50" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <Lock className="h-3 w-3 opacity-70" />
                    </button>
                  );
                }
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

      {upgradeFeatureKey && (
        <UpgradeGate
          featureKey={upgradeFeatureKey}
          open={!!upgradeFeatureKey}
          onOpenChange={(o) => { if (!o) setUpgradeFeatureKey(null); }}
        />
      )}

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
