import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PiBrandLockup, PiHomeLockup } from "@/components/pi-landing/pi-mark";
import { PublicMobileMenuButton } from "@/components/landing/public-mobile-menu-button";
import { PI_HOME_NAV } from "@/lib/pi-homepage";
import { PI_NAV_LINKS, PI_SIGN_IN } from "@/lib/pi-landing";
import { LANDING_MOBILE_NAV_ID } from "@/lib/public-landing-nav";

export function PiPublicHeader({ home = false }: { home?: boolean }) {
  const [open, setOpen] = useState(false);
  const links = home ? PI_HOME_NAV : PI_NAV_LINKS;

  return (
    <nav className={home ? "pi-pub-nav pi-home-nav" : "pi-pub-nav"}>
      <div className="wrap nav">
        {home ? <PiHomeLockup markSize={30} /> : <PiBrandLockup markSize={26} />}
        <div className="nlinks">
          {links.map((item) =>
            "hash" in item && item.hash ? (
              <Link key={item.label} to={item.to} hash={item.hash}>
                {item.label}
              </Link>
            ) : (
              <Link key={item.label} to={item.to}>
                {item.label}
              </Link>
            ),
          )}
        </div>
        <div className="nav-end">
          <Link className={home ? "pi-home-btn cream sm" : "btn p sm"} to="/login">
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
              <Link key={item.label} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ),
          )}
          <Link to="/login" onClick={() => setOpen(false)}>
            {PI_SIGN_IN}
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
