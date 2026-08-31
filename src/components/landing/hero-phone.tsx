/**
 * The one landing hero device — Staff View · My Caseload.
 * Fictional people with photo avatars. No extra phones on the page.
 */
import {
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  Hexagon,
  Search,
  Sparkles,
} from "lucide-react";
import { HiveMark } from "@/components/brand/hive-mark";

const RILEY = "/landing/riley-staff.jpg";
const MAYA = "/landing/maya-ellison.jpg";
const COLE = "/landing/cole-brennan.jpg";

function Avatar({ src, alt, size = "md" }: { src: string; alt: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <img
      src={src}
      alt={alt}
      className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-[var(--hive-border)]`}
    />
  );
}

export function HeroPhone({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[340px] ${className}`}>
      <div
        className="relative overflow-hidden rounded-[2.4rem] border-[10px] border-[#2a333c] bg-[var(--hive-canvas)] shadow-[var(--shadow-elegant)]"
        style={{ boxShadow: "0 28px 60px -28px rgba(36, 48, 64, 0.45), 0 0 0 1px #1c232b" }}
      >
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#1c232b]" />

        <div className="flex items-center justify-between bg-[var(--hive-sidebar)] px-3 pb-2.5 pt-8">
          <div className="flex items-center gap-1.5">
            <HiveMark className="h-5 w-5" />
            <span className="font-display text-[15px] font-semibold tracking-tight text-[var(--hive-chrome-text)]">
              Hive
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-medium text-[var(--hive-chrome-text)]">
            <Search className="h-2.5 w-2.5" />
            Ask Nectar
          </span>
        </div>

        <div className="bg-[var(--hive-canvas)] px-3 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <Avatar src={RILEY} alt="Riley" size="sm" />
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--hive-text-muted)]">
                Staff
              </p>
              <p className="font-display text-[15px] font-semibold leading-tight text-[var(--hive-text)]">
                Good morning, Riley.
              </p>
            </div>
          </div>

          <h3 className="font-display mt-3 text-lg font-semibold text-[var(--hive-text)]">My Caseload</h3>

          <div className="mt-2 flex items-center gap-2 rounded-full border border-[var(--hive-border)] bg-[var(--hive-surface)] px-3 py-2">
            <Hexagon className="h-3.5 w-3.5 text-[var(--hive-gold)]" strokeWidth={1.6} />
            <span className="text-[11px] text-[var(--hive-text-muted)]">Ask Nectar or search…</span>
          </div>

          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--hive-gold)]">
            Host Home
          </p>
          <div className="mt-1.5 rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-2.5 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-2">
              <Avatar src={MAYA} alt="Maya Ellison" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--hive-text)]">Maya Ellison</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--hive-text-muted)]">
                  Host Home · HHS
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--hive-text-muted)]">
                  Daily note — hosts do not clock in
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 rounded-md bg-[var(--hive-gold)] px-2 py-1.5 text-[11px] font-semibold text-[var(--hive-on-gold)]">
              Open daily note
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>

          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--hive-gold)]">
            Also today
          </p>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-2.5">
            <Avatar src={COLE} alt="Cole Brennan" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--hive-text)]">Cole Brennan</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--hive-text-muted)]">
                HHS
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[var(--hive-text-muted)]">
                <Hexagon className="h-2.5 w-2.5 text-[var(--hive-gold)]" strokeWidth={2} />
                Daily note
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--hive-text-muted)]" />
          </div>
        </div>

        <nav className="grid grid-cols-6 bg-[var(--hive-sidebar)] px-1 pb-3 pt-2 text-center">
          {[
            { icon: FolderOpen, label: "Caseload", on: true },
            { icon: CalendarDays, label: "Schedule", on: false },
            { icon: ClipboardCheck, label: "Daily Logs", on: false },
            { icon: Sparkles, label: "Ask Nectar", on: false },
            { icon: ClipboardList, label: "Obligations", on: false },
            { icon: GraduationCap, label: "Trainings", on: false },
          ].map(({ icon: Icon, label, on }) => (
            <div
              key={label}
              className={`flex flex-col items-center gap-0.5 ${
                on ? "text-[var(--hive-gold)]" : "text-[var(--hive-chrome-text)]/65"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span className="text-[6.5px] font-medium leading-tight">{label}</span>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
