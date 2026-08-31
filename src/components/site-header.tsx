import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import {
  PUBLIC_MARKETING_NAV_CLASS,
  PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE,
} from "@/lib/public-landing-nav";

const SITE_MOBILE_NAV_ID = "site-mobile-nav";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "Home" },
    { to: "/pricing", label: "Pricing" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <header className={`${PUBLIC_MARKETING_NAV_CLASS} w-full`} style={PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE}>
      <div className="relative z-10 mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HiveWordmark to="/" tone="canvas" />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-[var(--hive-text)] transition hover:text-[var(--hive-gold)]"
              activeProps={{ className: "text-[var(--hive-gold)] font-semibold" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">Get started</Link>
          </Button>
        </div>

        <PublicMobileMenuButton
          open={open}
          onToggle={() => setOpen((s) => !s)}
          controlsId={SITE_MOBILE_NAV_ID}
        />
      </div>

      {open && (
        <div
          id={SITE_MOBILE_NAV_ID}
          className="relative z-10 border-t border-[var(--hive-border)] bg-[var(--hive-bg)] md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium text-[var(--hive-text)] hover:bg-[var(--hive-surface)]"
              >
                {l.label}
              </Link>
            ))}
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
      )}
    </header>
  );
}
