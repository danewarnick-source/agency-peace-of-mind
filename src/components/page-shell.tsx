import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared dashboard page chrome: title/subtitle/actions row + a consistent
 * max-width content area. Every admin dashboard page (Home, Employees,
 * Scheduler, Documentation, ...) renders through this so padding, gaps,
 * and typography stay identical across pages. The persistent dark header
 * above (dashboard.tsx) already shows a nav-context title — this is the
 * content area's own heading, same pattern StaffPageHeader already uses
 * on staff pages.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-6", className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Router defaultPendingComponent — shown in place of stale Outlet content
 * once a navigation stays pending past defaultPendingMs. Shaped like
 * PageShell so it doesn't jump when the real content lands.
 */
export function PageShellSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
