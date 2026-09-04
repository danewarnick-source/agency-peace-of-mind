import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
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
import { completeClientSignOut } from "@/lib/client-sign-out";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { usePortalView } from "@/hooks/use-portal-view";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { toast } from "sonner";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { preventSheetDismissForPortalViewMenu } from "@/lib/portal-view-landing";

export function StaffTopBar({ title, framed = false }: { title: string; framed?: boolean }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView } = usePortalView();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const role: Role = org?.role ?? "employee";
  const isAdminCapable =
    can("edit_staff_records") ||
    role === "admin" ||
    role === "program_manager" ||
    role === "manager";

  const signOut = async () => {
    await completeClientSignOut(() => supabase.auth.signOut());
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff";

  const headerCls = framed
    ? "relative z-30 flex h-14 shrink-0 items-center border-b border-[color-mix(in_srgb,white_14%,var(--hive-sidebar))] bg-[var(--hive-sidebar)] px-3 text-[var(--hive-chrome-text)]"
    : "relative z-30 flex h-14 items-center border-b border-[color-mix(in_srgb,white_14%,var(--hive-sidebar))] bg-[var(--hive-sidebar)] px-3 text-[var(--hive-chrome-text)] md:hidden";

  return (
    <header
      data-staff-top-bar
      className={headerCls}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
      }}
    >
      <div className="flex h-14 w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-[#f3efe6]">
            <PiMark className="h-5 w-5" title="Provider Interface" />
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
    </header>
  );
}
