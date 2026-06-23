import { useEffect, useMemo, useState } from "react";
import {
  Clock, Play, Square, Briefcase, GraduationCap, Car, Users, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function fmtElapsed(ms: number) {
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
  const { shift, start, stop, updateNote } = useGeneralShift();
  const { settings, enabledCategories } = useTimePaySettings();
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showNoteError, setShowNoteError] = useState(false);

  const cats = enabledCategories;
  const active = useMemo<TimePayCategory | undefined>(
    () => cats.find((c) => c.code === categoryCode) ?? cats[0],
    [cats, categoryCode],
  );

  useEffect(() => {
    if (!categoryCode && cats[0]) setCategoryCode(cats[0].code);
  }, [cats, categoryCode]);

  const running = !!shift;

  // Sync local note with the active shift so it's editable while clocked in.
  useEffect(() => {
    if (shift) setNote(shift.note ?? "");
  }, [shift?.start_iso]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const elapsed = running
    ? fmtElapsed(now - new Date(shift!.start_iso).getTime())
    : "00:00:00";

  const MIN_NOTE_LEN = 10;
  const trimmedNote = note.trim();
  const noteValid = trimmedNote.length >= MIN_NOTE_LEN;
  const requiresDesc = !!active?.requires_description;
  const canStart = !!active && (!requiresDesc || trimmedNote.length > 0);

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
    start({ category: active.label, note: trimmedNote });
    toast.success(`${active.label} clock started`);
  };

  const onStop = () => {
    if (!shift) return;
    if (!noteValid) {
      setShowNoteError(true);
      toast.error("Add a note describing this shift before clocking out.", {
        description: `At least ${MIN_NOTE_LEN} characters — what did you work on?`,
      });
      const el = document.getElementById("general-note");
      el?.focus();
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!window.confirm(`End ${shift.category} shift?`)) return;
    stop(shift!.id, { note: trimmedNote });
    setNote("");
    setShowNoteError(false);
    toast.success("General shift ended");
  };


  return (
    <section
      aria-label="General Time Clock"
      className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-4"
    >
      {/* Status bar */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
      </header>

      {/* Category dropdown */}
      <div className="mb-3">
        <Label className="mb-1 block text-xs font-medium">
          Work Category
        </Label>
        <Select
          value={categoryCode}
          onValueChange={setCategoryCode}
          disabled={running}
        >
          <SelectTrigger className="h-11 w-full text-sm font-medium">
            <SelectValue placeholder="Select a category…" />
          </SelectTrigger>
          <SelectContent>
            {cats.map((c) => {
              const Icon = ICON_BY_CODE[c.code] ?? Briefcase;
              const hint = HINT_BY_CODE[c.code] ?? (c.requires_description ? "Describe before clocking in" : "Custom category");
              return (
                <SelectItem key={c.code} value={c.code} className="text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{c.label}</span>
                    {c.requires_description && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Note req.
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block pl-6 text-[11px] text-muted-foreground">
                    {hint}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {active && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {HINT_BY_CODE[active.code] ?? (active.requires_description ? "Describe before clocking in" : "Custom category")}
          </p>
        )}
      </div>

      {/* Note */}
      <div className="mb-3">
        <Label htmlFor="general-note" className="mb-1 flex items-center gap-1 text-xs font-medium">
          <span>Describe this shift</span>
          <span aria-hidden className="text-rose-600">*</span>
          <span className="ml-1 rounded bg-rose-100 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider text-rose-700">
            Required
          </span>
        </Label>
        <Textarea
          id="general-note"
          rows={2}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setShowNoteError(false);
            if (running) updateNote(shift!.id, e.target.value);
          }}
          placeholder={
            running
              ? "What did you work on? (required to clock out)"
              : requiresDesc
                ? "Describe the task — required before clocking in"
                : "What are you working on? (required to clock out)"
          }
          maxLength={300}
          aria-required="true"
          aria-invalid={showNoteError && !noteValid}
          className={`min-h-[3rem] resize-none text-sm ${
            showNoteError && !noteValid ? "border-rose-500 focus-visible:ring-rose-500" : ""
          }`}
        />
        <p
          className={`mt-1 text-[11px] ${
            showNoteError && !noteValid
              ? "font-medium text-rose-700"
              : "text-muted-foreground"
          }`}
        >
          {showNoteError && !noteValid
            ? `Please describe what this time was for (at least ${MIN_NOTE_LEN} characters).`
            : `Required · at least ${MIN_NOTE_LEN} characters. You can update this anytime before clocking out.`}
        </p>
      </div>


      {/* Timer */}
      <div className="mb-3 flex items-center justify-center rounded-xl border border-border bg-background/70 py-2.5">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </div>

      {/* Action button */}
      <div>
        {running ? (
          <Button
            type="button"
            onClick={onStop}
            style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl !bg-rose-600 text-base font-bold uppercase tracking-wider !text-white shadow-lg shadow-rose-600/30 transition-all duration-150 hover:!bg-rose-700 active:scale-[0.98]"
          >
            <Square className="h-5 w-5 fill-current" /> End {shift!.category} Shift
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            style={{ backgroundColor: "#059669", color: "#ffffff" }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl !bg-emerald-600 text-base font-bold uppercase tracking-wider !text-white shadow-lg shadow-emerald-600/30 transition-all duration-150 hover:!bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
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
