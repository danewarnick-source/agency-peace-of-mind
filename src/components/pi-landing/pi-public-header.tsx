import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PiWordmark } from "@/components/pi-landing/pi-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import {
  LANDING_MOBILE_NAV_ID,
  PUBLIC_MARKETING_NAV_CLASS,
  PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE,
} from "@/lib/public-landing-nav";

const NAV = [
  { href: "/#why", label: "Why" },
  { href: "/pricing", label: "Pricing", to: "/pricing" as const },
] as const;

export function PiPublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <nav className={PUBLIC_MARKETING_NAV_CLASS} style={PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE}>
      <div className="relative z-10 mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <PiWordmark to="/" compact />

        <div className="hidden items-center gap-8 md:flex">
          {NAV.map((item) =>
            "to" in item && item.to ? (
              <Link
                key={item.label}
                to={item.to}
                className="text-sm font-medium text-[#f3efe6]/75 hover:text-[#f3efe6]"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-[#f3efe6]/75 hover:text-[#f3efe6]"
              >
                {item.label}
              </a>
            ),
          )}
          <Link
            to="/login"
            className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#f3efe6]/75 hover:text-[#f3efe6]"
          >
            Sign in
          </Link>
        </div>

        <PublicMobileMenuButton
          open={open}
          onToggle={() => setOpen((v) => !v)}
          controlsId={LANDING_MOBILE_NAV_ID}
        />
      </div>

      {open ? (
        <div
          id={LANDING_MOBILE_NAV_ID}
          className="relative z-10 border-t border-white/[0.08] bg-[#0b1220] md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {NAV.map((item) =>
              "to" in item && item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
                >
                  {item.label}
                </a>
              ),
            )}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
            >
              Sign in
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
