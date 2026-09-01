/**
 * Shared chrome for /demo* marketing previews.
 * Uses locked --hive-* tokens. Does not wrap the live `/` homepage.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { HexBackdrop as HexBg } from "@/components/brand/hex-backdrop";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import {
  PUBLIC_MARKETING_NAV_CLASS,
  PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE,
} from "@/lib/public-landing-nav";

export const DEMO_MOBILE_NAV_ID = "demo-landing-mobile-nav";

export function DemoHoneycomb({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <HexBg opacity={0.12} />
    </div>
  );
}

export type DemoNavLink = {
  href: string;
  label: string;
};

export function DemoLandingHeader({ links }: { links: readonly DemoNavLink[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className={PUBLIC_MARKETING_NAV_CLASS} style={PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE}>
      <div className="relative z-10 mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HiveWordmark to="/" tone="canvas" />

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">Get a walkthrough</Link>
          </Button>
        </div>

        <PublicMobileMenuButton
          open={mobileOpen}
          onToggle={() => setMobileOpen((open) => !open)}
          controlsId={DEMO_MOBILE_NAV_ID}
        />
      </div>

      {mobileOpen ? (
        <div
          id={DEMO_MOBILE_NAV_ID}
          className="relative z-10 border-t border-[var(--hive-border)] bg-[var(--hive-bg)] md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--hive-surface)]"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link to="/signup">Get a walkthrough</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

export function DemoSteelCta({ heading, children }: { heading: string; children?: string }) {
  return (
    <section className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]">
      <DemoHoneycomb />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">{heading}</h2>
        {children ? (
          <p className="max-w-xl text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
            {children}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">
              Get a walkthrough <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghostOnDark">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function DemoPageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--hive-bg)] text-[var(--hive-text)]">{children}</div>;
}
