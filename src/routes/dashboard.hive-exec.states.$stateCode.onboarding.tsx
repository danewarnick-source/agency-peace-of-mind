import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Flag,
  Save,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { ONBOARDING_SECTIONS, type OnboardingField } from "@/lib/state-onboarding";
import {
  completeOnboardingSession,
  getOrCreateOnboardingSession,
  saveOnboardingProgress,
  type BuildFlag,
} from "@/lib/state-onboarding.functions";
import { z } from "zod";

const onboardingSearchSchema = z.object({
  startFrom: z
    .union([z.literal("blank"), z.string().regex(/^[A-Z]{2}$/)])
    .optional(),
});

export const Route = createFileRoute("/dashboard/hive-exec/states/$stateCode/onboarding")({
  validateSearch: onboardingSearchSchema,
  head: ({ params }) => ({
    meta: [{ title: `${params.stateCode} — New State Onboarding` }],
  }),
  component: OnboardingPage,
});

type AnswersMap = Record<string, Record<string, string>>;

function makeFlagId(section: string, field: string) {
  return `${section}.${field}`;
}

function OnboardingPage() {
  const { stateCode } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const initFn = useServerFn(getOrCreateOnboardingSession);
  const saveFn = useServerFn(saveOnboardingProgress);
  const completeFn = useServerFn(completeOnboardingSession);

  const session = useQuery({
    queryKey: ["state-onboarding-session", stateCode],
    queryFn: () => initFn({ data: { stateCode } }),
  });

  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [flags, setFlags] = useState<BuildFlag[]>([]);

  // Hydrate once when session loads
  useEffect(() => {
    if (session.data && Object.keys(answers).length === 0 && flags.length === 0) {
      const s = session.data as unknown as { answers?: AnswersMap; build_flags?: BuildFlag[] };
      setAnswers(s.answers ?? {});
      setFlags(s.build_flags ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data]);

  const step = ONBOARDING_SECTIONS[stepIdx];
  const totalSteps = ONBOARDING_SECTIONS.length;
  const isLast = stepIdx === totalSteps - 1;

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          sessionId: (session.data as { id: string }).id,
          answers,
          buildFlags: flags,
        },
      }),
    onSuccess: () => toast.success("Progress saved"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const complete = useMutation({
    mutationFn: () =>
      completeFn({
        data: {
          stateCode,
          sessionId: (session.data as { id: string }).id,
          answers,
          buildFlags: flags,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `State template updated${r.tickets_created ? ` · ${r.tickets_created} build ticket(s) opened` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["state-template", stateCode] });
      qc.invalidateQueries({ queryKey: ["platform-states"] });
      navigate({ to: "/dashboard/hive-exec/states/$stateCode", params: { stateCode } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Complete failed"),
  });

  function setFieldValue(field: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [step.key]: { ...(prev[step.key] ?? {}), [field]: value },
    }));
  }

  function toggleFlag(field: string, label: string) {
    const id = makeFlagId(step.key, field);
    setFlags((prev) => {
      const existing = prev.find((f) => f.id === id);
      if (existing) return prev.filter((f) => f.id !== id);
      return [
        ...prev,
        {
          id,
          section: step.title,
          field: label,
          note: `${step.title} → ${label}: requires platform build (state ${stateCode}).`,
          severity: "medium",
        },
      ];
    });
  }

  function updateFlagNote(id: string, note: string) {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, note } : f)));
  }

  const stepFlagged = useMemo(
    () => new Set(flags.filter((f) => f.id.startsWith(`${step.key}.`)).map((f) => f.id)),
    [flags, step.key],
  );

  if (session.isLoading || !session.data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading onboarding session…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard/hive-exec/states/$stateCode"
          params={{ stateCode }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to state
        </Link>
        <h2 className="font-display text-lg font-semibold">
          {stateCode} — New State Onboarding
        </h2>
        <span className="text-xs text-muted-foreground">
          Step {stepIdx + 1} / {totalSteps}
        </span>
      </div>

      <header className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#0f1b3d] to-[#1a2a5a] p-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#d97a1c]">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#fed7aa]">
              HIVE Executive · State template build
            </div>
            <h3 className="font-display text-base font-semibold">
              Build the {stateCode} template
            </h3>
            <p className="mt-1 max-w-3xl text-xs text-[#fed7aa]">
              Done once per state. Answers configure terminology, codes, training, EVV, and required docs.
              Flag any answer that requires a platform build — those open HIVE NECTAR tickets on complete.
            </p>
          </div>
        </div>
      </header>

      {/* Step nav */}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {ONBOARDING_SECTIONS.map((s, i) => {
          const flaggedHere = flags.some((f) => f.id.startsWith(`${s.key}.`));
          return (
            <button
              key={s.key}
              onClick={() => setStepIdx(i)}
              className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
                i === stepIdx
                  ? "bg-[#0f1b3d] text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-mono">{i + 1}</span> {s.title}
              {flaggedHere ? <Flag className="h-3 w-3 text-[#d97a1c]" /> : null}
            </button>
          );
        })}
      </nav>

      {/* Current step */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-display text-base font-semibold">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.blurb}</p>

        <div className="mt-4 space-y-4">
          {step.fields.map((f) => (
            <FieldRow
              key={f.key}
              field={f}
              value={answers[step.key]?.[f.key] ?? ""}
              onChange={(v) => setFieldValue(f.key, v)}
              flagged={stepFlagged.has(makeFlagId(step.key, f.key))}
              onToggleFlag={() => toggleFlag(f.key, f.label)}
              flag={flags.find((x) => x.id === makeFlagId(step.key, f.key))}
              onUpdateFlagNote={(note) => updateFlagNote(makeFlagId(step.key, f.key), note)}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium disabled:opacity-50 hover:bg-muted"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>
          </div>
          {isLast ? (
            <button
              type="button"
              onClick={() => complete.mutate()}
              disabled={complete.isPending}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#0f1b3d] px-4 text-sm font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete onboarding & build template
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(totalSteps - 1, i + 1))}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-sm font-semibold text-white hover:bg-[#1a2a5a]"
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* Build-needs summary */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Wrench className="h-4 w-4 text-[#d97a1c]" />
          Flagged build needs ({flags.length})
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These items can't be handled by template configuration alone. Completing onboarding opens
          a HIVE NECTAR ticket for each one so the structural work is tracked.
        </p>
        {flags.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            No build needs flagged yet. Flag any answer that the current platform structure can't represent.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className="rounded-md border border-[#fed7aa] bg-[#fff7ed] p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#0f1b3d]">
                      {f.section} · {f.field}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      ticket-key: state-onboarding:{stateCode}:{f.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlags((prev) => prev.filter((x) => x.id !== f.id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  className="mt-2 min-h-[60px] w-full rounded border border-border bg-background p-2 font-sans text-xs"
                  value={f.note}
                  onChange={(e) => updateFlagNote(f.id, e.target.value)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  flagged,
  onToggleFlag,
  flag,
  onUpdateFlagNote,
}: {
  field: OnboardingField;
  value: string;
  onChange: (v: string) => void;
  flagged: boolean;
  onToggleFlag: () => void;
  flag: BuildFlag | undefined;
  onUpdateFlagNote: (note: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <label className="block text-sm font-medium text-foreground">
          {field.label}
          {field.buildSensitive ? (
            <span className="ml-2 inline-block rounded-full bg-[#fed7aa] px-2 py-0.5 text-[10px] font-medium text-[#7c2d12]">
              build-sensitive
            </span>
          ) : null}
        </label>
        <button
          type="button"
          onClick={onToggleFlag}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
            flagged
              ? "border-[#d97a1c] bg-[#fff7ed] text-[#7c2d12]"
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <Flag className="h-3 w-3" />
          {flagged ? "Build needed" : "Flag as build need"}
        </button>
      </div>
      {field.help ? (
        <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
      ) : null}
      {field.type === "textarea" || field.type === "list" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="mt-2 min-h-[88px] w-full rounded border border-border bg-card p-2 font-mono text-xs"
        />
      ) : field.type === "number" ? (
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={field.placeholder}
          className="mt-2 min-h-[40px] w-full rounded border border-border bg-card px-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="mt-2 min-h-[40px] w-full rounded border border-border bg-card px-2 text-sm"
        />
      )}
      {flagged && flag ? (
        <div className="mt-2 rounded-md border border-[#fed7aa] bg-[#fff7ed] p-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[#7c2d12]">
            Build need note (becomes ticket detail)
          </div>
          <textarea
            value={flag.note}
            onChange={(e) => onUpdateFlagNote(e.target.value)}
            className="mt-1 min-h-[48px] w-full rounded border border-border bg-background p-2 text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}
