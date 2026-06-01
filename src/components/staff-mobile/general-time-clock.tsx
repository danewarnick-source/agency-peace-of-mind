import { useEffect, useMemo, useState } from "react";
import {
  Clock, Play, Square, Briefcase, GraduationCap, Car, Users, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useGeneralShift } from "@/hooks/use-general-shift";
import { useTimePaySettings, type TimePayCategory } from "@/hooks/use-time-pay-settings";

const ICON_BY_CODE: Record<string, typeof Briefcase> = {
  training: GraduationCap,
  admin: Briefcase,
  travel: Car,
  meeting: Users,
  other: HelpCircle,
};

const HINT_BY_CODE: Record<string, string> = {
  training: "Course work, certifications, in-services",
  admin: "Paperwork, scheduling, supervisor tasks",
  travel: "Between sites · non-billable travel",
  meeting: "Team meeting, supervision, 1:1s",
  other: "Describe the task before clocking in",
};

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

/**
 * Non-client work clock — renders only the categories an admin has enabled in
 * Time & Pay settings. Categories marked `requires_description` (built-in
 * "Other" and any custom ones) gate Clock In until the note is non-empty.
 */
export function GeneralTimeClock() {
  const { shift, start, stop } = useGeneralShift();
  const { settings, enabledCategories } = useTimePaySettings();
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());

  const cats = enabledCategories;
  const active = useMemo<TimePayCategory | undefined>(
    () => cats.find((c) => c.code === categoryCode) ?? cats[0],
    [cats, categoryCode],
  );

  useEffect(() => {
    if (!categoryCode && cats[0]) setCategoryCode(cats[0].code);
  }, [cats, categoryCode]);

  const running = !!shift;

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const elapsed = running
    ? fmtElapsed(now - new Date(shift!.start_iso).getTime())
    : "00:00:00";

  const requiresDesc = !!active?.requires_description;
  const canStart = !!active && (!requiresDesc || note.trim().length > 0);

  if (!settings.allow_non_client_clockins) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Non-client clock-ins are turned off for your organization. Use My
        Caseload to clock into a client shift with EVV.
      </section>
    );
  }

  if (!cats.length) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No clock-in categories are enabled. Ask your administrator to enable
        at least one category in Time & Pay settings.
      </section>
    );
  }

  const onStart = () => {
    if (!active || !canStart) return;
    start({ category: active.label, note: note.trim() });
    toast.success(`${active.label} clock started`);
  };

  const onStop = () => {
    if (!shift) return;
    if (!window.confirm(`End ${shift.category} shift?`)) return;
    stop();
    setNote("");
    toast.success("General shift ended");
  };

  return (
    <section
      aria-label="General Time Clock"
      className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-[0_10px_30px_-18px_rgba(13,17,43,0.18)] sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-flex h-2.5 w-2.5 animate-pulse rounded-full ${
              running ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span className="text-sm font-semibold uppercase tracking-wider">
            {running ? `On the clock · ${shift!.category}` : "Out of clock"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Non-client work · no EVV
        </span>
      </header>

      <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
        <p className="text-sm font-semibold">
          {running
            ? `Logging: ${shift!.category}`
            : "Choose a work category below"}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          General Time Clock is for non-client work. Use My Caseload to clock
          into a client shift with EVV.
        </p>
      </div>

      <div className="grid gap-3">
        <div>
          <Label className="mb-1 block text-xs font-medium">
            🗂️ Select Work Category
          </Label>
          <div role="radiogroup" aria-label="Work category" className="grid grid-cols-2 gap-2">
            {cats.map((c) => {
              const isActive = active?.code === c.code;
              const locked = running && shift!.category !== c.label;
              const Icon = ICON_BY_CODE[c.code] ?? Briefcase;
              const hint = HINT_BY_CODE[c.code] ?? (c.requires_description ? "Describe before clocking in" : "Custom category");
              return (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={locked || running}
                  onClick={() => setCategoryCode(c.code)}
                  className={[
                    "min-h-[64px] rounded-lg border px-3 py-2 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                    isActive
                      ? "border-[color:var(--amber-600,#f59324)] bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,#0d112b)] shadow-sm"
                      : locked
                        ? "border-border bg-muted/40 text-muted-foreground opacity-60"
                        : "border-border bg-background text-foreground hover:border-[color:var(--amber-600,#f59324)]/60",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {c.label}
                    {c.requires_description && (
                      <span
                        className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${
                          isActive ? "text-[#412402]" : "text-amber-700"
                        }`}
                      >
                        Note req.
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] leading-tight ${
                      isActive
                        ? "text-[color:var(--navy-900,#0d112b)]/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="general-note" className="mb-1 block text-xs font-medium">
            📝 {requiresDesc && !running ? "Description (required)" : "Note (optional)"}
          </Label>
          <Textarea
            id="general-note"
            rows={2}
            value={running ? shift!.note : note}
            onChange={(e) => setNote(e.target.value)}
            disabled={running}
            placeholder={
              requiresDesc
                ? "Describe the task — required before clocking in"
                : "What are you working on?"
            }
            maxLength={300}
            aria-required={requiresDesc}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center rounded-xl border border-border bg-background/70 py-3">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </div>

      <div className="mt-5">
        {running ? (
          <Button
            type="button"
            onClick={onStop}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-600/30 transition-all duration-150 hover:bg-rose-700 active:scale-[0.98]"
          >
            <Square className="h-5 w-5 fill-current" /> End {shift!.category} Shift
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#117a52] text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-700/30 transition-all duration-150 hover:bg-[#0f6b48] active:scale-[0.98] disabled:opacity-60"
          >
            <Play className="h-5 w-5 fill-current" /> Clock In · {active?.label ?? "—"}
          </Button>
        )}
        {!running && requiresDesc && !canStart && (
          <p className="mt-2 text-center text-[11px] font-medium text-amber-700">
            Add a short description above before clocking in.
          </p>
        )}
      </div>
    </section>
  );
}
