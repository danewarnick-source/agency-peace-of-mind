import { Link } from "@tanstack/react-router";
import {
  PI_ENTERPRISE_LINE,
  PI_FOUNDING_QUIET,
  PI_INCLUDED_IN_PRICE,
  PI_LIST_MINIMUM_LINE,
  PI_LIST_PRICE_CONTRAST,
  PI_LIST_PRICE_DISPLAY,
  PI_LIST_PRICE_INCLUDED,
  PI_LIST_PRICE_LEAD,
  PI_LIST_PRICE_UNIT,
  PI_SIGN_IN,
  PI_TALK_TO_US,
  PI_TRAINING_ADDONS,
  PI_TRAINING_QUIET,
  PI_TRAINING_QUIET_LINK,
  PI_TRAINING_SECTION_BODY,
  PI_TRAINING_SECTION_HEADLINE,
} from "@/lib/pi-landing";

export function PiPricingSection({
  heading = "The number",
  showEnterprise = false,
  compact = false,
}: {
  heading?: string;
  showEnterprise?: boolean;
  /** Landing: price + contrast + one training line. /pricing keeps the fuller grid. */
  compact?: boolean;
}) {
  return (
    <section
      id="pricing"
      className={compact ? "pi-pricing-section compact" : "pi-pricing-section"}
    >
      {heading ? <p className="sk">{heading}</p> : null}

      <div className="pi-price-card">
        <h2>{PI_LIST_PRICE_LEAD}</h2>
        <p className="pi-price-amount">{PI_LIST_PRICE_DISPLAY}</p>
        <p className="per">{PI_LIST_PRICE_UNIT}</p>
        <p className="min">{PI_LIST_MINIMUM_LINE}</p>
        <p className="pi-price-contrast">{PI_LIST_PRICE_CONTRAST}</p>
        {compact ? (
          <p className="pi-price-included">
            {PI_TRAINING_QUIET}{" "}
            <Link to="/pricing">{PI_TRAINING_QUIET_LINK}</Link>
          </p>
        ) : (
          <p className="pi-price-included">{PI_LIST_PRICE_INCLUDED}</p>
        )}
      </div>

      {compact ? null : (
        <>
          <dl className="pi-pricing-rows">
            {PI_INCLUDED_IN_PRICE.map((row) => (
              <div key={row.title} className="pi-pricing-row">
                <dt>{row.title}</dt>
                <dd>{row.body}</dd>
              </div>
            ))}
          </dl>

          <div className="pi-pricing-block">
            <p className="sk">Training, optional</p>
            <h3>{PI_TRAINING_SECTION_HEADLINE}</h3>
            <p className="pi-pricing-body">{PI_TRAINING_SECTION_BODY}</p>
            <ul className="pi-pricing-rows">
              {PI_TRAINING_ADDONS.map((row) => (
                <li key={row.name} className="pi-pricing-row pi-pricing-train">
                  <span>{row.name}</span>
                  <span className="pi-pricing-figure">{row.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {showEnterprise ? (
        <div className="pi-pricing-block pi-pricing-enterprise">
          <p className="sk">Enterprise</p>
          <h3>Contact us</h3>
          <p className="pi-pricing-body">{PI_ENTERPRISE_LINE}</p>
          <Link className="btn s" to="/contact">
            {PI_TALK_TO_US}
          </Link>
        </div>
      ) : null}

      <p className="pi-pricing-quiet">{PI_FOUNDING_QUIET}</p>

      <div className="ctas pi-pricing-close">
        <Link className="btn p" to="/login">
          {PI_SIGN_IN}
        </Link>
        <Link className="btn s" to="/contact">
          {PI_TALK_TO_US}
        </Link>
      </div>
    </section>
  );
}
