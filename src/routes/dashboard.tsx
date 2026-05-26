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
  LayoutDashboard, GraduationCap, Settings,
  LogOut, Users, Building2, Contact2, ClipboardCheck, ShieldAlert, ShieldCheck, Wallet, Pill, Menu, Clock, Home,
} from "lucide-react";
import { toast } from "sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Care Academy" }] }),
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Caseload", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/timeclock", label: "General Time Clock", icon: Clock },
  { to: "/dashboard/daily-logs", label: "Daily Logs", icon: ClipboardCheck },
  { to: "/dashboard/emar", label: "eMAR Pass", icon: Pill },
  { to: "/dashboard/courses", label: "My Trainings", icon: GraduationCap },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/compliance-desk", label: "EVV & Timesheet Control", icon: ShieldCheck },
  { to: "/dashboard/host-home-control", label: "🏡 Host Home Control", icon: Home },
  { to: "/dashboard/dspd-controls", label: "DSPD Controls", icon: ShieldCheck },
  { to: "/dashboard/emar", label: "eMAR Pass", icon: Pill },
  { to: "/dashboard/admin/emar-audit", label: "eMAR Audit", icon: ShieldAlert },
  { to: "/dashboard/pba-ledger", label: "PBA Trust Ledger", icon: Wallet },
  { to: "/dashboard/employees", label: "Employees", icon: Users },
  { to: "/dashboard/clients", label: "Clients", icon: Contact2 },
  { to: "/dashboard/teams", label: "Teams & Homes", icon: Building2 },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView } = usePortalView();
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
  const effectiveView = isAdminCapable ? view : "staff";
  const nav = effectiveView === "admin" ? ADMIN_NAV : STAFF_NAV;
  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };


  const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6 font-semibold">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </span>
        Care Academy
      </div>

      {isAdminCapable && (
        <div className="border-b border-sidebar-border px-4 py-4">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            Portal View
          </label>
          <Select value={effectiveView} onValueChange={(v) => setView(v as "staff" | "admin")}>
            <SelectTrigger className="w-full border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">
                <span className="inline-flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5" /> Staff View
                </span>
              </SelectItem>
              <SelectItem value="admin">
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Admin View
                </span>
              </SelectItem>
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

  return (
    <div className="flex min-h-screen flex-col">
      <ImpersonationBanner />

      <div className="grid flex-1 md:grid-cols-[260px_1fr]">
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
                  {nav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Dashboard"}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {org?.organization_name ?? "Workspace"} · {ROLE_LABEL[role]}
                </p>
              </div>
            </div>

            <Button onClick={signOut} variant="ghost" size="sm" className="md:hidden">
              <LogOut className="h-4 w-4" />
            </Button>
          </header>

          <main className="flex-1 bg-secondary/40 p-6 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
