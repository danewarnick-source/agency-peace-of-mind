/** Decorative iPad still of the Schedule board — feeling-hero B. Not live data. */

const STAFF = ["Avery", "Jordan", "Taylor", "Morgan"] as const;
const HOURS = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"] as const;

type Block = {
  staff: (typeof STAFF)[number];
  startRow: number;
  span: number;
  label: string;
};

const BLOCKS: Block[] = [
  { staff: "Avery", startRow: 1, span: 2, label: "Avery Cole 9:00 – 11:00" },
  { staff: "Jordan", startRow: 1, span: 1, label: "Jordan Lee 9:00 – 10:00" },
  { staff: "Jordan", startRow: 4, span: 2, label: "Jordan Lee 12:00 – 2:00" },
  { staff: "Taylor", startRow: 2, span: 2, label: "Taylor Kim 10:00 – 12:00" },
  { staff: "Morgan", startRow: 0, span: 2, label: "Morgan Hale 8:00 – 10:00" },
  { staff: "Morgan", startRow: 6, span: 2, label: "Morgan Hale 2:00 – 4:00" },
];

function blocksFor(staff: (typeof STAFF)[number], row: number) {
  return BLOCKS.find((b) => b.staff === staff && b.startRow === row);
}

export function AdminHomeScheduleTablet() {
  return (
    <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[460px]" aria-hidden>
      <div className="rounded-[28px] bg-[#12161f] p-[10px] shadow-[0_28px_70px_-18px_rgba(0,0,0,0.72)] ring-1 ring-white/10">
        <div className="relative overflow-hidden rounded-[20px] bg-[#0b1220]">
          <div className="absolute left-1/2 top-1.5 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/25" />
          <div className="border-b border-white/[0.06] px-3 pb-2 pt-3.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
              Schedule
            </div>
          </div>
          <div className="grid grid-cols-[44px_repeat(4,minmax(0,1fr))] border-b border-white/[0.06] px-1.5 py-1.5">
            <div />
            {STAFF.map((name) => (
              <div
                key={name}
                className="truncate px-0.5 text-center text-[9px] font-medium text-white/70"
              >
                {name}
              </div>
            ))}
          </div>
          <div className="relative px-1.5 pb-2 pt-0.5">
            {HOURS.map((hour, row) => (
              <div
                key={hour}
                className="grid grid-cols-[44px_repeat(4,minmax(0,1fr))] border-t border-white/[0.04]"
                style={{ minHeight: 28 }}
              >
                <div className="pr-1 pt-0.5 text-right text-[8px] tabular-nums text-white/35">
                  {hour}
                </div>
                {STAFF.map((staff) => {
                  const block = blocksFor(staff, row);
                  return (
                    <div key={staff} className="relative px-0.5 py-0.5">
                      {block ? (
                        <div
                          className="absolute inset-x-0.5 top-0.5 overflow-hidden rounded-[5px] bg-[#1c2a44] px-1 py-0.5 text-[7px] leading-tight text-white/90"
                          style={{ height: `calc(${block.span * 28}px - 4px)` }}
                        >
                          {block.label}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-1.5 h-1 w-12 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
