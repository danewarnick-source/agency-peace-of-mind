import { Link } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PiHeroPhone } from "@/components/pi-landing/pi-hero-phone";
import { PiHomepageMark } from "@/components/pi-landing/pi-mark";
import {
  PI_HOME_ASK,
  PI_HOME_DSP_CAPTION,
  PI_HOME_EYEBROW,
  PI_HOME_FEATURES,
  PI_HOME_H1_BUILT,
  PI_HOME_H1_FOR,
  PI_HOME_H1_LEAD,
  PI_HOME_H1_MID,
  PI_HOME_H1_TAIL,
  PI_HOME_H1_TO,
  PI_HOME_HERO_FINE,
  PI_HOME_HOW_NECTAR,
  PI_HOME_PRICING_HEADLINE,
  PI_HOME_PRICING_KICKER,
  PI_HOME_PRICING_MIN,
  PI_HOME_PRICING_UNIT,
  PI_HOME_SEE_IT,
  PI_HOME_START_SIGNUP,
  PI_HOME_TRAINING_ROWS,
  PI_HOME_UTAH_LINE,
} from "@/lib/pi-homepage";
import {
  PI_LIST_PRICE_DISPLAY,
  PI_NECTAR_AFTER_NOTE,
  PI_NECTAR_AFTER_QUOTE,
  PI_NECTAR_AFTER_TAG,
  PI_NECTAR_BEFORE_NOTE,
  PI_NECTAR_BEFORE_QUOTE,
  PI_NECTAR_BEFORE_TAG,
  PI_NECTAR_LABEL,
  PI_SUBHEAD,
} from "@/lib/pi-landing";

function EmWord({ children }: { children: string }) {
  return <em className="pi-home-em">{children}</em>;
}

function NotesPanel() {
  return (
    <div className="pi-home-panel-stack">
      <div className="pi-home-note-card">
        <span className="pi-home-pill bad">{PI_NECTAR_BEFORE_TAG}</span>
        <q>{PI_NECTAR_BEFORE_QUOTE}</q>
        <p>
          <b>{PI_NECTAR_LABEL}</b>
          {PI_NECTAR_BEFORE_NOTE}
        </p>
      </div>
      <div className="pi-home-note-card yes">
        <span className="pi-home-pill ok">{PI_NECTAR_AFTER_TAG}</span>
        <q>{PI_NECTAR_AFTER_QUOTE}</q>
        <p>
          <b>{PI_NECTAR_LABEL}</b>
          {PI_NECTAR_AFTER_NOTE}
        </p>
      </div>
    </div>
  );
}

function AskPanel() {
  return (
    <div className="pi-home-ask">
      {PI_HOME_ASK.map((row) => (
        <div key={row.text} className={`pi-home-ask-row ${row.who}`}>
          <span>{row.who === "nectar" ? PI_NECTAR_LABEL : "You"}</span>
          <p>{row.text}</p>
        </div>
      ))}
    </div>
  );
}

function TrainingPanel() {
  return (
    <ul className="pi-home-train-list">
      {PI_HOME_TRAINING_ROWS.map((row) => (
        <li key={row.name}>
          <span>{row.name}</span>
          <span className={`pi-home-pill ${row.tone}`}>{row.state}</span>
        </li>
      ))}
    </ul>
  );
}

function FeaturePanel({ id }: { id: (typeof PI_HOME_FEATURES)[number]["id"] }) {
  if (id === "notes") return <NotesPanel />;
  if (id === "nectar") return <AskPanel />;
  return <TrainingPanel />;
}

export function PiMarketingPage() {
  return (
    <PiPublicPage home>
      <div className="pi-home-watermark" aria-hidden>
        <PiHomepageMark size={520} />
      </div>
      <div className="pi-home-atmosphere" aria-hidden>
        <div className="pi-home-glow pi-home-glow-blue" />
        <div className="pi-home-glow pi-home-glow-gold" />
        <div className="pi-home-glow pi-home-glow-deep" />
        <div className="pi-home-grid" />
        <div className="pi-home-orb pi-home-orb-1" />
        <div className="pi-home-orb pi-home-orb-2" />
        <div className="pi-home-orb pi-home-orb-3" />
      </div>

      <header className="pi-home-hero">
        <div className="pi-home-hero-copy">
          <p className="pi-home-eyebrow">{PI_HOME_EYEBROW}</p>
          <h1>
            {PI_HOME_H1_LEAD} <EmWord>{PI_HOME_H1_TO}</EmWord> {PI_HOME_H1_MID}
            <br />
            {PI_HOME_H1_BUILT} <EmWord>{PI_HOME_H1_FOR}</EmWord> {PI_HOME_H1_TAIL}
          </h1>
          <p className="pi-home-lede">{PI_SUBHEAD}</p>
          <div className="pi-home-ctas">
            <Link className="pi-home-btn gold" to="/contact">
              {PI_HOME_SEE_IT}
            </Link>
            <Link className="pi-home-btn ghost" to="/" hash="nectar">
              {PI_HOME_HOW_NECTAR}
            </Link>
          </div>
          <p className="pi-home-fine">{PI_HOME_HERO_FINE}</p>
        </div>
        <PiHeroPhone />
      </header>

      <section className="pi-home-mission" aria-labelledby="pi-home-mission-heading">
        <h2 id="pi-home-mission-heading">{PI_HOME_UTAH_LINE}</h2>
        <p>{PI_HOME_DSP_CAPTION}</p>
      </section>

      {PI_HOME_FEATURES.map((feature) => (
        <section
          key={feature.id}
          id={feature.id}
          className={feature.reverse ? "pi-home-feature reverse" : "pi-home-feature"}
        >
          <div className="pi-home-feature-copy">
            <p className="pi-home-kicker">{feature.kicker}</p>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </div>
          <div className="pi-home-feature-panel">
            <FeaturePanel id={feature.id} />
          </div>
        </section>
      ))}

      <section id="pricing" className="pi-home-pricing">
        <p className="pi-home-kicker">{PI_HOME_PRICING_KICKER}</p>
        <h2>{PI_HOME_PRICING_HEADLINE}</h2>
        <div className="pi-home-price-card">
          <strong>{PI_LIST_PRICE_DISPLAY}</strong>
          <span>{PI_HOME_PRICING_UNIT}</span>
          <p>{PI_HOME_PRICING_MIN}</p>
          <Link className="pi-home-btn gold" to="/signup">
            {PI_HOME_START_SIGNUP}
          </Link>
        </div>
      </section>
    </PiPublicPage>
  );
}
