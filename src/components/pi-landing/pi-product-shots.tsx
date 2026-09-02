import type { ReactNode } from "react";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { PI_ACTION, PI_CREAM, PI_NAVY, PI_PRODUCT_SHOTS } from "@/lib/pi-landing";
import { DuskPeopleScreen } from "@/components/pi-landing/dusk-people-screen";

function NavGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

function ShotChrome({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <div
      className="flex h-full min-h-[220px] overflow-hidden rounded-[12px] ring-1 ring-white/[0.08]"
      style={{ background: PI_NAVY, color: PI_CREAM }}
      aria-hidden
    >
      <aside className="flex w-10 shrink-0 flex-col items-center gap-3 border-r border-white/[0.06] py-3 sm:w-11">
        <PiMark className="h-5 w-5 text-[#f3efe6]" />
        <span className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.07]">
          <NavGlyph d="M5 7h14M5 12h14M5 17h10" />
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-md text-[#f3efe6]/45">
          <NavGlyph d="M7 6h10v12H7zM9 10h6M9 14h4" />
        </span>
      </aside>
      <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-sans text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
          {action ? (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-medium"
              style={{ background: PI_ACTION, color: PI_CREAM }}
            >
              {action}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function NectarShot() {
  return (
    <ShotChrome title="Nectar">
      <p className="mt-2 text-[11px] text-[#f3efe6]/50">With you while the day is happening</p>
      <div className="mt-3 space-y-2">
        {[
          { who: "You", text: "Does this note already cover the afternoon?" },
          { who: "Nectar", text: "The afternoon is already on the record. One sentence still needs your eye." },
          { who: "You", text: "Keep it as a draft." },
        ].map((row) => (
          <div key={row.text} className="rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-[#f3efe6]/40">{row.who}</div>
            <div className="mt-0.5 text-[11px] text-[#f3efe6]/80">{row.text}</div>
          </div>
        ))}
      </div>
    </ShotChrome>
  );
}

function ScheduleShot() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const cells = ["Jordan · AM", "Taylor · PM", "Alex · AM", "Casey · PM", "Riley · AM"];
  return (
    <ShotChrome title="Schedule" action="This week">
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {days.map((d) => (
          <div key={d} className="text-center text-[9px] uppercase tracking-[0.12em] text-[#f3efe6]/40">
            {d}
          </div>
        ))}
        {cells.map((c) => (
          <div
            key={c}
            className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1 py-2 text-center text-[10px] text-[#f3efe6]/75"
          >
            {c}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#f3efe6]/45">Coverage holds. Close the laptop.</p>
    </ShotChrome>
  );
}

function NotesShot() {
  return (
    <ShotChrome title="Notes" action="Already written">
      <div className="mt-3 space-y-2">
        {[
          { name: "Alex Morgan", note: "Afternoon visit complete. Evening still open on the record." },
          { name: "Jordan Lee", note: "Morning note signed. Nothing left to reconstruct." },
          { name: "Taylor Kim", note: "Draft waiting for your eye — Nectar left one sentence." },
        ].map((row) => (
          <div key={row.name} className="rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2">
            <div className="text-[11px] font-medium">{row.name}</div>
            <div className="mt-0.5 text-[10px] text-[#f3efe6]/60">{row.note}</div>
          </div>
        ))}
      </div>
    </ShotChrome>
  );
}

function TrainingsShot() {
  return (
    <ShotChrome title="Trainings" action="Packets">
      <div className="mt-3 space-y-2">
        {[
          { name: "CPR / First Aid", state: "Finished" },
          { name: "30-day orientation", state: "Assigned" },
          { name: "Mandt", state: "In packet" },
        ].map((row) => (
          <div
            key={row.name}
            className="flex items-center justify-between rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2"
          >
            <span className="text-[11px]">{row.name}</span>
            <span className="text-[10px] text-[#8fbf98]">{row.state}</span>
          </div>
        ))}
      </div>
    </ShotChrome>
  );
}

function ShopShot() {
  return (
    <ShotChrome title="Shop" action="Seats">
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { name: "CPR / First Aid", price: "$100" },
          { name: "30-day", price: "$75" },
          { name: "Mandt", price: "$200" },
          { name: "Package", price: "$300" },
        ].map((row) => (
          <div key={row.name} className="rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2">
            <div className="text-[11px]">{row.name}</div>
            <div className="mt-1 text-sm font-medium">{row.price}</div>
          </div>
        ))}
      </div>
    </ShotChrome>
  );
}

const SHOTS: Record<string, ReactNode> = {
  nectar: <NectarShot />,
  people: (
    <div className="overflow-hidden rounded-[12px] ring-1 ring-white/[0.08]">
      <div className="aspect-[16/10] min-h-[220px]">
        <DuskPeopleScreen />
      </div>
    </div>
  ),
  schedule: <ScheduleShot />,
  notes: <NotesShot />,
  trainings: <TrainingsShot />,
  shop: <ShopShot />,
};

export function PiProductShots() {
  return (
    <section id="product" className="scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">The office</p>
        <h2
          className="mt-3 max-w-3xl text-3xl font-medium leading-[1.12] tracking-[-0.02em] text-[#f3efe6] sm:text-5xl"
          style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
        >
          Admin-first. The work you already do, in one room.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-[#f3efe6]/62 sm:text-lg">
          Nectar, people, the schedule, notes already written, trainings, the shop. Not a caregiver app.
        </p>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          {PI_PRODUCT_SHOTS.map((shot) => (
            <article key={shot.id} className="min-w-0">
              {SHOTS[shot.id]}
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-[#f3efe6]/45">
                {shot.kicker}
              </p>
              <h3 className="mt-1 font-sans text-xl font-semibold tracking-tight">{shot.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#f3efe6]/62">{shot.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
