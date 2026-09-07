import { Link } from "@tanstack/react-router";
import {
  PI_FEATURE_HIGHLIGHTS,
  PI_HIGHLIGHTS_HEADLINE,
  PI_HIGHLIGHTS_KICKER,
  PI_LEARN_MORE,
} from "@/lib/pi-landing";

function CheckDot({ done }: { done: boolean }) {
  return <span className={done ? "pi-hl-dot done" : "pi-hl-dot"} aria-hidden />;
}

export function PiFeatureScroll() {
  return (
    <section className="pi-highlights-sec" aria-labelledby="pi-highlights-heading">
      <div className="wrap">
        <div className="sk">{PI_HIGHLIGHTS_KICKER}</div>
        <h2 id="pi-highlights-heading">{PI_HIGHLIGHTS_HEADLINE}</h2>
      </div>
      <div className="pi-highlights" role="region" aria-label="Feature highlights">
        <div className="pi-highlights-track">
          {PI_FEATURE_HIGHLIGHTS.map((card) => (
            <article key={card.id} className={card.price ? "pi-hl-card price" : "pi-hl-card"}>
              <div className="pi-hl-kicker">{card.kicker}</div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              {card.checks.length > 0 ? (
                <ul className="pi-hl-checks">
                  {card.checks.map((row) => (
                    <li key={row.label}>
                      <CheckDot done={row.done} />
                      {row.label}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="learn" to={card.to}>
                {PI_LEARN_MORE}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
