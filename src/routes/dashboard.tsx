import {
  createFileRoute,
  isRedirect,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { usePortalView } from "@/hooks/use-portal-view";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import {
  LayoutDashboard,
  GraduationCap,
  Settings,
  LogOut,
  Users,
  Contact2,
  ClipboardCheck,
  Wallet,
  Pill,
  Menu,
  CalendarDays,
  HelpCircle,
  Lock,
  CreditCard,
  Activity,
  LifeBuoy,
  Receipt,
  FolderArchive,
  Database,
  ShieldCheck,
  ArrowRightLeft,
  Plus,
  UserCog,
  ExternalLink,
  Sparkles,
  MapPin,
  TrendingUp,
  HandCoins,
  Scale,
  FileText,
  Inbox,
  Search,
  Archive,
  ClipboardList,
} from "lucide-react";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { EXEC_NAV, EXEC_DOMAINS, COMMAND_CENTER_ITEM } from "@/lib/exec-nav";
import { useExecCapabilities } from "@/hooks/use-exec-capability";
import { getPendingUpgradeRequestCount } from "@/lib/org-features.functions";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffMobileShell } from "@/components/staff-mobile/staff-mobile-shell";
import { StaffMobilePreviewFrame } from "@/components/staff-mobile/staff-mobile-preview-frame";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { NectarSearchBar } from "@/components/nectar/nectar-search-bar";
import { ListChecks, Clock } from "lucide-react";
import { FeatureLockedRoute, UpgradeGate } from "@/components/upgrade-gate";
import { useActionRequiredQueue } from "@/hooks/use-action-required-queue";
import { useYieldToAdminHomeQueries } from "@/hooks/use-yield-to-admin-home";
import { isAdminHomePath } from "@/lib/yield-to-admin-home";
import { OrgSwitcher, DemoBadge, DemoOrgBanner } from "@/components/org-switcher";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInboxUnreadCount } from "@/lib/inbox-messages.functions";
import { useOrgFeatures } from "@/hooks/use-feature-enabled";
import {
  DASHBOARD_BOOT_TIMEOUT_MS,
  dashboardShouldRedirectToLogin,
  dashboardShellShowsLoading,
  readSessionHint,
  writeSessionHint,
} from "@/lib/auth-session-boot";
import { PortalViewSwitcher } from "@/components/portal-view-switcher";
import { HiveMark, HiveWordmark } from "@/components/brand/hive-mark";

import { BillingBanner } from "@/components/billing/billing-banner";
import { orgDashboardIsLocked, pathBypassesBillingLock } from "@/lib/billing-lock-client";
import { DraftJobsProvider } from "@/components/nectar/draft-jobs-driver";
import { DraftJobsHeaderPill } from "@/components/nectar/draft-jobs-header-pill";
import { GuidedTourProvider } from "@/components/nectar/guided-tour-provider";
import { OPEN_DASHBOARD_MENU_EVENT, preventSheetDismissForPortalViewMenu } from "@/lib/portal-view-landing";
import { isCognitoAuth } from "@/lib/aws/env";
import { AWS_DB_ERROR_EVENT } from "@/lib/aws/exec-http";
import {
  HIVE_BOOTSTRAP_ERROR_EVENT,
  installBootstrapFailureWatch,
  shouldLeaveCognitoLoadingOverlay,
  type BootstrapFailureKind,
} from "@/lib/cognito-login-gate";

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
          >
            Reload
          </button>
          <a
            href="/dashboard"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Dashboard home
          </a>
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
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      // Realm mutual exclusion: auditor accounts can NEVER load /dashboard/*.
      const { data: auditor } = await supabase
        .from("auditor_accounts")
        .select("id, status")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (auditor) {
        throw redirect({ to: "/audit-portal" });
      }

      let activeOrgId: string | null = null;
      try {
        activeOrgId = window.localStorage.getItem("hive.activeOrgId");
      } catch {
        /* ignore */
      }

      const { locked, isAdmin } = await orgDashboardIsLocked({
        userId: session.user.id,
        activeOrgId,
      });
      if (!locked) return;
      if (pathBypassesBillingLock(location.pathname, isAdmin)) return;
      throw redirect({ to: "/billing-locked" });
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error("dashboard beforeLoad error:", err);
      return; // fail open — client layout re-checks after hydrate
    }
  },
  component: DashboardLayout,
  errorComponent: DashboardShellError,
});

import type { Permission } from "@/lib/rbac";
type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm?: Permission;
  feature?: string;
  isLocked?: boolean;
};

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/schedule", label: "Schedule", icon: CalendarDays, feature: "evv_timesheets" },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/my-obligations", label: "My Compliance", icon: ClipboardList },
  {
    to: "/dashboard/my-historical-records",
    label: "Historical Records",
    icon: Archive,
    feature: "evv_timesheets",
  },
  {
    to: "/dashboard/my-time-corrections",
    label: "My Time Corrections",
    icon: Clock,
    feature: "evv_timesheets",
  },
  { to: "/dashboard/ask-nectar", label: "Nectar", icon: Sparkles, feature: "nectar" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/hub/employees", label: "Employees", icon: Users, feature: "staff_onboarding" },
  { to: "/dashboard/hub/clients", label: "Clients", icon: Contact2, feature: "client_intake" },
  { to: "/dashboard/scheduler", label: "Scheduler", icon: CalendarDays, feature: "evv_timesheets" },
  {
    to: "/dashboard/hub/documentation",
    label: "Documentation",
    icon: ClipboardCheck,
    feature: "pcsp",
  },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/company-obligations", label: "Compliance", icon: ClipboardList },
  { to: "/dashboard/summaries", label: "Summaries", icon: FileText },
  {
    to: "/dashboard/hub/finances",
    label: "Finances",
    icon: Receipt,
    perm: "view_billing",
    feature: "pba_ledgers",
  },
  {
    to: "/dashboard/hive-training",
    label: "Training",
    icon: GraduationCap,
  },
  {
    to: "/dashboard/state-audit",
    label: "State Audit",
    icon: ShieldCheck,
    feature: "state_audit",
    perm: "view_analytics",
  },
  { to: "/dashboard/reports", label: "Reports", icon: FileText, perm: "export_reports" },
  { to: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NECTAR_NAV: NavItem[] = [
  { to: "/dashboard/help", label: "Nectar", icon: HelpCircle, feature: "nectar" },
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
  complianceActionCount: number;
  complianceQueueLoading: boolean;
};

function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const {
    data: org,
    isLoading: orgLoading,
    isError: orgError,
    error: orgQueryError,
  } = useCurrentOrg();
  const { can } = usePermissions();
  const {
    view,
    hasStoredView,
    setView,
    stateCode,
    setStateCode,
    subView,
    setSubView,
    hydrated: viewHydrated,
  } = usePortalView();
  const [states, setStates] = useState<PlatformStateLite[]>([]);
  const { isExecutive, isLoading: execLoading } = useIsHiveExecutive();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);

  useEffect(() => {
    const openMenu = () => setMobileOpen(true);
    window.addEventListener(OPEN_DASHBOARD_MENU_EVENT, openMenu);
    return () => window.removeEventListener(OPEN_DASHBOARD_MENU_EVENT, openMenu);
  }, []);

  useEffect(() => {
    if (!mobileSearchOpen && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileSearchOpen(false);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileSearchOpen, mobileOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => setBootTimedOut(true), DASHBOARD_BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (
      dashboardShouldRedirectToLogin({
        sessionLoading: loading,
        hasSession: !!session,
        bootTimedOut,
      })
    ) {
      navigate({ to: "/login" });
    }
  }, [loading, session, bootTimedOut, navigate]);

  // Full-page loads skip beforeLoad on SSR. Re-check after hydrate so unpaid
  // companies cannot sit on the dashboard with only a banner.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    let activeOrgId: string | null = null;
    try {
      activeOrgId = window.localStorage.getItem("hive.activeOrgId");
    } catch {
      /* ignore */
    }
    orgDashboardIsLocked({ userId: uid, activeOrgId })
      .then(({ locked, isAdmin }) => {
        if (cancelled || !locked) return;
        if (pathBypassesBillingLock(pathname, isAdmin)) return;
        navigate({ to: "/billing-locked", replace: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, pathname, navigate]);

  // must_change_password is enforced globally at the router root
  // (MustChangePasswordGate in __root.tsx) — no per-layout check needed here.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("bc_role")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Behaviorists (bc_role set) route directly to their caseload — no time clock,
        // no staff caseload. Only redirect from the dashboard home, not from deep links.
        if (data?.bc_role && pathname === "/dashboard") {
          navigate({ to: "/dashboard/behaviorist", replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, pathname, navigate]);

  const role: Role = org?.role ?? "employee";
  const isCommitteeMember = role === "committee_member";
  const isAdminCapable =
    !isCommitteeMember &&
    (can("view_staff_records") ||
      role === "admin" ||
      role === "program_manager" ||
      role === "manager");

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
  if (isAdminCapable) {
    allowedViews.push("admin", "staff_mobile");
  }
  if (isExecutive) {
    allowedViews.push("hive_exec", "state_preview");
  }
  // Default admin-capable users (who haven't explicitly chosen a view) to the
  // admin portal, so a fresh admin lands on the admin Home + nav rather than the
  // empty staff caseload. An explicit choice (incl. Staff View) is preserved.
  const defaultView: PV = isAdminCapable ? "admin" : "staff";
  const resolvedView: PV = hasStoredView ? view : defaultView;
  const roleSignalsReady = !orgLoading && !execLoading;
  const rawView: PV =
    !roleSignalsReady && hasStoredView
      ? resolvedView
      : allowedViews.includes(resolvedView)
        ? resolvedView
        : "staff";
  const isMobilePreview = rawView === "staff_mobile";
  const isHiveExecView = rawView === "hive_exec";
  const isStatePreview = rawView === "state_preview";
  // HIVE Executive is its own context — never mixed with a company's admin/staff nav.
  const effectiveView: "staff" | "admin" | "hive_exec" = isHiveExecView
    ? "hive_exec"
    : isStatePreview
      ? subView === "staff"
        ? "staff"
        : "admin"
      : rawView === "admin"
        ? "admin"
        : "staff";
  const execNav: NavItem[] = EXEC_NAV as NavItem[];
  const COMMITTEE_NAV: NavItem[] = [
    { to: "/dashboard/hrc", label: "Human Rights Committee", icon: Scale, exact: true },
  ];
  const baseNav: NavItem[] = isCommitteeMember
    ? COMMITTEE_NAV
    : effectiveView === "hive_exec"
      ? execNav
      : effectiveView === "admin"
        ? ADMIN_NAV
        : STAFF_NAV;
  const { isEnabled: isFeatureOn } = useOrgFeatures();
  const nav: NavItem[] = baseNav
    .filter((n) => !n.perm || can(n.perm) || role === "admin")
    // Master-Controller gating: keep item visible; mark isLocked when feature is OFF.
    // Training stays visible without hive_training — Internal trainings replaced Policies.
    .map((n) => ({ ...n, isLocked: n.feature ? !isFeatureOn(n.feature) : false }));

  // Load states for the State portal dropdown (executives only).
  useEffect(() => {
    if (!isExecutive) return;
    let cancelled = false;
    supabase
      .from("platform_states")
      .select("code, name, status")
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setStates((data ?? []) as PlatformStateLite[]);
      });
    return () => {
      cancelled = true;
    };
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
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("portal-view");
    } catch {
      stored = null;
    }
    const wantExec = stored === "hive_exec";
    const wantState = stored === "state_preview";
    if (wantExec && !pathname.startsWith("/dashboard/hive-exec")) {
      navigate({ to: "/dashboard/hive-exec", replace: true });
    } else if (!wantExec && !wantState && pathname.startsWith("/dashboard/hive-exec")) {
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

  // Must stay above any conditional return — Rules of Hooks.
  // On Admin Home the queue/bell obligation bootstraps wait until the two
  // home queries settle so they do not starve a phone radio. Other routes
  // fetch immediately. Badge stays hidden while loading.
  const layoutReady = useYieldToAdminHomeQueries(
    org?.organization_id ?? null,
    isAdminCapable && isAdminHomePath(pathname),
  );
  const { totalCount: complianceActionCount, isLoading: complianceQueueLoading } =
    useActionRequiredQueue(isAdminCapable ? (org?.organization_id ?? null) : null, {
      enabled: layoutReady,
    });

  const currentPreviewState = isStatePreview
    ? (states.find((s) => s.code === stateCode) ?? null)
    : null;
  const isComingSoonPreview = isStatePreview && currentPreviewState?.status === "coming_soon";

  const signOut = async (to: "/" | "/login" = "/") => {
    writeSessionHint(false);
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to, replace: true });
  };

  useEffect(() => {
    writeSessionHint(!!session);
  }, [session]);

  const [bootstrapStuck, setBootstrapStuck] = useState(false);
  const [awsDbFailed, setAwsDbFailed] = useState(false);
  const [awsDbErrorMessage, setAwsDbErrorMessage] = useState<string | null>(null);
  const [failKind, setFailKind] = useState<BootstrapFailureKind | null>(null);
  const awaitingBootstrap = dashboardShellShowsLoading({
    sessionLoading: loading,
    hasSession: !!session,
    execLoading,
    hydrated: viewHydrated,
    orgLoading,
    bootTimedOut,
    sessionHint: readSessionHint(),
  });
  const cognitoLeaveLoading = shouldLeaveCognitoLoadingOverlay({
    isCognito: isCognitoAuth(),
    hasSession: Boolean(session) && !loading,
    awsDb5xx: awsDbFailed || failKind === "http-5xx",
    orgError,
    timedOut: bootstrapStuck,
    unhandledHttpError: failKind === "unhandled-httperror",
    html5xx: failKind === "html-500",
  });
  const bootstrapping = awaitingBootstrap && !cognitoLeaveLoading;

  useEffect(() => {
    if (!isCognitoAuth()) return;
    const onFail = (kind: BootstrapFailureKind, message?: string) => {
      setFailKind(kind);
      setAwsDbFailed(true);
      if (message) setAwsDbErrorMessage(message);
    };
    const onAwsDb = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string; status?: number }>).detail;
      onFail("http-5xx", detail?.message);
    };
    const onBootstrap = (e: Event) => {
      const detail = (e as CustomEvent<{ kind?: BootstrapFailureKind; message?: string }>).detail;
      onFail(detail?.kind ?? "http-5xx", detail?.message);
    };
    window.addEventListener(AWS_DB_ERROR_EVENT, onAwsDb);
    window.addEventListener(HIVE_BOOTSTRAP_ERROR_EVENT, onBootstrap);
    const stopWatch = installBootstrapFailureWatch((detail) => {
      onFail(detail.kind, detail.message);
    });
    return () => {
      window.removeEventListener(AWS_DB_ERROR_EVENT, onAwsDb);
      window.removeEventListener(HIVE_BOOTSTRAP_ERROR_EVENT, onBootstrap);
      stopWatch();
    };
  }, []);

  useEffect(() => {
    if (!isCognitoAuth()) return;
    if (!awaitingBootstrap) {
      setBootstrapStuck(false);
      return;
    }
    const t = window.setTimeout(() => setBootstrapStuck(true), 8_000);
    return () => window.clearTimeout(t);
  }, [awaitingBootstrap]);

  if (bootstrapping) {
    const cognitoEscape = isCognitoAuth() && (orgError || bootstrapStuck);
    const showSignOut = cognitoEscape || bootTimedOut;
    return (
      <div className="grid min-h-screen place-items-center gap-4 bg-background px-4 text-center text-sm text-muted-foreground">
        <p>{cognitoEscape ? "Couldn't finish signing you in." : "Loading workspace…"}</p>
        {cognitoEscape && (
          <p className="max-w-sm text-xs">
            {orgQueryError instanceof Error
              ? orgQueryError.message
              : "The workspace did not load. Sign out and enter your email and password."}
          </p>
        )}
        {showSignOut && (
          <Button
            data-testid="dashboard-spinner-sign-out"
            variant="outline"
            onClick={() => void signOut("/login")}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>
    );
  }

  const nectarNavForView =
    effectiveView === "admin"
      ? NECTAR_NAV.map((n) => ({ ...n, isLocked: n.feature ? !isFeatureOn(n.feature) : false }))
      : [];
  const allNav = [...nav, ...nectarNavForView];
  const lockedRouteItem = allNav
    .filter((n) => n.feature && n.isLocked)
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) =>
      n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
    );
  const pageTitle =
    allNav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ??
    "Dashboard";
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
    complianceActionCount,
    complianceQueueLoading,
  };

  return (
    <GuidedTourProvider>
      <DraftJobsProvider>
        <div className="flex h-screen h-[100dvh] flex-col overflow-hidden">
          <ImpersonationBanner />
          {isCognitoAuth() && (orgError || awsDbFailed) && (
            <div
              data-testid="cognito-bootstrap-error"
              className="shrink-0 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 md:px-6"
            >
              {awsDbErrorMessage ||
                (orgQueryError instanceof Error ? orgQueryError.message : null) ||
                "Some workspace data did not load. You can keep working with what is available, or sign out."}
            </div>
          )}

          {/* Mobile shell — staff view only (below md) */}
          {isStaffView && !isMobilePreview && (
            <StaffMobileShell title={pageTitle}>
              <Outlet />
            </StaffMobileShell>
          )}

          {/* Desktop layout (md+) — unchanged. Also used on mobile for Admin View. */}
          <div
            className={
              isStaffView && !isMobilePreview
                ? "hidden min-h-0 min-w-0 w-full flex-1 md:grid md:grid-cols-[260px_minmax(0,1fr)]"
                : "grid min-h-0 min-w-0 w-full flex-1 md:grid-cols-[260px_minmax(0,1fr)]"
            }
          >
            <aside className="hidden h-full flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
              <SidebarBody {...sidebarProps} />
            </aside>

            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <header
                className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hive-border)] bg-[var(--hive-canvas)] px-4 md:px-6 min-h-16"
                style={{
                  paddingTop: "env(safe-area-inset-top)",
                  paddingLeft: "max(1rem, env(safe-area-inset-left))",
                  paddingRight: "max(1rem, env(safe-area-inset-right))",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Staff phones use the avatar drawer. Keep this control out of
                  that tree so it is not a 0×0 ghost. Hive-exec + admin phones keep it. */}
                  {!(isStaffView && !isMobilePreview) && (
                    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="md:hidden shrink-0 border border-border bg-background"
                          aria-label="Open menu"
                        >
                          <Menu className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="left"
                        className="w-[280px] bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
                        onPointerDownOutside={preventSheetDismissForPortalViewMenu}
                        onFocusOutside={preventSheetDismissForPortalViewMenu}
                        onInteractOutside={preventSheetDismissForPortalViewMenu}
                      >
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <div className="flex h-full flex-col">
                          <SidebarBody {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold tracking-tight">{pageTitle}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                      {isHiveExecView ? (
                        "HIVE Platform · Executive Command Center"
                      ) : isStatePreview ? (
                        `State Build/Preview · ${currentPreviewState?.name ?? "—"} · ${subView === "admin" ? "Admin" : "Staff"} view`
                      ) : (
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
                      askRoute={effectiveView === "staff" ? "/dashboard/ask-nectar" : "/dashboard/help"}
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
                      className="grid h-11 w-11 place-items-center rounded-md border border-[var(--hive-border)] bg-[var(--hive-surface)] text-[var(--hive-text)] hover:bg-[var(--hive-bg)] md:hidden"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTaskCenterOpen(true)}
                    data-tour="nav.help"
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--hive-ink)] bg-[var(--hive-ink)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#35475a]"
                    title="Open Nectar"
                  >
                    <ListChecks className="h-3.5 w-3.5" />{" "}
                    <span className="hidden md:inline">Nectar</span>
                  </button>
                  {isAdminCapable && effectiveView === "admin" && <DraftJobsHeaderPill />}
                  {isAdminCapable && effectiveView === "admin" && (
                    <NotificationBell deadlinesEnabled={layoutReady} />
                  )}
                  <Button onClick={signOut} variant="ghost" size="sm" className="md:hidden">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </header>
              {/* Collapsed-by-default NECTAR ask bar on phones — expands from the
              header icon; the desktop inline bar is unchanged. */}
              {mobileSearchOpen && !isHiveExecView && (
                <div className="border-b border-[var(--hive-border)] bg-[var(--hive-sidebar)] px-4 py-2 md:hidden">
                  <NectarSearchBar
                    nav={allNav.map((n) => ({ to: n.to, label: n.label }))}
                    isAdminCapable={isAdminCapable && effectiveView === "admin"}
                    variant="mobile"
                    askRoute={effectiveView === "staff" ? "/dashboard/ask-nectar" : "/dashboard/help"}
                  />
                </div>
              )}
              <NectarTaskCenter
                open={taskCenterOpen}
                onOpenChange={setTaskCenterOpen}
                surface={effectiveView === "staff" ? "staff" : "admin"}
              />
              {!isHiveExecView && !isStatePreview && <DemoOrgBanner />}

              {isStatePreview && (
                <div className="flex items-center justify-between gap-3 border-b border-[var(--hive-gold)]/30 bg-[var(--hive-gold)]/[0.08] px-4 py-2 text-xs md:px-6">
                  <div className="flex items-center gap-2 text-[#9a3412]">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="font-semibold uppercase tracking-wider">
                      State Build/Preview
                    </span>
                    <span className="text-[#9a3412]/80">
                      {currentPreviewState?.name ?? "No state selected"} ·{" "}
                      {subView === "admin" ? "Admin view" : "Staff view"} · template/sample data,
                      not live company records
                    </span>
                  </div>
                  {currentPreviewState && (
                    <Link
                      to="/dashboard/hive-exec/states/$stateCode"
                      params={{ stateCode: currentPreviewState.code }}
                      className="hidden md:inline-flex items-center gap-1 rounded-md border border-[var(--hive-gold)]/40 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#9a3412] hover:bg-white"
                    >
                      Edit template
                    </Link>
                  )}
                </div>
              )}

              {isAdminCapable && effectiveView === "admin" && org?.organization_id && (
                <BillingBanner organizationId={org.organization_id} isAdmin />
              )}

              <main
                className={
                  isMobilePreview
                    ? "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--hive-canvas)]"
                    : "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--hive-canvas)] px-4 py-6 md:px-8"
                }
              >
                {isStatePreview && !stateCode ? (
                  <div className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
                    Select a state from the sidebar to load the platform configured as that state.
                  </div>
                ) : isComingSoonPreview ? (
                  <div className="mx-auto max-w-xl rounded-lg border border-dashed border-[var(--hive-gold)]/40 bg-[var(--hive-gold)]/[0.06] p-10 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-[var(--hive-gold)]" />
                    <h2 className="mt-3 text-lg font-semibold tracking-tight">
                      Coming soon for {currentPreviewState?.name}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      No template has been built for this state yet. Configure the state's skeleton
                      to enable the {subView === "admin" ? "admin" : "staff"} preview.
                    </p>
                    {currentPreviewState && (
                      <Link
                        to="/dashboard/hive-exec/states/$stateCode"
                        params={{ stateCode: currentPreviewState.code }}
                        className="mt-4 inline-flex items-center gap-1 rounded-md border border-[var(--hive-gold)]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#9a3412] hover:bg-[var(--hive-gold)]/10"
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
    </GuidedTourProvider>
  );
}

/**
 * Hoisted to module scope so it keeps a stable component identity across
 * re-renders of DashboardLayout. Defining it inside the parent caused React
 * to unmount/remount the entire sidebar on every parent render, which made
 * sidebar nav clicks fail intermittently.
 */
function CompanyClientsBridge({
  setView,
  onNavigate,
}: {
  setView: (v: PV) => void;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--hive-gold)]/40 bg-[var(--hive-gold)]/10 px-3 py-2 text-xs font-semibold text-[var(--hive-gold)] hover:bg-[var(--hive-gold)]/20"
      onClick={() => {
        // Switch to company Admin portal and open Clients — hive-exec
        // nav intentionally excludes PHI; this is the explicit bridge.
        setView("admin");
        onNavigate?.();
        window.setTimeout(() => {
          void navigate({ to: "/dashboard/hub/clients" });
        }, 50);
      }}
    >
      <Contact2 className="h-3.5 w-3.5" />
      Open company Clients
    </button>
  );
}

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
  complianceActionCount,
  complianceQueueLoading,
}: SidebarBodyProps) {
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | null>(null);
  // Domain sections in the Executive Command Center sidebar are collapsed by
  // default. The current route's domain auto-expands when the active domain
  // changes so the location stays visible; explicit user toggles persist while
  // the active domain stays the same.
  const initialActiveDomain =
    EXEC_DOMAINS.find((d) =>
      d.items.some((t) => (t.exact ? pathname === t.to : pathname.startsWith(t.to))),
    )?.id ?? null;
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(EXEC_DOMAINS.map((d) => [d.id, d.id !== initialActiveDomain])),
  );
  const lastActiveDomain = useRef<string | null>(initialActiveDomain);
  const toggleDomain = (id: string) => setCollapsedDomains((c) => ({ ...c, [id]: !c[id] }));
  const { capabilities: execCaps } = useExecCapabilities();
  const execCountFn = useServerFn(getPendingUpgradeRequestCount);
  const execPendingQ = useQuery({
    queryKey: ["hive-exec-upgrade-pending-count"],
    queryFn: () => execCountFn(),
    refetchInterval: 30_000,
    enabled: isHiveExecView,
  });
  const execBadges: Record<string, number> = {
    upgrade_requests_pending: execPendingQ.data?.count ?? 0,
  };
  const execVisibleDomains = EXEC_DOMAINS.map((d) => ({
    ...d,
    items: d.items.filter((i) => execCaps.includes(i.capability)),
  })).filter((d) => d.items.length > 0);

  const activeExecDomain = useMemo(() => {
    return (
      execVisibleDomains.find((d) =>
        d.items.some((t) => (t.exact ? pathname === t.to : pathname.startsWith(t.to))),
      )?.id ?? null
    );
  }, [pathname, execVisibleDomains]);

  useEffect(() => {
    if (!activeExecDomain) {
      lastActiveDomain.current = null;
      return;
    }
    if (activeExecDomain !== lastActiveDomain.current) {
      lastActiveDomain.current = activeExecDomain;
      setCollapsedDomains((c) => ({ ...c, [activeExecDomain]: false }));
    }
  }, [activeExecDomain]);
  return (
    <>
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <HiveWordmark markClassName="h-8 w-8" wordClassName="text-[1.35rem]" tone="chrome" />
      </div>

      {(isAdminCapable || isExecutive) && (
        <div className="border-b border-sidebar-border px-4 py-4">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            Portal View
          </label>
          <PortalViewSwitcher
            value={rawView}
            onChange={(v) => setView(v)}
            options={[
              { value: "staff", label: "Staff View" },
              ...(isAdminCapable
                ? [
                    { value: "admin" as const, label: "Admin View" },
                    { value: "staff_mobile" as const, label: "Staff Mobile (Preview)" },
                  ]
                : []),
              ...(isExecutive
                ? [
                    { value: "hive_exec" as const, label: "Executive Command Center" },
                    { value: "state_preview" as const, label: "State (Build/Preview)" },
                  ]
                : []),
            ]}
          />

          {isHiveExecView && isAdminCapable && (
            <CompanyClientsBridge setView={setView} onNavigate={onNavigate} />
          )}

          {isStatePreview && (
            <div className="mt-3 space-y-2 rounded-md border border-[var(--hive-gold)]/30 bg-[var(--hive-gold)]/[0.06] p-2">
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
                            {isActive
                              ? "Active"
                              : s.status === "coming_soon"
                                ? "Coming soon"
                                : "Inactive"}
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
                      ? "bg-[var(--hive-gold)] text-white"
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
                      ? "bg-[var(--hive-gold)] text-white"
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
                  className="block rounded-md border border-[var(--hive-gold)]/30 bg-sidebar px-2 py-1 text-center text-[11px] font-medium text-[var(--hive-gold)] hover:bg-[var(--hive-gold)]/10"
                >
                  Edit {currentPreviewState.name} template
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {isHiveExecView ? (
          <div className="space-y-3">
            <Link
              to={COMMAND_CENTER_ITEM.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === COMMAND_CENTER_ITEM.to
                  ? "hive-nav-active"
                  : "text-[var(--hive-chrome-text)]/75 hover:bg-[color-mix(in_srgb,white_10%,transparent)] hover:text-[var(--hive-chrome-text)]"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="flex-1">{COMMAND_CENTER_ITEM.label}</span>
            </Link>
            {execVisibleDomains.map((d) => {
              const isCollapsed = collapsedDomains[d.id] ?? false;
              return (
                <div key={d.id}>
                  <button
                    type="button"
                    onClick={() => toggleDomain(d.id)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:bg-sidebar-accent/50"
                    aria-expanded={!isCollapsed}
                  >
                    <span>{d.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </button>
                  {!isCollapsed && (
                    <div className="mt-0.5 space-y-0.5">
                      {d.items.map((t) => {
                        const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                        const Icon = t.icon;
                        const badgeCount = t.badgeKey ? (execBadges[t.badgeKey] ?? 0) : 0;
                        return (
                          <Link
                            key={t.to}
                            to={t.to}
                            onClick={onNavigate}
                            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                              active
                                ? "hive-nav-active"
                                : "text-[var(--hive-chrome-text)]/75 hover:bg-[color-mix(in_srgb,white_10%,transparent)] hover:text-[var(--hive-chrome-text)]"
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Icon className="h-4 w-4" /> {t.label}
                            </span>
                            {badgeCount > 0 && (
                              <span
                                className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white text-[var(--hive-text)]" : "bg-[var(--hive-gold)] text-white"}`}
                              >
                                {badgeCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            const slug = item.to.replace(/^\/dashboard\/?/, "") || "home";
            const isNectar = item.label === "Nectar";
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
                    ? "hive-nav-active"
                    : isNectar
                      ? "text-[var(--hive-chrome-text)] hover:bg-[color-mix(in_srgb,white_10%,transparent)]"
                      : "text-[var(--hive-chrome-text)]/75 hover:bg-[color-mix(in_srgb,white_10%,transparent)] hover:text-[var(--hive-chrome-text)]"
                }`}
              >
                <Icon
                  className="h-4 w-4"
                />
                <span className="flex-1">{item.label}</span>
                {item.to === "/dashboard/company-obligations" &&
                  !complianceQueueLoading &&
                  complianceActionCount > 0 && (
                    <span
                      aria-label={`${complianceActionCount} action required`}
                      className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                    >
                      {complianceActionCount > 99 ? "99+" : complianceActionCount}
                    </span>
                  )}
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
          })
        )}

        {showNectarCluster && (
          <div className="mt-5 border-t border-sidebar-border pt-5">
            <div className="mb-2.5 flex items-start gap-2.5 px-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center">
                <HiveMark className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <span className="text-sm font-bold tracking-wide text-[var(--hive-chrome-text)]">Nectar</span>
                <p className="text-[11px] leading-relaxed text-[var(--hive-chrome-text)]/55">
                  The brain. Tabs below feed it the data the rest of Hive reads from.
                </p>
              </div>
            </div>

            <div className="mx-1 space-y-0.5 rounded-xl border border-[color-mix(in_srgb,white_14%,transparent)] p-1.5">
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
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--hive-chrome-text)]/40 transition-colors hover:bg-[color-mix(in_srgb,white_10%,transparent)] hover:text-[var(--hive-chrome-text)]/60"
                    >
                      <Icon className="h-4 w-4" />
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
                        ? "hive-nav-active"
                        : "text-[var(--hive-chrome-text)]/75 hover:bg-[color-mix(in_srgb,white_10%,transparent)] hover:text-[var(--hive-chrome-text)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
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
          onOpenChange={(o) => {
            if (!o) setUpgradeFeatureKey(null);
          }}
        />
      )}

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 text-xs text-sidebar-foreground/60">
          <div className="font-medium text-sidebar-foreground">
            {user?.user_metadata?.full_name ?? user?.email}
          </div>
          <div className="mt-2">
            {isHiveExecView ? (
              <div className="flex items-center justify-between">
                <span className="truncate">HIVE Platform</span>
                <span className="ml-2 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  HIVE Exec
                </span>
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
