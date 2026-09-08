import { PiHomepageMark } from "@/components/pi-landing/pi-mark";
import { PI_HOME_CHIPS, PI_HOME_PHONE_ROWS } from "@/lib/pi-homepage";
import { PI_PRODUCT_SHORT, PI_WORDMARK } from "@/lib/pi-landing";

function Constellation() {
  return (
    <svg className="pi-home-constellation" viewBox="0 0 420 520" fill="none" aria-hidden>
      <path
        className="pi-home-arc"
        d="M48 390 C 20 260, 70 90, 210 42"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        className="pi-home-arc"
        d="M372 128 C 400 250, 350 430, 210 478"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="210" cy="42" r="2.4" fill="currentColor" />
      <circle cx="48" cy="390" r="2.2" fill="currentColor" />
      <circle cx="372" cy="128" r="2.2" fill="currentColor" />
      <circle cx="210" cy="478" r="2.2" fill="currentColor" />
      <circle cx="86" cy="168" r="1.6" fill="currentColor" opacity="0.7" />
      <circle cx="334" cy="352" r="1.6" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function PiHeroPhone() {
  return (
    <div className="pi-home-hero-art" aria-hidden>
      <Constellation />
      <div className="pi-home-phone">
        <div className="pi-home-phone-inner">
          <div className="pi-home-phone-notch" />
          <div className="pi-home-phone-chip">
            <PiHomepageMark size={16} />
            <span>
              {PI_PRODUCT_SHORT}
              <small>{PI_WORDMARK}</small>
            </span>
          </div>
          <ul className="pi-home-status-list">
            {PI_HOME_PHONE_ROWS.map((row) => (
              <li key={row.label}>
                <span className="pi-home-status-label">{row.label}</span>
                <span className={`pi-home-pill ${row.tone}`}>{row.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {PI_HOME_CHIPS.map((chip, index) => (
        <div key={chip} className={`pi-home-bob pi-home-bob-${index + 1}`}>
          {chip}
        </div>
      ))}
    </div>
  );
}
