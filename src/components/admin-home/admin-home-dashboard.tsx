/**
 * Admin Home — feeling-hero B.
 * Dusk navy mountain pane, tablet still, three glass cards, no Nectar hero,
 * no obligation dump, no setup checklist.
 */
import { Link } from "@tanstack/react-router";
import { ClipboardList, User } from "lucide-react";
import { AdminHomeScheduleTablet } from "@/components/admin-home/admin-home-schedule-tablet";
import {
  ADMIN_HOME_BOARD_CTA,
  ADMIN_HOME_BOARD_TO,
  ADMIN_HOME_CARDS,
  ADMIN_HOME_DUSK,
  ADMIN_HOME_EYEBROW,
  ADMIN_HOME_FOOTER,
  ADMIN_HOME_HEADLINE,
  ADMIN_HOME_PALE_GOLD,
  ADMIN_HOME_SUBHEAD,
  type AdminHomeCard,
} from "@/lib/admin-home-feeling";

const NEWSREADER = { fontFamily: '"Newsreader", "Times New Roman", serif' } as const;

function DuskMountainBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #1a2744 0%, #10192c 38%, #0B1120 72%, #070b14 100%)",
        }}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[68%] w-full"
        viewBox="0 0 1440 640"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <path
          fill="#1b2b44"
          d="M0 392C168 318 318 354 478 286C638 218 786 304 954 248C1122 192 1272 258 1440 228V640H0V392Z"
        />
        <path
          fill="#121d30"
          d="M0 448C196 372 352 424 520 368C700 304 868 412 1054 356C1220 310 1328 396 1440 368V640H0V448Z"
        />
        <path
          fill="#0a101c"
          d="M0 528C214 470 392 554 620 500C848 446 1096 560 1440 486V640H0V528Z"
        />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-transparent to-[#0B1120]/45" />
    </div>
  );
}

function CardIcon({ cardKey }: { cardKey: AdminHomeCard["key"] }) {
  const Icon = cardKey === "notes" ? ClipboardList : User;
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full border border-white/70 text-white">
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </span>
  );
}

export function AdminHomeDashboard() {
  return (
    <section
      data-testid="admin-home-feeling-b"
      className="relative isolate min-h-full"
      style={{ background: ADMIN_HOME_DUSK, color: ADMIN_HOME_PALE_GOLD }}
    >
      <DuskMountainBackdrop />
      <div className="relative z-10 flex min-h-full flex-col px-5 pb-10 pt-4 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4 text-[13px] font-normal tracking-tight text-white/70">
          <span>Home</span>
          <span>Welcome to Provider Interface</span>
        </div>

        <div className="mt-10 grid flex-1 items-center gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:gap-12">
          <div className="max-w-xl">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.22em]"
              style={{ color: ADMIN_HOME_PALE_GOLD }}
            >
              {ADMIN_HOME_EYEBROW}
            </p>
            <h1
              className="mt-4 text-[2.35rem] leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.35rem]"
              style={{ ...NEWSREADER, color: ADMIN_HOME_PALE_GOLD }}
            >
              {ADMIN_HOME_HEADLINE}
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/72 sm:text-base">
              {ADMIN_HOME_SUBHEAD}
            </p>
            <Link
              to={ADMIN_HOME_BOARD_TO}
              className="mt-8 inline-flex items-center rounded-xl px-6 py-3 text-[15px] font-medium tracking-tight transition hover:brightness-105"
              style={{ background: ADMIN_HOME_PALE_GOLD, color: ADMIN_HOME_DUSK }}
            >
              {ADMIN_HOME_BOARD_CTA}
            </Link>
          </div>
          <AdminHomeScheduleTablet />
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {ADMIN_HOME_CARDS.map((card) => (
            <Link
              key={card.key}
              to={card.to}
              aria-label={`${card.title} — ${card.cta}`}
              className="rounded-2xl border border-white/12 bg-[#0B1120]/55 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition hover:border-white/20 hover:bg-[#0B1120]/70"
            >
              <CardIcon cardKey={card.key} />
              <h2 className="mt-4 text-[17px] font-medium" style={{ color: ADMIN_HOME_PALE_GOLD }}>
                {card.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/68">{card.body}</p>
            </Link>
          ))}
        </div>

        <p
          className="mt-12 text-center text-lg tracking-tight sm:text-xl"
          style={{ ...NEWSREADER, color: ADMIN_HOME_PALE_GOLD }}
        >
          {ADMIN_HOME_FOOTER}
        </p>
      </div>
    </section>
  );
}
