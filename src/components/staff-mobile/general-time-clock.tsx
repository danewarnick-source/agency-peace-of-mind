import { useEffect, useState } from "react";
import { Clock, Play, Square, Briefcase, GraduationCap, Car, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useGeneralShift, type GeneralCategory } from "@/hooks/use-general-shift";

const CATEGORIES: { v: GeneralCategory; label: string; Icon: typeof Briefcase; hint: string }[] = [
  { v: "Training", label: "Training", Icon: GraduationCap, hint: "Course work, certifications, in-services" },
  { v: "Admin",    label: "Admin",    Icon: Briefcase,     hint: "Paperwork, scheduling, supervisor tasks" },
  { v: "Travel",   label: "Travel",   Icon: Car,           hint: "Between sites · non-billable travel" },
  { v: "Meeting",  label: "Meeting",  Icon: Users,         hint: "Team meeting, supervision, 1:1s" },
];

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

/**
 * Non-client work clock. Same visual chassis as the client clock-in card
 * but labelled and scoped to a work category (Training / Admin / Travel /
 * Meeting). Persists the active shift to localStorage so the global
 * clocked-in bar can surface it.
 */
export function GeneralTimeClock() {
  const { shift, start, stop } = useGeneralShift();
  const [category, setCategory] = useState<GeneralCategory>("Training");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());

  const running = !!shift;

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const elapsed = running
    ? fmtElapsed(now - new Date(shift!.start_iso).getTime())
    : "00:00:00";

  const onStart = () => {
    start({ category, note: note.trim() });
    toast.success(`${category} clock started`);
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
      className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-sm sm:p-5"
    >
      {/* Status row */}
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

      {/* "Serving" verification box equivalent */}
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

      {/* Category picker */}
      <div className="grid gap-3">
        <div>
          <Label className="mb-1 block text-xs font-medium">
            🗂️ Select Work Category
          </Label>
          <div role="radiogroup" aria-label="Work category" className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(({ v, label, Icon, hint }) => {
              const active = category === v;
              const locked = running && shift!.category !== v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={locked || running}
                  onClick={() => setCategory(v)}
                  className={[
                    "min-h-[64px] rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-[color:var(--amber-600,#f59324)] bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,#0d112b)] shadow-sm"
                      : locked
                        ? "border-border bg-muted/40 text-muted-foreground opacity-60"
                        : "border-border bg-background text-foreground hover:border-[color:var(--amber-600,#f59324)]/60",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {label}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] leading-tight ${
                      active
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
            📝 Note (optional)
          </Label>
          <Textarea
            id="general-note"
            rows={2}
            value={running ? shift!.note : note}
            onChange={(e) => setNote(e.target.value)}
            disabled={running}
            placeholder="What are you working on?"
            maxLength={300}
          />
        </div>
      </div>

      {/* Timer */}
      <div className="mt-5 flex items-center justify-center rounded-xl border border-border bg-background/70 py-3">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </div>

      {/* Action */}
      <div className="mt-5">
        {running ? (
          <Button
            type="button"
            onClick={onStop}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-600/30 hover:bg-rose-700"
          >
            <Square className="h-5 w-5 fill-current" /> End {shift!.category} Shift
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onStart}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#117a52] text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-700/30 hover:bg-[#0f6b48]"
          >
            <Play className="h-5 w-5 fill-current" /> Clock In · {category}
          </Button>
        )}
      </div>
    </section>
  );
}
