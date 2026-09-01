import { PiMark } from "@/components/pi-landing/pi-mark";
import { PI_ACTION, PI_CREAM, PI_GOLD, PI_NAVY } from "@/lib/pi-landing";

type PersonRow = {
  initials: string;
  name: string;
  program: string;
  status: "Enrolled" | "Scheduled" | "Completed" | "In Progress";
  assigned: string;
  last: string;
  tone: string;
};

const ROWS: PersonRow[] = [
  { initials: "AM", name: "Alex Morgan", program: "Intensive Outpatient", status: "Enrolled", assigned: "K. Anderson", last: "2h ago", tone: "#3d4f63" },
  { initials: "JL", name: "Jordan Lee", program: "Outpatient", status: "Enrolled", assigned: "M. Johnson", last: "4h ago", tone: "#4a3f38" },
  { initials: "TK", name: "Taylor Kim", program: "Aftercare", status: "Scheduled", assigned: "S. Patel", last: "6h ago", tone: "#3a4554" },
  { initials: "CN", name: "Casey Nguyen", program: "Telehealth", status: "Completed", assigned: "J. Thompson", last: "1d ago", tone: "#3f4a3c" },
  { initials: "RS", name: "Riley Smith", program: "Telehealth", status: "In Progress", assigned: "S. Thompson", last: "1d ago", tone: "#4a4048" },
];

function statusClass(status: PersonRow["status"]) {
  if (status === "Enrolled") return "text-[#8fbf98]";
  return "text-[#c4b8a4]";
}

function NavGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

/** Decorative admin still for the dusk laptop. Not a live app surface. */
export function DuskPeopleScreen() {
  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      style={{ background: PI_NAVY, color: PI_CREAM }}
      aria-hidden
    >
      <aside className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-white/[0.06] py-3 sm:w-12">
        <PiMark className="h-5 w-5" />
        <span
          className="relative grid h-8 w-8 place-items-center rounded-md bg-white/[0.07]"
          style={{ boxShadow: `inset 2px 0 0 ${PI_GOLD}` }}
        >
          <NavGlyph d="M5 7h14M5 12h14M5 17h10" />
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-md text-[#f3efe6]/55">
          <NavGlyph d="M12 5v14M5 12h14" />
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-md text-[#f3efe6]/55">
          <NavGlyph d="M7 6h10v12H7zM9 10h6M9 14h4" />
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-md text-[#f3efe6]/55">
          <NavGlyph d="M6 8h12M8 6v4M16 6v4M6 12h12v6H6z" />
        </span>
      </aside>

      <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-sans text-[1.35rem] font-semibold tracking-tight sm:text-[1.7rem]">
            People
          </h2>
          <span
            className="rounded-md px-2.5 py-1 text-[11px] font-medium"
            style={{ background: PI_ACTION, color: PI_CREAM }}
          >
            + New
          </span>
        </div>

        <div className="mt-2.5 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-1.5 text-[11px] text-[#f3efe6]/45 sm:mt-3">
          Search people...
        </div>

        <div className="mt-3 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_0.7fr_0.8fr_0.55fr] gap-2 px-1 pb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#f3efe6]/40 sm:text-[10px]">
            <span>Name</span>
            <span>Program</span>
            <span>Status</span>
            <span>Assigned</span>
            <span>Last activity</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {ROWS.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_0.7fr_0.8fr_0.55fr] items-center gap-2 px-1 py-1.5 sm:py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[8px] font-semibold tracking-wide"
                    style={{ background: row.tone, color: PI_CREAM }}
                  >
                    {row.initials}
                  </span>
                  <span className="truncate text-[11px] font-medium sm:text-xs">{row.name}</span>
                </span>
                <span className="truncate text-[10px] text-[#f3efe6]/70 sm:text-[11px]">{row.program}</span>
                <span className={`truncate text-[10px] font-medium sm:text-[11px] ${statusClass(row.status)}`}>
                  {row.status}
                </span>
                <span className="truncate text-[10px] text-[#f3efe6]/70 sm:text-[11px]">{row.assigned}</span>
                <span className="truncate text-[10px] text-[#f3efe6]/50 sm:text-[11px]">{row.last}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
