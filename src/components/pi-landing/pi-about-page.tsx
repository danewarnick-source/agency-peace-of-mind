import { Link } from "@tanstack/react-router";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import {
  PI_ABOUT_PAGE_BODY,
  PI_ABOUT_PAGE_HEADLINE,
  PI_ABOUT_PAGE_KICKER,
  PI_ABOUT_PAGE_LEAD,
  PI_GET_STARTED,
  PI_TALK_TO_US,
  PI_WHAT_IS_MARK,
} from "@/lib/pi-landing";

export function PiAboutPage() {
  return (
    <PiPublicPage>
      <main className="wrap page">
        <div className="sk">{PI_ABOUT_PAGE_KICKER}</div>
        <h1>{PI_ABOUT_PAGE_HEADLINE}</h1>
        <p className="lede">{PI_ABOUT_PAGE_LEAD}</p>
        <div className="pi" style={{ marginTop: 36 }}>
          <div className="pi-mark-well">
            <PiMark variant="cream" width={88} height={88} className="pi-card-mark" />
            <span className="sr-only">{PI_WHAT_IS_MARK}</span>
          </div>
          <div className="page-copy" style={{ marginTop: 0 }}>
            {PI_ABOUT_PAGE_BODY.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
        </div>
        <div className="ctas" style={{ marginTop: 36, justifyContent: "flex-start" }}>
          <Link className="btn p" to="/signup">
            {PI_GET_STARTED}
          </Link>
          <Link className="btn s" to="/contact">
            {PI_TALK_TO_US}
          </Link>
        </div>
      </main>
    </PiPublicPage>
  );
}
