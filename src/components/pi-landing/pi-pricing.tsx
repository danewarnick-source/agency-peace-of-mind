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
} from "@/lib/pi-landing";

const NEWSREADER = { fontFamily: '"Newsreader", "Times New Roman", serif' } as const;

export function PiPricingSection({
  heading = "The number",
  showEnterprise = false,
}: {
  heading?: string;
  showEnterprise?: boolean;
}) {
  return (
    <section id="pricing" className="scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-3xl">
        {heading ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
            {heading}
          </p>
        ) : null}
        <h2
          className={`${heading ? "mt-3" : ""} text-3xl font-medium leading-[1.12] tracking-[-0.02em] text-[#f3efe6] sm:text-5xl`}
          style={NEWSREADER}
        >
          {PI_LIST_PRICE_LEAD}
        </h2>

        <p
          className="mt-10 text-[4.25rem] font-medium leading-none tracking-[-0.03em] text-[#f3efe6] sm:text-[6.5rem]"
          style={NEWSREADER}
        >
          {PI_LIST_PRICE_DISPLAY}
        </p>
        <p className="mt-3 text-lg text-[#f3efe6]/70 sm:text-xl">{PI_LIST_PRICE_UNIT}</p>
        <p className="mt-2 text-base text-[#f3efe6]/55">{PI_LIST_MINIMUM_LINE}</p>

        <p className="mt-10 text-xl font-medium leading-snug text-[#f3efe6] sm:text-2xl">
          {PI_LIST_PRICE_CONTRAST}
        </p>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#f3efe6]/62 sm:text-lg">
          {PI_LIST_PRICE_INCLUDED}
        </p>

        <dl className="mt-12 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {PI_INCLUDED_IN_PRICE.map((row) => (
            <div key={row.title} className="grid gap-1 py-5 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-8">
              <dt className="text-sm font-medium text-[#f3efe6]">{row.title}</dt>
              <dd className="text-sm leading-relaxed text-[#f3efe6]/62">{row.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
            Training, optional
          </p>
          <h3
            className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#f3efe6] sm:text-3xl"
            style={NEWSREADER}
          >
            The only add-on.
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#f3efe6]/62">
            Everything else is in the list price. Training is optional, and priced in the open.
          </p>
          <ul className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {PI_TRAINING_ADDONS.map((row) => (
              <li key={row.name} className="flex items-baseline justify-between gap-4 py-4 text-sm">
                <span className="text-[#f3efe6]">{row.name}</span>
                <span className="tabular-nums text-[#f3efe6]/80">{row.price}</span>
              </li>
            ))}
          </ul>
        </div>

        {showEnterprise ? (
          <div className="mt-14 border-t border-white/[0.08] pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
              Enterprise
            </p>
            <p
              className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#f3efe6] sm:text-3xl"
              style={NEWSREADER}
            >
              Contact us
            </p>
            <p className="mt-3 text-sm text-[#f3efe6]/62">{PI_ENTERPRISE_LINE}</p>
            <Link
              to="/contact"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-[#f3efe6]/25 px-5 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
            >
              {PI_TALK_TO_US}
            </Link>
          </div>
        ) : null}

        <p className="mt-12 text-sm text-[#f3efe6]/50">{PI_FOUNDING_QUIET}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#f3efe6] px-6 text-sm font-medium text-[#0b1220] hover:bg-[#f3efe6]/90"
          >
            {PI_SIGN_IN}
          </Link>
          <Link
            to="/contact"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#f3efe6]/25 px-6 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
          >
            {PI_TALK_TO_US}
          </Link>
        </div>
      </div>
    </section>
  );
}
