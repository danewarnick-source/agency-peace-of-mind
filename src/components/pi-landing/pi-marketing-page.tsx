import { Link } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PiFeatureScroll } from "@/components/pi-landing/pi-feature-scroll";
import { PiHeroGlass } from "@/components/pi-landing/pi-hero-glass";
import { PiMark } from "@/components/pi-landing/pi-mark";
import {
  PI_CTA_BODY,
  PI_CTA_HEADLINE,
  PI_GET_STARTED,
  PI_HEADLINE,
  PI_HEADLINE_EMPHASIS,
  PI_HERO_FINE,
  PI_HERO_STATS,
  PI_KICKER,
  PI_LANDING_INCLUDED,
  PI_LEARN_MORE,
  PI_LIST_PRICE_DISPLAY,
  PI_LIST_PRICE_LEAD,
  PI_LIST_PRICE_UNIT,
  PI_NECTAR_AFTER_NOTE,
  PI_NECTAR_AFTER_QUOTE,
  PI_NECTAR_AFTER_TAG,
  PI_NECTAR_BEFORE_NOTE,
  PI_NECTAR_BEFORE_QUOTE,
  PI_NECTAR_BEFORE_TAG,
  PI_NECTAR_HEADLINE,
  PI_NECTAR_KICKER,
  PI_NECTAR_LABEL,
  PI_NECTAR_SUB,
  PI_PRICE_MIN_AND_TRAINING,
  PI_PRICING_KICKER,
  PI_SUBHEAD,
  PI_TALK_TO_US,
  PI_WHAT_DOES_HEADLINE,
  PI_WHAT_DOES_KICKER,
  PI_WHAT_IS_BODY,
  PI_WHAT_IS_KICKER,
  PI_WHAT_IS_LEAD,
  PI_WHAT_IS_MARK,
  PI_WHAT_PI_DOES,
} from "@/lib/pi-landing";

function CellIcon({ icon }: { icon: (typeof PI_WHAT_PI_DOES)[number]["icon"] }) {
  if (icon === "check") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 2.4 13.2 4.6v5.2L8 13.6 2.8 9.8V4.6L8 2.4Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M5.6 8.1 7.4 9.8 10.6 6.4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (icon === "bars") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.25" y="2.25" width="4.2" height="4.2" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.55" y="2.25" width="4.2" height="4.2" stroke="currentColor" strokeWidth="1.2" />
        <rect x="2.25" y="9.55" width="4.2" height="4.2" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.55" y="9.55" width="4.2" height="4.2" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8.7 4.8c-1.7 0-2.5.8-2.5 1.7 0 .9.7 1.3 2.2 1.6 1.6.3 2.4.8 2.4 1.8 0 1-.9 1.8-2.6 1.8-1.4 0-2.4-.5-2.7-1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M8 4.2v7.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function InclCheck() {
  return (
    <svg className="pi-check" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.2 7.2 5.4 10.3 11.8 3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PiMarketingPage() {
  return (
    <PiPublicPage>
      <header className="wrap hero">
        <div className="hero-copy">
          <PiMark variant="hero" width={60} height={60} className="hero-mark" />
          <div className="kick">
            <i aria-hidden />
            {PI_KICKER}
          </div>
          <h1>
            {PI_HEADLINE} <em>{PI_HEADLINE_EMPHASIS}</em>
          </h1>
          <p className="lede">{PI_SUBHEAD}</p>
          <div className="ctas">
            <Link className="btn p" to="/signup">
              {PI_GET_STARTED}
            </Link>
            <Link className="btn s" to="/contact">
              {PI_TALK_TO_US}
            </Link>
          </div>
          <div className="fine">{PI_HERO_FINE}</div>
        </div>
        <PiHeroGlass />
      </header>
      <div className="wrap strip">
        {PI_HERO_STATS.map((stat) => (
          <div className="st" key={stat.label}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <PiFeatureScroll />
      <section id="why">
        <div className="wrap">
          <div className="sk">{PI_WHAT_IS_KICKER}</div>
          <div className="pi">
            <div className="pi-mark-well">
              <PiMark variant="cream" width={88} height={88} className="pi-card-mark" />
              <div className="pi-big">{PI_WHAT_IS_MARK}</div>
            </div>
            <div>
              <p>
                <b>{PI_WHAT_IS_LEAD}</b> {PI_WHAT_IS_BODY}
              </p>
              <Link className="learn" to="/about">
                {PI_LEARN_MORE}
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="alt">
        <div className="wrap">
          <div className="sk">{PI_WHAT_DOES_KICKER}</div>
          <h2>{PI_WHAT_DOES_HEADLINE}</h2>
          <div className="three">
            {PI_WHAT_PI_DOES.map((cell) => (
              <div className="cell" key={cell.title}>
                <div className="ico">
                  <CellIcon icon={cell.icon} />
                </div>
                <h3>{cell.title}</h3>
                <p>{cell.body}</p>
                <ul>
                  {cell.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link className="learn" to="/about">
                  {PI_LEARN_MORE}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="nectar">
        <div className="wrap">
          <div className="sk">{PI_NECTAR_KICKER}</div>
          <h2>{PI_NECTAR_HEADLINE}</h2>
          <p className="sub">{PI_NECTAR_SUB}</p>
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
          <Link className="learn" to="/nectar">
            {PI_LEARN_MORE}
          </Link>
        </div>
      </section>
      <section className="alt" id="pricing">
        <div className="wrap">
          <div className="sk">{PI_PRICING_KICKER}</div>
          <h2>{PI_LIST_PRICE_LEAD}</h2>
          <div className="pricebox">
            <div>
              <div className="big">{PI_LIST_PRICE_DISPLAY}</div>
              <div className="per">{PI_LIST_PRICE_UNIT}</div>
              <div className="min">{PI_PRICE_MIN_AND_TRAINING}</div>
              <div className="ctas">
                <Link className="btn p" to="/signup">
                  {PI_GET_STARTED}
                </Link>
                <Link className="btn s" to="/pricing">
                  {PI_LEARN_MORE}
                </Link>
              </div>
            </div>
            <ul className="incl">
              {PI_LANDING_INCLUDED.map((row) => (
                <li key={row.title}>
                  <InclCheck />
                  <div>
                    {row.title}
                    <small>{row.body}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="cta">
        <div className="wrap">
          <h2>{PI_CTA_HEADLINE}</h2>
          <p className="sub">{PI_CTA_BODY}</p>
          <Link className="btn p" to="/signup">
            {PI_GET_STARTED}
          </Link>
        </div>
      </section>
    </PiPublicPage>
  );
}
