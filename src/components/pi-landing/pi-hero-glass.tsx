import {
  PI_LIST_PRICE_DISPLAY,
  PI_LIST_PRICE_UNIT,
  PI_NECTAR_AFTER_QUOTE,
  PI_NECTAR_AFTER_TAG,
  PI_NECTAR_BEFORE_QUOTE,
  PI_NECTAR_BEFORE_TAG,
  PI_NECTAR_LABEL,
} from "@/lib/pi-landing";

/** Decorative chrome only — not live data, not a product claim. */
const DAY_ITEMS = [
  { done: true, label: "The week is standing" },
  { done: true, label: "Notes already written" },
  { done: false, label: "You can leave" },
] as const;

function GlassCheck({ done }: { done: boolean }) {
  return (
    <span className={done ? "hero-check on" : "hero-check"} aria-hidden>
      {done ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5.1 4.1 7.2 8.1 2.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function HeroGeometry() {
  return (
    <svg className="hero-geo" viewBox="0 0 520 480" fill="none" aria-hidden>
      <circle cx="268" cy="228" r="172" stroke="#c9a227" strokeWidth="0.75" opacity="0.42" />
      <circle
        cx="268"
        cy="228"
        r="128"
        stroke="#c9a227"
        strokeWidth="0.6"
        opacity="0.22"
        strokeDasharray="1.6 5.5"
      />
      <rect
        x="148"
        y="78"
        width="248"
        height="308"
        rx="3"
        stroke="#c9a227"
        strokeWidth="0.7"
        opacity="0.32"
        transform="rotate(-9 272 232)"
      />
      <rect
        x="186"
        y="54"
        width="214"
        height="268"
        rx="3"
        stroke="#c9a227"
        strokeWidth="0.55"
        opacity="0.2"
        transform="rotate(14 293 188)"
      />
      <path
        d="M62 318 A214 214 0 0 1 438 118"
        stroke="#c9a227"
        strokeWidth="0.65"
        opacity="0.28"
        strokeDasharray="1.4 5"
      />
      <rect x="48" y="86" width="52" height="52" stroke="#c9a227" strokeWidth="0.75" opacity="0.38" />
      <rect x="412" y="336" width="36" height="36" stroke="#c9a227" strokeWidth="0.65" opacity="0.28" />
      <line x1="28" y1="428" x2="498" y2="36" stroke="#c9a227" strokeWidth="0.45" opacity="0.16" />
      <line x1="390" y1="40" x2="390" y2="160" stroke="#c9a227" strokeWidth="0.5" opacity="0.2" />
      <line x1="390" y1="40" x2="486" y2="40" stroke="#c9a227" strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
}

/**
 * Demo B–style abstract glass panels for the public hero.
 * Decorative UI chrome only. Copy stays PI-locked.
 */
export function PiHeroGlass() {
  return (
    <div className="hero-art" aria-hidden>
      <div className="hero-glow" />
      <HeroGeometry />

      <div className="hero-glass hero-glass-day">
        <div className="hero-glass-kicker">The day</div>
        <ul className="hero-day-list">
          {DAY_ITEMS.map((item) => (
            <li key={item.label}>
              <GlassCheck done={item.done} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hero-glass hero-glass-nectar">
        <div className="hero-glass-kicker">{PI_NECTAR_LABEL}</div>
        <div className="hero-ba">
          <span className="hero-ba-tag">{PI_NECTAR_BEFORE_TAG}</span>
          <p>{PI_NECTAR_BEFORE_QUOTE}</p>
        </div>
        <div className="hero-ba">
          <span className="hero-ba-tag yes">{PI_NECTAR_AFTER_TAG}</span>
          <p>{PI_NECTAR_AFTER_QUOTE}</p>
        </div>
      </div>

      <div className="hero-glass hero-glass-price">
        <div className="hero-glass-kicker">List price</div>
        <strong>{PI_LIST_PRICE_DISPLAY}</strong>
        <span>{PI_LIST_PRICE_UNIT}</span>
      </div>
    </div>
  );
}
