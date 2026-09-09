import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PiHomeLockup } from "@/components/pi-landing/pi-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import { PI_HOME_NAV, PI_PUBLIC_NAV } from "@/lib/pi-homepage";
import { PI_SIGN_IN } from "@/lib/pi-landing";
import { LANDING_MOBILE_NAV_ID } from "@/lib/public-landing-nav";

export function PiPublicHeader({ home = false }: { home?: boolean }) {
  const [open, setOpen] = useState(false);
  const links = home ? PI_HOME_NAV : PI_PUBLIC_NAV;

  return (
    <nav className="pi-pub-nav pi-home-nav">
      <div className="wrap nav">
        <PiHomeLockup markSize={30} />
        <div className="nlinks">
          {links.map((item) =>
            "hash" in item && item.hash ? (
              <Link key={item.label} to={item.to} hash={item.hash}>
                {item.label}
              </Link>
            ) : (
              <Link key={item.label} to={item.to} hash="">
                {item.label}
              </Link>
            ),
          )}
        </div>
        <div className="nav-end">
          <Link className="pi-home-btn cream sm" to="/login" hash="">
            {PI_SIGN_IN}
          </Link>
          <PublicMobileMenuButton
            open={open}
            onToggle={() => setOpen((current) => !current)}
            controlsId={LANDING_MOBILE_NAV_ID}
          />
        </div>
      </div>
      {open ? (
        <div id={LANDING_MOBILE_NAV_ID} className="pi-mobile-menu">
          {links.map((item) =>
            "hash" in item && item.hash ? (
              <Link
                key={item.label}
                to={item.to}
                hash={item.hash}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <Link key={item.label} to={item.to} hash="" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ),
          )}
          <Link to="/login" hash="" onClick={() => setOpen(false)}>
            {PI_SIGN_IN}
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
