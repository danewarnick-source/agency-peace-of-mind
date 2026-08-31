import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import {
  LANDING_MOBILE_NAV_ID,
  PUBLIC_MARKETING_NAV_CLASS,
  PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE,
} from "@/lib/public-landing-nav";

const NAV_LINKS = [
  ["#nectar", "Nectar"],
  ["#compliance", "Compliance"],
  ["#documentation", "Documentation"],
  ["#scheduler", "Scheduler"],
] as const;

export function PublicLandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className={PUBLIC_MARKETING_NAV_CLASS} style={PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE}>
      <div className="relative z-10 mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HiveWordmark to="/" tone="canvas" />

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]"
            >
              {label}
            </a>
          ))}
          <Link to="/pricing" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
            Pricing
          </Link>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">Get started</Link>
          </Button>
        </div>

        <PublicMobileMenuButton
          open={mobileOpen}
          onToggle={() => setMobileOpen((open) => !open)}
          controlsId={LANDING_MOBILE_NAV_ID}
        />
      </div>

      {mobileOpen ? (
        <div
          id={LANDING_MOBILE_NAV_ID}
          className="relative z-10 border-t border-[var(--hive-border)] bg-[var(--hive-bg)] md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--hive-surface)]"
              >
                {label}
              </a>
            ))}
            <Link
              to="/pricing"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--hive-surface)]"
            >
              Pricing
            </Link>
            <div className="mt-2 flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link to="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
