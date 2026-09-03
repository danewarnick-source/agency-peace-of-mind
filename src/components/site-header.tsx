import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PiWordmark } from "@/components/pi-landing/pi-mark";
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
    { to: "/training", label: "Training" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <header className={`${PUBLIC_MARKETING_NAV_CLASS} w-full`} style={PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE}>
      <div className="relative z-10 mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <PiWordmark to="/" compact />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-[#f3efe6]/75 transition hover:text-[#f3efe6]"
              activeProps={{ className: "text-[#f3efe6] font-semibold" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            to="/login"
            className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#f3efe6]/75 hover:text-[#f3efe6]"
          >
            Sign in
          </Link>
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
          className="relative z-10 border-t border-white/[0.08] bg-[#0b1220] md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
