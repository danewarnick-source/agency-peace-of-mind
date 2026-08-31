import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Hexagon, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { PortalViewSwitcher } from "@/components/portal-view-switcher";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { usePortalView } from "@/hooks/use-portal-view";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { toast } from "sonner";
import { NectarSearchBar } from "@/components/nectar/nectar-search-bar";
import { preventSheetDismissForPortalViewMenu } from "@/lib/portal-view-landing";

export function StaffTopBar({ title, framed = false }: { title: string; framed?: boolean }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView } = usePortalView();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Caseload already has an in-flow "Search by name" field. A second search in
  // this chrome stays on screen and covers client names as the list scrolls.
  const isCaseloadHome = pathname === "/dashboard" || pathname === "/dashboard/";

  const role: Role = org?.role ?? "employee";
  const isAdminCapable =
    can("edit_staff_records") ||
    role === "admin" ||
    role === "program_manager" ||
    role === "manager";

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff";

  const headerCls = framed
    ? "relative z-30 flex shrink-0 flex-col border-b border-[color-mix(in_srgb,white_14%,var(--hive-sidebar))] bg-[var(--hive-sidebar)] px-3 text-[var(--hive-chrome-text)]"
    : "relative z-30 flex flex-col border-b border-[color-mix(in_srgb,white_14%,var(--hive-sidebar))] bg-[var(--hive-sidebar)] px-3 text-[var(--hive-chrome-text)] md:hidden";

  return (
    <header
      className={headerCls}
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex h-14 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] shadow-[0_0_0_1px_rgba(244,169,58,0.08)_inset]">
            <Hexagon className="h-4 w-4 text-[var(--hive-gold)]" strokeWidth={2.5} />
          </span>
          <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Open profile menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white active:scale-95"
            >
              <User className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-t border-white/10 bg-[#141a3d] p-5 text-white [&>button]:text-white"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            onPointerDownOutside={preventSheetDismissForPortalViewMenu}
            onFocusOutside={preventSheetDismissForPortalViewMenu}
            onInteractOutside={preventSheetDismissForPortalViewMenu}
          >
            <SheetHeader className="text-left">
              <SheetTitle className="text-white">{displayName}</SheetTitle>
              <SheetDescription className="text-white/80">
                {(org?.organization_name ?? "Workspace") + " · " + ROLE_LABEL[role]}
              </SheetDescription>
            </SheetHeader>

            {isAdminCapable && (
              <div className="mt-5">
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/80">
                  Portal View
                </label>
                <PortalViewSwitcher
                  value={view === "hive_exec" || view === "state_preview" ? "staff" : view}
                  onChange={(v) => setView(v)}
                  triggerClassName="h-12 border-white/15 bg-white/[0.06] text-white"
                  options={[
                    { value: "staff", label: "Staff View" },
                    { value: "admin", label: "Admin View" },
                    { value: "staff_mobile", label: "Staff Mobile (Preview)" },
                  ]}
                />
              </div>
            )}

            <Button
              onClick={signOut}
              variant="ghost"
              className="mt-5 h-12 w-full justify-start border border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </SheetContent>
        </Sheet>
      </div>

      {!isCaseloadHome && (
        <div className="pb-2">
          <NectarSearchBar
            nav={[]}
            isAdminCapable={isAdminCapable}
            variant="mobile"
            askRoute="/dashboard/ask-nectar"
          />
        </div>
      )}
    </header>
  );
}
