import { Link } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import {
  PI_GET_STARTED,
  PI_LEARN_MORE,
  PI_NECTAR_AFTER_NOTE,
  PI_NECTAR_AFTER_QUOTE,
  PI_NECTAR_AFTER_TAG,
  PI_NECTAR_BEFORE_NOTE,
  PI_NECTAR_BEFORE_QUOTE,
  PI_NECTAR_BEFORE_TAG,
  PI_NECTAR_LABEL,
  PI_NECTAR_PAGE_BODY,
  PI_NECTAR_PAGE_HEADLINE,
  PI_NECTAR_PAGE_KICKER,
  PI_NECTAR_PAGE_LEAD,
} from "@/lib/pi-landing";

export function PiNectarPage() {
  return (
    <PiPublicPage>
      <main className="wrap page">
        <div className="sk">{PI_NECTAR_PAGE_KICKER}</div>
        <h1>{PI_NECTAR_PAGE_HEADLINE}</h1>
        <p className="lede">{PI_NECTAR_PAGE_LEAD}</p>
        <div className="page-copy">
          {PI_NECTAR_PAGE_BODY.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
        <div className="ex">
          <div className="card">
            <div className="tag no">{PI_NECTAR_BEFORE_TAG}</div>
            <q>{PI_NECTAR_BEFORE_QUOTE}</q>
            <div className="note">
              <b>{PI_NECTAR_LABEL}</b>
              {PI_NECTAR_BEFORE_NOTE}
            </div>
          </div>
          <div className="card yes">
            <div className="tag yes">{PI_NECTAR_AFTER_TAG}</div>
            <q>{PI_NECTAR_AFTER_QUOTE}</q>
            <div className="note">
              <b>{PI_NECTAR_LABEL}</b>
              {PI_NECTAR_AFTER_NOTE}
            </div>
          </div>
        </div>
        <div className="ctas" style={{ marginTop: 36, justifyContent: "flex-start" }}>
          <Link className="btn p" to="/signup">
            {PI_GET_STARTED}
          </Link>
          <Link className="btn s" to="/pricing">
            {PI_LEARN_MORE}
          </Link>
        </div>
      </main>
    </PiPublicPage>
  );
}
