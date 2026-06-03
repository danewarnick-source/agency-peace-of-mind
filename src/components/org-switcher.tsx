import { Check, ChevronsUpDown, Building2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentOrg, useMyMemberships } from "@/hooks/use-org";
import { cn } from "@/lib/utils";

/**
 * Org switcher — lets users with memberships in more than one org choose
 * which workspace is currently active. Selection persists in localStorage
 * (see `useCurrentOrg`) so it survives reloads and stays stable across the
 * session. Demo / sandbox orgs (is_demo = true) get an unmistakable badge.
 */
export function OrgSwitcher({ className }: { className?: string }) {
  const { data: org, setActiveOrgId } = useCurrentOrg();
  const { data: memberships = [] } = useMyMemberships();

  if (!org) return null;

  // Single-org users: render a static label so the indicator is still visible.
  if (memberships.length <= 1) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5 text-xs",
          className,
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70" />
        <span className="truncate font-medium text-sidebar-foreground">
          {org.organization_name}
        </span>
        {org.is_demo && <DemoBadge />}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-auto w-full justify-between gap-2 rounded-md border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5 text-left text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">{org.organization_name}</span>
            {org.is_demo && <DemoBadge />}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => {
          const isActive = m.organization_id === org.organization_id;
          return (
            <DropdownMenuItem
              key={m.membership_id}
              onSelect={() => setActiveOrgId(m.organization_id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{m.organization_name}</span>
                {m.is_demo && <DemoBadge subtle />}
              </span>
              {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DemoBadge({ subtle = false }: { subtle?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider",
        subtle
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-amber-400 bg-amber-100 text-amber-900 shadow-sm",
      )}
      title="Sandbox / demo organization — no real records"
    >
      <FlaskConical className="h-2.5 w-2.5" />
      Demo
    </span>
  );
}

/**
 * Persistent banner shown across the dashboard when the active org is a
 * sandbox/demo workspace. Mirrors the State Build/Preview banner style.
 *
 * Reads directly from `useCurrentOrg()` — the same single source of truth
 * the `OrgSwitcher` uses — so the two can never disagree (no stale prop
 * pipeline). Renders a transparent height-placeholder while loading OR while
 * `is_demo` is unknown to prevent post-paint layout shift, and renders
 * nothing once a non-demo org is confirmed.
 */
export function DemoOrgBanner() {
  const { data: org, isLoading } = useCurrentOrg();
  // While loading, or before we have a definitive org, reserve the row but
  // show nothing — never default-on to the amber banner.
  if (isLoading || !org) {
    return <div className="h-8 border-b border-transparent" aria-hidden="true" />;
  }
  if (!org.is_demo) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-100/80 px-4 py-1.5 text-xs text-amber-900 md:px-6">
      <FlaskConical className="h-3.5 w-3.5" />
      <span className="font-semibold uppercase tracking-wider">Demo / Sandbox</span>
      <span className="text-amber-900/80">
        You are working inside <strong>{org.organization_name}</strong>. All records here are
        fabricated — not real client data.
      </span>
    </div>
  );
}
