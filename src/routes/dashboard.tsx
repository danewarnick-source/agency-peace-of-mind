import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type Permission, type Role } from "@/lib/rbac";
import {
  LayoutDashboard, GraduationCap, BadgeCheck, FileBarChart, CreditCard,
  Users, BookOpen, Settings, LogOut, UserCog, Building2, ShieldCheck, Mail,
  Layers, FileCheck2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Care Academy" }] }),
  component: DashboardLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm?: Permission;
  roles?: Role[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/super-admin", label: "Platform", icon: Building2, roles: ["super_admin"] },
  { to: "/dashboard/training", label: "My Training", icon: GraduationCap, perm: "view_own_training" },
  { to: "/dashboard/programs", label: "Programs", icon: Layers, perm: "view_own_training" },
  { to: "/dashboard/programs-admin", label: "Manage Programs", icon: Layers, perm: "manage_programs" },
  { to: "/dashboard/courses", label: "Course Library", icon: BookOpen, perm: "view_own_training" },
  { to: "/dashboard/external-certifications", label: "External Certs", icon: FileCheck2, perm: "upload_external_certs" },
  { to: "/dashboard/certifications", label: "Certifications", icon: BadgeCheck, perm: "view_certifications" },
  { to: "/dashboard/employees", label: "Employees", icon: Users, perm: "manage_users" },
  { to: "/dashboard/invitations", label: "Invitations", icon: Mail, perm: "invite_users" },
  { to: "/dashboard/roles", label: "Roles", icon: UserCog, perm: "manage_roles" },
  { to: "/dashboard/permissions", label: "Permissions", icon: ShieldCheck, perm: "manage_roles" },
  { to: "/dashboard/team", label: "My Team", icon: UserCog, roles: ["admin", "manager", "super_admin"] },
  { to: "/dashboard/reports", label: "Reports", icon: FileBarChart, perm: "export_reports" },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard, perm: "view_billing" },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];


function DashboardLayout() {
  const { session, loading, user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const role: Role = org?.role ?? "employee";
  const visible = NAV.filter((n) => {
    if (n.roles && !n.roles.includes(role)) return false;
    if (n.perm && !can(n.perm)) return false;
    return true;
  });


  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
      <aside className="hidden flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </span>
          Care Academy
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visible.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
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
              <span className="ml-2 rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wider">{ROLE_LABEL[role]}</span>
            </div>
          </div>
          <Button onClick={signOut} variant="outline" size="sm" className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {visible.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground">{org?.organization_name ?? "Workspace"} · {ROLE_LABEL[role]}</p>
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
  );
}
