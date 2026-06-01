import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Hexagon, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { usePortalView } from "@/hooks/use-portal-view";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { toast } from "sonner";

export function StaffTopBar({ title, framed = false }: { title: string; framed?: boolean }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const { view, setView } = usePortalView();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const role: Role = org?.role ?? "employee";
  const isAdminCapable =
    can("manage_users") || role === "admin" || role === "manager" || role === "super_admin";

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff";

  const headerCls = framed
    ? "relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d112b] px-3 text-white"
    : "sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#0d112b] px-3 text-white md:hidden";

  return (
    <header
      className={headerCls}
      style={framed ? undefined : { paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06]">
          <Hexagon className="h-4 w-4 text-[#f4a93a]" strokeWidth={2.5} />
        </span>
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            aria-label="Open profile menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white active:scale-95"
          >
            <User className="h-4 w-4" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-white/10 bg-[#141a3d] p-5 text-white [&>button]:text-white"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white">{displayName}</SheetTitle>
            <SheetDescription className="text-white/60">
              {(org?.organization_name ?? "Workspace") + " · " + ROLE_LABEL[role]}
            </SheetDescription>
          </SheetHeader>

          {isAdminCapable && (
            <div className="mt-5">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/55">
                Portal View
              </label>
              <Select value={view} onValueChange={(v) => setView(v as "staff" | "admin")}>
                <SelectTrigger className="h-12 w-full border-white/15 bg-white/[0.06] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff View</SelectItem>
                  <SelectItem value="admin">Admin View</SelectItem>
                </SelectContent>
              </Select>
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
    </header>
  );
}
