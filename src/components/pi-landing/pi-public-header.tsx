import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PiBrandLockup } from "@/components/pi-landing/pi-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import { PI_NAV_LINKS, PI_SIGN_IN } from "@/lib/pi-landing";
import { LANDING_MOBILE_NAV_ID } from "@/lib/public-landing-nav";

export function PiPublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="pi-pub-nav">
      <div className="wrap nav">
        <PiBrandLockup markSize={26} />
        <div className="nlinks">
          {PI_NAV_LINKS.map((item) => (
            <Link key={item.label} to={item.to}>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="nav-end">
          <Link className="btn p sm" to="/login">
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
          {PI_NAV_LINKS.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <Link to="/signup" onClick={() => setOpen(false)}>
            Get started
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
