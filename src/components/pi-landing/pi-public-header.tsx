import { Link } from "@tanstack/react-router";
import { PiBrandLockup } from "@/components/pi-landing/pi-mark";
import { PI_NAV_LINKS, PI_SIGN_IN } from "@/lib/pi-landing";

export function PiPublicHeader() {
  return (
    <nav className="pi-pub-nav">
      <div className="wrap nav">
        <PiBrandLockup markSize={26} />
        <div className="nlinks">
          {PI_NAV_LINKS.map((item) =>
            "to" in item && item.to ? (
              <Link key={item.label} to={item.to}>
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href}>
                {item.label}
              </a>
            ),
          )}
        </div>
        <Link className="btn p sm" to="/login">
          {PI_SIGN_IN}
        </Link>
      </div>
    </nav>
  );
}
