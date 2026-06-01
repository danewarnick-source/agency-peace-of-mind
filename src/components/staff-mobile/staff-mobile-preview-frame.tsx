import { useState, type ReactNode } from "react";
import { Smartphone } from "lucide-react";
import { StaffTopBar } from "./staff-top-bar";
import { StaffBottomTabs } from "./staff-bottom-tabs";

const DEVICES = [
  { id: "se", label: "iPhone SE", w: 375, h: 667 },
  { id: "15", label: "iPhone 15", w: 390, h: 844 },
  { id: "pixel", label: "Pixel 7", w: 412, h: 915 },
] as const;

/**
 * Desktop QA preview: renders the staff portal inside a phone-shaped frame.
 * The mobile layout is forced via `framed` props on the staff chrome, so the
 * mobile UI shows regardless of the actual browser viewport width.
 */
export function StaffMobilePreviewFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[1]);

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-200/70 px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5">
        <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 p-1 shadow-sm">
          <Smartphone className="ml-2 h-4 w-4 text-slate-500" />
          {DEVICES.map((d) => {
            const active = d.id === device.id;
            return (
              <button
                key={d.id}
                onClick={() => setDevice(d)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#0d112b] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {d.label}
                <span className="ml-1 text-[10px] opacity-60">
                  {d.w}×{d.h}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="relative shrink-0 rounded-[2.75rem] border-[12px] border-slate-900 bg-slate-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
          style={{ width: device.w + 24, height: device.h + 24 }}
        >
          {/* Notch */}
          <div className="pointer-events-none absolute left-1/2 top-[6px] z-50 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />

          {/* Screen */}
          <div
            className="relative overflow-hidden rounded-[2rem] bg-[#0d112b]"
            style={{ width: device.w, height: device.h }}
          >
            <div className="absolute inset-0 flex flex-col">
              <StaffTopBar title={title} framed />
              <main className="flex-1 overflow-y-auto overscroll-contain bg-secondary/40 px-3 py-4 pb-20">
                {children}
              </main>
              <StaffBottomTabs framed />
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          QA preview · interactive · {device.w}×{device.h}
        </p>
      </div>
    </div>
  );
}
