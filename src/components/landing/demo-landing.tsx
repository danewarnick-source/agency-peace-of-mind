/**
 * Shared chrome for /demo* marketing previews.
 * Mirrors live hivecertify.com tokens and rhythm. Does not wrap `/`.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { HexBackdrop as HexBg } from "@/components/brand/hex-backdrop";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import { FrameNectarOnTheWork } from "@/components/landing/product-frames";
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
          <Link
            to="/pricing"
            className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]"
          >
            Pricing
          </Link>
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
                <Link to="/signup">Get a walkthrough</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

/** Live Nectar band: steel canvas, gold pill, copy left, product frame right. */
export function DemoSteelFeature({
  id = "nectar",
  heading,
  children,
}: {
  id?: string;
  heading: string;
  children: string;
}) {
  return (
    <section
      id={id}
      className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]"
    >
      <DemoHoneycomb />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-24">
        <div className="lg:col-span-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hive-gold)]/30 bg-[color-mix(in_srgb,var(--hive-gold)_12%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
            Nectar
          </span>
          <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
            {children}
          </p>
        </div>
        <div className="lg:col-span-7">
          <FrameNectarOnTheWork />
        </div>
      </div>
    </section>
  );
}

const DEMO_FAQ = [
  {
    q: "What is Nectar?",
    a: "Nectar is Hive’s intelligence layer. It reviews notes, drafts monthly and quarterly summaries from records already in Hive, and answers questions in plain English. A person still attests. It does not invent documentation.",
  },
  {
    q: "Who is this for?",
    a: "Utah agencies that support people with disabilities — especially newer providers who want hours, notes, and incidents in one place instead of a stack of apps and spreadsheets.",
  },
  {
    q: "How does pricing work?",
    a: "See the pricing page. Implementation is a conversation.",
  },
] as const;

export function DemoFaq({ heading = "A few plain questions." }: { heading?: string }) {
  return (
    <section id="faq" className="bg-[var(--hive-bg)] py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
            FAQ
          </span>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {heading}
          </h2>
        </div>
        <Accordion
          type="single"
          collapsible
          className="mt-10 divide-y divide-[var(--hive-border)] rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] px-6 shadow-[var(--shadow-soft)]"
        >
          {DEMO_FAQ.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`} className="border-0">
              <AccordionTrigger className="py-5 text-left font-display text-base font-semibold hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-[var(--hive-text-muted)]">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/** Live closing CTA: light canvas, dark headline, gold + outline buttons. */
export function DemoClosingCta({ heading }: { heading: string }) {
  return (
    <section className="relative overflow-hidden bg-[var(--hive-canvas)]">
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--hive-text)] sm:text-5xl">
          {heading}
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">
              Get a walkthrough <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
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
