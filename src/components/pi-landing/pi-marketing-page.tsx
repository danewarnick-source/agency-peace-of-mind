import { useLayoutEffect } from "react";
import { Link } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
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
  PI_CELL_ICON_BARS,
  PI_CELL_ICON_DOLLAR,
} from "@/lib/pi-landing";

function CellIcon({ icon }: { icon: (typeof PI_WHAT_PI_DOES)[number]["icon"] }) {
  if (icon === "check") {
    return (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden>
        <path
          d="M3.2 8.6 6.6 12 13.8 4.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (icon === "bars") return PI_CELL_ICON_BARS;
  return PI_CELL_ICON_DOLLAR;
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
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("pi-html-landing");
    return () => root.classList.remove("pi-html-landing");
  }, []);

  return (
    <div className="pi-landing-root">
      <div className="grain" aria-hidden />
      <PiPublicHeader />
      <header className="wrap hero">
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
      </header>
      <div className="wrap strip">
        {PI_HERO_STATS.map((stat) => (
          <div className="st" key={stat.label}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <section id="why">
        <div className="wrap">
          <div className="sk">{PI_WHAT_IS_KICKER}</div>
          <div className="pi">
            <div className="pi-big">{PI_WHAT_IS_MARK}</div>
            <p>
              <b>{PI_WHAT_IS_LEAD}</b> {PI_WHAT_IS_BODY}
            </p>
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
              </div>
            ))}
          </div>
        </div>
      </section>
      <section>
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
                <Link className="btn s" to="/contact">
                  {PI_TALK_TO_US}
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
      <PiPublicFooter />
    </div>
  );
}
