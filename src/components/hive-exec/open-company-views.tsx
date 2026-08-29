import { Building2, GraduationCap } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePortalView } from "@/hooks/use-portal-view";
import {
  companyAdminSwitchAccessibleName,
  isCompanyAdminRole,
  STAFF_VIEW_ACCESSIBLE_NAME,
} from "@/lib/portal-view-landing";

/**
 * Visible escape hatch off Command Center onto the company portal.
 * Uses the same setView() path as the sidebar Portal View picker.
 * Company name only — never client names or other PHI.
 */
export function OpenCompanyViews({
  compact = false,
  tone = "light",
}: {
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const { setView } = usePortalView();
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();

  if (!org?.organization_id) return null;

  const isAdminCapable = isCompanyAdminRole(org.role);
  const adminName = companyAdminSwitchAccessibleName(org.organization_name);

  const go = (view: "admin" | "staff") => {
    setView(view);
    void navigate({ to: "/dashboard" });
  };

  const btn = compact
    ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold"
    : "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold";
  const staffCls =
    tone === "dark"
      ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
      : "border-border bg-background text-foreground hover:bg-muted";

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "w-full"}`}>
      {isAdminCapable && (
        <button
          type="button"
          aria-label={adminName}
          className={`${btn} border-[#f4a93a]/50 bg-[#f4a93a] text-[#1a1208] hover:brightness-105`}
          onClick={() => go("admin")}
        >
          <Building2 className="h-3.5 w-3.5" />
          {adminName}
        </button>
      )}
      <button
        type="button"
        aria-label={STAFF_VIEW_ACCESSIBLE_NAME}
        className={`${btn} ${staffCls}`}
        onClick={() => go("staff")}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        {STAFF_VIEW_ACCESSIBLE_NAME}
      </button>
    </div>
  );
}
