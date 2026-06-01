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

  LogOut, Users, Building2, Contact2, ClipboardCheck, Wallet, Pill, Menu, Clock, CalendarDays, HelpCircle, Lock, CreditCard, Activity, LifeBuoy, Receipt,
} from "lucide-react";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffMobileShell } from "@/components/staff-mobile/staff-mobile-shell";
import { StaffMobilePreviewFrame } from "@/components/staff-mobile/staff-mobile-preview-frame";
import { CelebrationProvider } from "@/components/celebrations/celebration-provider";

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
  { to: "/dashboard/help", label: "Ask NECTAR", icon: HelpCircle },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
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

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const role: Role = org?.role ?? "employee";
  const isAdminCapable = can("manage_users") || role === "admin" || role === "manager" || role === "super_admin";
  const allowedViews: Array<"staff" | "admin" | "staff_mobile" | "hive_exec"> = ["staff"];
  if (isAdminCapable) { allowedViews.push("admin", "staff_mobile"); }
  if (isExecutive) { allowedViews.push("hive_exec"); }
  const rawView = allowedViews.includes(view as "staff" | "admin" | "staff_mobile" | "hive_exec")
    ? (view as "staff" | "admin" | "staff_mobile" | "hive_exec")
    : "staff";
  const isMobilePreview = rawView === "staff_mobile";
  const effectiveView: "staff" | "admin" = rawView === "admin" || rawView === "hive_exec" ? "admin" : "staff";
  const baseNav = effectiveView === "admin" ? ADMIN_NAV : STAFF_NAV;
  const nav: NavItem[] = baseNav.filter((n) => !n.perm || can(n.perm) || role === "admin" || role === "super_admin");
  const showExecSection = isExecutive && (rawView === "hive_exec" || rawView === "admin");
  const execNav: NavItem[] = [
    { to: "/dashboard/hive-exec", label: "Companies", icon: Building2, exact: true },
    { to: "/dashboard/hive-exec/plans", label: "Plans & Billing", icon: CreditCard },
    { to: "/dashboard/hive-exec/health", label: "Account Health", icon: Activity },
    { to: "/dashboard/hive-exec/tickets", label: "Support Queue", icon: LifeBuoy },
  ];

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
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
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

        {showExecSection && (
          <div className="mt-4 border-t border-sidebar-border pt-4">
            <div className="mb-1 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#fed7aa]">
              <Lock className="h-3 w-3" />
              <span>HIVE Executive</span>
            </div>
            <p className="mb-2 px-3 text-[10px] text-sidebar-foreground/50">
              Visible to HIVE executives only
            </p>
            {execNav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[#0f1b3d] text-white shadow-sm ring-1 ring-[#d97a1c]/40"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 text-xs text-sidebar-foreground/60">
          <div className="font-medium text-sidebar-foreground">{user?.user_metadata?.full_name ?? user?.email}</div>
          <div className="flex items-center justify-between">
            <span className="truncate">{org?.organization_name ?? "Your workspace"}</span>
            <span className="ml-2 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {ROLE_LABEL[role]}
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

  const allNav = showExecSection ? [...nav, ...execNav] : nav;
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
                  {org?.organization_name ?? "Workspace"} · {ROLE_LABEL[role]}
                </p>
              </div>
            </div>

            {isAdminCapable && effectiveView === "admin" && <NotificationBell />}
            <Button onClick={signOut} variant="ghost" size="sm" className="md:hidden">
              <LogOut className="h-4 w-4" />
            </Button>
          </header>

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
