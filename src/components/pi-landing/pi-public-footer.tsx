import { Link } from "@tanstack/react-router";
import { PiBrandLockup } from "@/components/pi-landing/pi-mark";
import { PI_COPYRIGHT, PI_FOOTER_LINKS } from "@/lib/pi-landing";

export function PiPublicFooter() {
  return (
    <footer className="pi-pub-foot">
      <div className="wrap foot">
        <PiBrandLockup markSize={18} />
        <div className="links">
          {PI_FOOTER_LINKS.map((item) =>
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
        <div>{PI_COPYRIGHT}</div>
      </div>
    </footer>
  );
}
