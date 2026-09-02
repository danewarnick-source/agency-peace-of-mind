import { DuskPeopleScreen } from "@/components/pi-landing/dusk-people-screen";

/** Composed dusk room: photographic desk plate + laptop still. Not an app iframe. */
export function DuskDeskStill() {
  return (
    <div className="relative mx-auto w-full max-w-[92rem]">
      <img
        src="/pi-dusk-desk-hero.png"
        alt=""
        className="block h-[min(42vh,480px)] w-full object-cover object-[center_62%] sm:h-[min(48vh,560px)]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/15 to-[#0b1220]/70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0b1220] to-transparent" />

      <div className="absolute inset-x-0 top-[10%] flex justify-center px-4 sm:top-[12%] sm:px-8">
        <div
          className="w-full max-w-[920px]"
          style={{
            transform: "perspective(1600px) rotateX(8deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <div className="rounded-[14px] bg-[#090c12] p-[6px] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] sm:rounded-[18px] sm:p-[8px]">
            <div className="overflow-hidden rounded-[8px] bg-[#0b1220] sm:rounded-[11px]">
              <div className="aspect-[16/9.2] min-h-[200px] max-h-[520px]">
                <DuskPeopleScreen />
              </div>
            </div>
            <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-white/10 sm:mt-2 sm:h-1.5 sm:w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}
