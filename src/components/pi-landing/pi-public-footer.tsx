import { Link } from "@tanstack/react-router";
import { PiHomeLockup } from "@/components/pi-landing/pi-mark";
import { PI_HOME_FOOTER_HCBS, PI_HOME_FOOTER_LINKS } from "@/lib/pi-homepage";
import { PI_COPYRIGHT } from "@/lib/pi-landing";

export function PiPublicFooter({ home: _home = false }: { home?: boolean }) {
  return (
    <footer className="pi-pub-foot pi-home-foot">
      <div className="wrap">
        <div className="pi-home-foot-row">
          <PiHomeLockup markSize={30} />
          <p className="pi-home-foot-hcbs">{PI_HOME_FOOTER_HCBS}</p>
        </div>
        <div className="pi-home-foot-row">
          <div className="links">
            {PI_HOME_FOOTER_LINKS.map((item) => (
              <Link key={item.label} to={item.to} hash="">
                {item.label}
              </Link>
            ))}
          </div>
          <div>{PI_COPYRIGHT}</div>
        </div>
      </div>
    </footer>
  );
}
