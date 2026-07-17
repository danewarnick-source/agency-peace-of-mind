import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Skull, ShieldAlert, Sparkles, X, Loader2, ShieldCheck, Mic, MicOff, Wand2,
} from "lucide-react";
import { createIncident } from "@/lib/incidents.functions";
import { draftIncidentNarrative, reviewIncidentReport } from "@/lib/ai-coach.functions";
import {
  INCIDENT_CATEGORIES, ABUSE_CATEGORY, FATALITY_CATEGORY, type IncidentCategory,
} from "./incident-categories";
import {
  DETAIL_BLOCKS, detailKeyForCategory, type DetailField,
  APS_HOTLINE, INJURY_CATEGORY_NAME, MEDICAL_EMERGENCY_CATEGORY_NAME,
} from "@/lib/incident-detail-schemas";
import { scanNarrativeForCategories, type NarrativeCategoryHit } from "@/lib/nectar-triggers";
import {
  validateNarrative, validatePersonName, validateRequiredText, findContradictions,
  validateAddress, validateDateLogic,
} from "@/lib/nectar-quality";
import { useCaseload } from "@/hooks/use-caseload";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string | null;
  clientName?: string;
  defaultDiscoveredAt?: string;
  triggeredByNoteId?: string | null;
  triggeredByNoteType?: string | null;
  onSubmitted?: (incidentId: string) => void;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Detail block renderer ────────────────────────────────────────────────

function FieldRenderer({
  field, value, onChange, onUploadPhoto, photoUploading,
}: {
  field: DetailField;
  value: unknown;
  onChange: (v: unknown) => void;
  onUploadPhoto?: (files: FileList) => Promise<void>;
  photoUploading?: boolean;
}) {
  const labelEl = (
    <Label className="text-xs">
      {field.label}{("required" in field && field.required) ? " *" : ""}
    </Label>
  );
  switch (field.type) {
    case "text":
      return (<div>{labelEl}<Input value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} /></div>);
    case "textarea":
      return (<div>{labelEl}<Textarea rows={field.rows ?? 3} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} /></div>);
    case "datetime":
      return (<div>{labelEl}<Input type="datetime-local" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} /></div>);
    case "select":
      return (
        <div>{labelEl}
          <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
            <SelectTrigger><SelectValue placeholder="Pick one…" /></SelectTrigger>
            <SelectContent>{field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    case "yesno":
    case "yesno_na": {
      const opts = field.type === "yesno_na" ? ["Yes", "No", "N/A"] : ["Yes", "No"];
      return (
        <div>{labelEl}
          <div className="mt-1 flex flex-wrap gap-2">
            {opts.map((o) => (
              <Button key={o} type="button" size="sm" variant={value === o ? "default" : "outline"} onClick={() => onChange(o)}>{o}</Button>
            ))}
          </div>
        </div>
      );
    }
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>{labelEl}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {field.options.map((o) => {
              const active = selected.includes(o);
              return (
                <button key={o} type="button"
                  onClick={() => {
                    const next = active ? selected.filter((s) => s !== o) : [...selected, o];
                    onChange(next);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "photos": {
      const photos = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>{labelEl}
          <div className="mt-1 space-y-2">
            <input type="file" accept="image/*" multiple disabled={photoUploading}
              onChange={(e) => { if (e.target.files?.length) onUploadPhoto?.(e.target.files); e.currentTarget.value = ""; }}
              className="block w-full text-xs" />
            {photoUploading && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>
            )}
            {photos.length > 0 && (
              <ul className="space-y-1 text-[11px]">
                {photos.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2 py-1">
                    <span className="truncate font-mono">{p.split("/").pop()}</span>
                    <button type="button" className="text-rose-600 hover:underline" onClick={() => onChange(photos.filter((x) => x !== p))}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }
  }
}

function ApsNotice() {
  return (
    <div className="rounded-md border-2 border-rose-500 bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
      <p className="flex items-start gap-2 font-semibold">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        APS reporting is non-delegable
      </p>
      <p className="mt-1 leading-relaxed">
        Utah law requires the person with direct knowledge to <strong>personally</strong>{" "}
        report suspected abuse, neglect, or exploitation of a vulnerable adult to Adult
        Protective Services — this duty cannot be delegated.
      </p>
      <p className="mt-1">APS intake: <span className="font-mono font-semibold">{APS_HOTLINE}</span></p>
    </div>
  );
}

function missingRequired(block: { fields: DetailField[] }, values: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const f of block.fields) {
    if (!("required" in f) || !f.required) continue;
    const v = values[f.name];
    if (f.type === "multiselect") { if (!Array.isArray(v) || v.length === 0) missing.push(f.label); }
    else if (typeof v === "string") { if (!v.trim()) missing.push(f.label); }
    else if (v === undefined || v === null) { missing.push(f.label); }
  }
  return missing;
}

// ─── 10-second AI race helper — AI downtime must NEVER block an IR ────────
const AI_TIMEOUT_MS = 20_000;
async function withAiTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("__AI_TIMEOUT__")), AI_TIMEOUT_MS)),
  ]);
}

type AiIssue = {
  field: string | null;
  severity: "must_fix" | "should_add";
  question: string;
  answer_type?: "yes_no" | "text";
  answer?: string | null;
  not_applicable_reason?: string | null;
};

// ─── Main dialog ─────────────────────────────────────────────────────────

export function IncidentReportDialog({
  open, onOpenChange, clientId, clientName, defaultDiscoveredAt,
  triggeredByNoteId, triggeredByNoteType, onSubmitted,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { data: caseload = [] } = useCaseload();
  const createFn = useServerFn(createIncident);
  const draftFn = useServerFn(draftIncidentNarrative);
  const reviewFn = useServerFn(reviewIncidentReport);
  const { can } = usePermissions();
  const canManageIncidents = can("manage_incidents");

  const initialDiscovered = useMemo(
    () => toLocalInput(defaultDiscoveredAt ?? new Date().toISOString()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultDiscoveredAt, open],
  );

  const [pickedClientId, setPickedClientId] = useState<string>(clientId ?? "");
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [discoveredAt, setDiscoveredAt] = useState<string>(initialDiscovered);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<IncidentCategory | "">("");
  const [description, setDescription] = useState("");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [injuries, setInjuries] = useState("");
  const [medicalAttention, setMedicalAttention] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [preventionStrategies, setPreventionStrategies] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [witnessedDirectly, setWitnessedDirectly] = useState<"yes" | "no" | "">("");
  const [reportedBy, setReportedBy] = useState("");

  const [details, setDetails] = useState<Record<string, unknown>>({});

  // ── Nectar narrative drafter ───────────────────────────────────────────
  const [shorthand, setShorthand] = useState("");
  const [nectarDraft, setNectarDraft] = useState<string | null>(null);
  // Draft gaps gate "Use this draft". They come from draftFn (shorthand
  // expansion), not reviewFn, so they stay separate from the narrative review.
  const [nectarDraftGaps, setNectarDraftGaps] = useState<Array<{
    field: string; severity: "must_fix" | "should_add"; question: string; answer_type?: "yes_no" | "text";
  }>>([]);
  const [gapAnswers, setGapAnswers] = useState<Record<number, string>>({});
  const [gapNA, setGapNA] = useState<Record<number, string>>({});
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftSkipped, setDraftSkipped] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── UNIFIED Nectar follow-up system ────────────────────────────────────
  // One list of questions and one answer map shared by:
  //   • the narrative step's in-step "Review with NECTAR" section
  //   • the nectar-interview wizard steps (nectar-q-*)
  //   • the submit gate and the persisted record
  //
  // When runNectarReview re-runs (draft accepted, description edited + re-reviewed),
  // answers from the old list AND from draft-gap step are carried over by
  // matching question text, so nothing already answered ever shows as unanswered.
  const [nectarIssues, setNectarIssues] = useState<AiIssue[] | null>(null);
  const [nectarAnswers, setNectarAnswers] = useState<Record<number, string>>({});
  const [nectarNA, setNectarNA] = useState<Record<number, string>>({});
  // "passed" | "skipped" | "disabled" | null (null = questions exist, not yet answered)
  const [nectarStatus, setNectarStatus] = useState<"passed" | "skipped" | "disabled" | null>(null);
  const [nectarReviewing, setNectarReviewing] = useState(false);
  // Snapshot of the description the last review ran against:
  //   (a) skips redundant back-to-back calls with the same text
  //   (b) drives derived narrativeReviewStatus — idle when description has since changed
  const [lastReviewedDescription, setLastReviewedDescription] = useState<string>("");

  const [completenessIssues, setCompletenessIssues] = useState<AiIssue[] | null>(null);
  const [completenessBusy, setCompletenessBusy] = useState(false);

  const [orgAiEnabled, setOrgAiEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open || !org?.organization_id) return;
    void supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("incident_ai_review_enabled" as any)
      .eq("id", org.organization_id)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { incident_ai_review_enabled?: boolean } | null)?.incident_ai_review_enabled;
        setOrgAiEnabled(v === false ? false : true);
      });
  }, [open, org?.organization_id]);

  const [dismissedTerms, setDismissedTerms] = useState<Set<string>>(new Set());
  const detailKey = detailKeyForCategory(category);
  const block = detailKey ? DETAIL_BLOCKS[detailKey] : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const aiEnabled = orgAiEnabled !== false;

  // ── Derived narrative-step review status ────────────────────────────────
  // Computed from unified state so it automatically goes back to "idle"
  // whenever description changes since the last review — no separate
  // invalidation effect needed.
  const narrativeReviewStatus = useMemo(() => {
    if (nectarReviewing) return "reviewing" as const;
    if (!lastReviewedDescription || description.trim() !== lastReviewedDescription) return "idle" as const;
    if (nectarStatus === "skipped") return "skipped" as const;
    if (nectarIssues !== null && nectarIssues.length === 0) return "passed" as const;
    if (nectarIssues !== null && nectarIssues.length > 0) return "needs_answers" as const;
    return "idle" as const;
  }, [nectarReviewing, nectarStatus, lastReviewedDescription, description, nectarIssues]);

  // When the staff already ran the in-step review, the downstream
  // nectar-interview wizard steps are redundant — suppress them.
  const narrativeReviewedInStep =
    narrativeReviewStatus === "passed" ||
    narrativeReviewStatus === "needs_answers" ||
    narrativeReviewStatus === "skipped";

  // ─── Step keys ────────────────────────────────────────────────────────
  const stepKeys = useMemo<string[]>(() => {
    const base: string[] = ["who-when", "witnessed", "where-what", "narrative"];
    if (block) base.push("details");
    base.push("people");
    if (category !== INJURY_CATEGORY_NAME && category !== MEDICAL_EMERGENCY_CATEGORY_NAME) {
      base.push("injuries");
    }
    base.push("actions");
    if (aiEnabled && !narrativeReviewedInStep) base.push("nectar-interview");
    if (aiEnabled && !narrativeReviewedInStep && nectarIssues) {
      nectarIssues.forEach((_, i) => base.push(`nectar-q-${i}`));
    }
    base.push("review");
    return base;
  }, [block, aiEnabled, nectarIssues, narrativeReviewedInStep, category]);

  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const lastStep = stepKeys.length - 1;
  const reviewStepIndex = lastStep;
  const currentKey = stepKeys[Math.min(step, lastStep)];

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setPickedClientId(clientId ?? "");
    setOccurredAt(""); setDiscoveredAt(initialDiscovered);
    setLocation(""); setCategory(""); setDescription("");
    setPeopleInvolved(""); setWitnesses(""); setInjuries("");
    setMedicalAttention(""); setImmediateActions(""); setPreventionStrategies("");
    setWitnessedDirectly(""); setReportedBy("");
    setDetails({}); setDismissedTerms(new Set()); setSubmitted(false);
    setShorthand(""); setNectarDraft(null); setNectarDraftGaps([]);
    setGapAnswers({}); setGapNA({}); setDraftSkipped(false); setDraftBusy(false);
    setNectarIssues(null); setNectarAnswers({}); setNectarNA({});
    setNectarStatus(null); setNectarReviewing(false); setLastReviewedDescription("");
    setCompletenessIssues(null); setCompletenessBusy(false);
    setStep(0); setStepError(null);
  }, [open, clientId, initialDiscovered]);

  const isAbuse = category === ABUSE_CATEGORY;
  const isFatality = category === FATALITY_CATEGORY;

  const knownAddresses = useMemo(() => {
    return caseload.map((c) => (c as { physical_address?: string | null }).physical_address ?? "").filter(Boolean) as string[];
  }, [caseload]);

  const narrativeHits = useMemo<NarrativeCategoryHit[]>(
    () => scanNarrativeForCategories(description), [description],
  );
  const liveNudges = useMemo(() => {
    const out: NarrativeCategoryHit[] = [];
    for (const h of narrativeHits) {
      if (dismissedTerms.has(h.term)) continue;
      if (detailKey === h.categoryKey) {
        const targetBlock = DETAIL_BLOCKS[h.categoryKey];
        const hasAny = targetBlock.fields
          .filter((f) => "required" in f && f.required)
          .some((f) => {
            const v = details[f.name];
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === "string") return v.trim().length > 0;
            return v !== undefined && v !== null;
          });
        if (hasAny) continue;
      }
      out.push(h);
    }
    return out;
  }, [narrativeHits, dismissedTerms, detailKey, details]);

  const resolvedClientName = useMemo(() => {
    if (clientName && pickedClientId === clientId) return clientName;
    const c = caseload.find((x) => x.id === pickedClientId);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "";
  }, [caseload, pickedClientId, clientId, clientName]);

  // Fetch the picked client's guardian status so the NECTAR follow-up N/A
  // button can auto-satisfy guardian-notification questions when the client
  // is their own guardian.
  const [clientIsOwnGuardian, setClientIsOwnGuardian] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open || !pickedClientId) { setClientIsOwnGuardian(null); return; }
    let cancelled = false;
    void supabase
      .from("clients")
      .select("is_own_guardian")
      .eq("id", pickedClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setClientIsOwnGuardian(data?.is_own_guardian ?? null);
      });
    return () => { cancelled = true; };
  }, [open, pickedClientId]);

  // ── Photo upload
  const [photoUploading, setPhotoUploading] = useState(false);
  async function uploadPhotos(files: FileList) {
    if (!org?.organization_id || !user?.id) {
      toast.error("Cannot upload photos until your session and org are loaded."); return;
    }
    setPhotoUploading(true);
    try {
      const current = Array.isArray(details.photos) ? (details.photos as string[]) : [];
      const next = [...current];
      for (const file of Array.from(files)) {
        const ts = Date.now();
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${org.organization_id}/${pickedClientId || "unassigned"}/${ts}_${safe}`;
        const { error } = await supabase.storage.from("incident-photos")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
        next.push(path);
      }
      setDetails((d) => ({ ...d, photos: next }));
    } finally { setPhotoUploading(false); }
  }

  // ── Voice (Speak shorthand)
  function stopRecording() {
    try { recognitionRef.current?.stop?.(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setIsRecording(false);
  }
  function startRecording() {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input isn't supported on this browser."); return; }
    try {
      const rec = new SR();
      rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        }
        if (finalText) setShorthand((prev) => (prev ? prev.trim() + " " : "") + finalText.trim());
      };
      rec.onerror = () => stopRecording();
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
      rec.start(); setIsRecording(true);
    } catch { toast.error("Couldn't start voice input — please type instead."); }
  }

  // ── Draft with Nectar
  async function runDraftWithNectar() {
    const text = shorthand.trim();
    if (text.length < 3) {
      toast.error("Add a few words of shorthand first (e.g. 'client hit roommate, cops came, arrested')."); return;
    }
    stopRecording();
    setDraftBusy(true);
    try {
      const res = await withAiTimeout(draftFn({
        data: {
          shorthand: text,
          category: category || "",
          clientName: resolvedClientName || "the individual",
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
          discoveredAt: discoveredAt ? new Date(discoveredAt).toISOString() : null,
          knownFacts: [
            location ? `Location: ${location}` : "",
            witnessedDirectly === "no" && reportedBy ? `Reported by: ${reportedBy}` : "",
          ].filter(Boolean).join(" | ") || null,
        },
      }));
      setNectarDraft(res.draft);
      setNectarDraftGaps(res.gaps ?? []);
      setGapAnswers({}); setGapNA({});
      setDraftSkipped(false);
    } catch (e) {
      setDraftSkipped(true);
      setNectarDraftGaps([]);
      setDetails((d) => ({ ...d, ai_review_skipped: true }));
      toast.error(
        (e as Error).message === "__AI_TIMEOUT__"
          ? "Nectar didn't respond in 20s — write the narrative manually. Submission won't be blocked."
          : "Nectar draft unavailable — write the narrative manually. Submission won't be blocked.",
      );
    } finally { setDraftBusy(false); }
  }

  const draftMustFixUnresolved = nectarDraftGaps
    .map((g, i) => ({ g, i }))
    .filter(({ g, i }) => g.severity === "must_fix" && !gapAnswers[i]?.trim());
  const canAcceptDraft = !!nectarDraft && draftMustFixUnresolved.length === 0;

  // Build review payload — used by runNectarReview and runCompletenessCheck
  function buildDraft() {
    return {
      category, description: description.trim(), location,
      occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
      discovered_at: discoveredAt ? new Date(discoveredAt).toISOString() : null,
      people_involved: peopleInvolved, witnesses, injuries,
      medical_attention: medicalAttention, immediate_actions: immediateActions,
      is_abuse_neglect: isAbuse, prevention_strategies: preventionStrategies,
      witnessed_directly: witnessedDirectly === "yes",
      reported_to_reporter_by: witnessedDirectly === "no" ? reportedBy : null,
      details,
      // Pass current answers so re-checks see the enriched picture
      nectar_followups: (nectarIssues ?? []).map((q, i) => ({
        question: q.question,
        severity: q.severity,
        answer: nectarAnswers[i]?.trim() || null,
        not_applicable_reason: nectarNA[i]?.trim() || null,
      })),
    };
  }

  // ── UNIFIED Nectar review runner ─────────────────────────────────────────
  // Single function called from all three entry points:
  //   • "Review with NECTAR" button on the narrative step
  //   • acceptNectarDraft() — eager review right after draft is accepted
  //   • nectar-interview step useEffect — fallback path
  //
  // Guard: if the description hasn't changed since the last successful review
  // AND issues are already populated, skip the redundant call.
  //
  // Answer merging: when the question list changes on re-run, carry over answers
  // from (1) the previous nectarIssues list and (2) draft-gap answers, matched
  // by question text. Nothing answered at any earlier point shows as unanswered.
  async function runNectarReview(descriptionOverride?: string, isCancelled?: () => boolean) {
    if (!aiEnabled) return;
    const text = (descriptionOverride !== undefined ? descriptionOverride : description).trim();
    // Skip if description is unchanged and we already have results
    if (text === lastReviewedDescription && nectarIssues !== null) return;

    // Capture state before the async gap so the merge below sees consistent values
    const prevIssues = nectarIssues;
    const prevAnswers = nectarAnswers;
    const prevNA = nectarNA;

    setNectarReviewing(true);
    try {
      const base = buildDraft();
      const draft = descriptionOverride !== undefined
        ? { ...base, description: descriptionOverride.trim() }
        : base;
      const r = await withAiTimeout(reviewFn({ data: { draft } }));
      if (isCancelled?.()) return;
      if (!r || typeof r.complete !== "boolean" || r.skipped) {
        setNectarIssues([]);
        setNectarStatus("skipped");
        setLastReviewedDescription(text);
        setDetails((d) => ({ ...d, ai_review_skipped: true }));
        return;
      }
      const newIssues = Array.isArray(r.issues) ? (r.issues as AiIssue[]) : [];

      // Merge: for each new question, look for an existing answer in the
      // previous review results or in the draft-gap step, matched by text.
      const mergedAnswers: Record<number, string> = {};
      const mergedNA: Record<number, string> = {};
      newIssues.forEach((newQ, newIdx) => {
        // 1. Previous narrative / nectar-interview answers
        if (prevIssues) {
          const oldIdx = prevIssues.findIndex((old) => old.question === newQ.question);
          if (oldIdx >= 0) {
            if (prevAnswers[oldIdx]?.trim()) mergedAnswers[newIdx] = prevAnswers[oldIdx];
            if (prevNA[oldIdx] !== undefined) mergedNA[newIdx] = prevNA[oldIdx];
          }
        }
        // 2. Draft-gap answers (given before "Use this draft")
        if (mergedAnswers[newIdx] === undefined) {
          const gapIdx = nectarDraftGaps.findIndex((g) => g.question === newQ.question);
          if (gapIdx >= 0 && gapAnswers[gapIdx]?.trim()) {
            mergedAnswers[newIdx] = gapAnswers[gapIdx];
          }
        }
      });

      setNectarIssues(newIssues);
      setNectarAnswers(mergedAnswers);
      setNectarNA(mergedNA);
      setLastReviewedDescription(text);
      setNectarStatus(newIssues.length === 0 ? "passed" : null);
      // Toast only when staff explicitly clicked the button on the narrative step
      if (newIssues.length === 0 && currentKey === "narrative") {
        toast.success("NECTAR: no follow-ups — you can continue.");
      }
    } catch (e) {
      if (isCancelled?.()) return;
      setNectarIssues([]);
      setNectarStatus("skipped");
      setLastReviewedDescription(text);
      setDetails((d) => ({ ...d, ai_review_skipped: true }));
      toast.message(
        (e as Error).message === "__AI_TIMEOUT__"
          ? "Nectar didn't respond in 20s — you can continue."
          : "Nectar review unavailable — you can continue.",
      );
    } finally {
      if (!isCancelled?.()) setNectarReviewing(false);
    }
  }

  async function acceptNectarDraft() {
    if (!nectarDraft) return;
    if (draftMustFixUnresolved.length > 0) {
      toast.error("Answer every required follow-up below before using this draft.");
      return;
    }
    const answeredFacts = nectarDraftGaps
      .map((g, i) => {
        const ans = gapAnswers[i]?.trim();
        if (!ans) return null;
        return `${g.question} → ${ans}`;
      })
      .filter((s): s is string => !!s);

    const baseFacts = [
      location ? `Location: ${location}` : "",
      witnessedDirectly === "no" && reportedBy ? `Reported by: ${reportedBy}` : "",
      ...answeredFacts,
    ].filter(Boolean).join(" | ");

    setDraftBusy(true);
    let composed = nectarDraft;
    try {
      const res = await withAiTimeout(draftFn({
        data: {
          shorthand: shorthand.trim(),
          category: category || "",
          clientName: resolvedClientName || "the individual",
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
          discoveredAt: discoveredAt ? new Date(discoveredAt).toISOString() : null,
          knownFacts: baseFacts || null,
        },
      }));
      composed = res.draft;
      setNectarDraft(res.draft);
    } catch {
      const appended = nectarDraftGaps
        .map((g, i) => {
          const ans = gapAnswers[i]?.trim();
          return ans ? `Q: ${g.question}\nA: ${ans}` : null;
        })
        .filter((s): s is string => !!s);
      composed = appended.length ? `${nectarDraft}\n\n${appended.join("\n\n")}` : nectarDraft;
    } finally {
      setDraftBusy(false);
    }

    setDescription(composed);
    setDetails((d) => ({
      ...d,
      nectar_draft_followups: nectarDraftGaps
        .filter((g) => g.severity === "must_fix")
        .map((g, i) => ({
          field: g.field,
          severity: g.severity,
          question: g.question,
          answer: gapAnswers[i]?.trim() || null,
        })),
    }));
    toast.success("Draft re-generated with your answers — edit it before continuing.");
    // Run the unified review. Pass composed so reviewFn sees the new text
    // even before the description setState has flushed (React batches above).
    void runNectarReview(composed);
  }

  // ── Per-step validation
  function validateStep(key: string): string | null {
    if (key.startsWith("nectar-q-")) {
      const idx = Number(key.slice("nectar-q-".length));
      const q = nectarIssues?.[idx];
      if (!q) return null;
      if (q.severity !== "must_fix") return null;
      const ans = nectarAnswers[idx]?.trim();
      const na = nectarNA[idx]?.trim();
      if (!ans && !na) return "Answer this question or mark it N/A with a reason — Nectar generated it from what you wrote.";
      return null;
    }
    switch (key) {
      case "who-when": {
        if (!pickedClientId) return "Pick the individual involved.";
        if (!discoveredAt) return "Record when you DISCOVERED this — drives the 24-hour clock.";
        const dErr = validateDateLogic(occurredAt || null, discoveredAt || null);
        if (dErr) return dErr;
        return null;
      }
      case "witnessed":
        if (witnessedDirectly === "") return "Tell us whether you witnessed this directly.";
        if (witnessedDirectly === "no") {
          const nameErr = validatePersonName(reportedBy);
          if (nameErr) return `Who reported it? ${nameErr}`;
        }
        return null;
      case "where-what": {
        if (!category) return "Pick an incident category.";
        const aErr = validateAddress(location, knownAddresses);
        if (aErr) return aErr;
        return null;
      }
      case "narrative": {
        const nErr = validateNarrative(description);
        if (nErr) return nErr;
        if (!aiEnabled) return null;
        if (narrativeReviewStatus === "idle") {
          return "Click 'Review with NECTAR' below — NECTAR has to check the narrative before you can continue.";
        }
        if (narrativeReviewStatus === "reviewing") {
          return "Nectar is still reviewing — give it a moment.";
        }
        if (narrativeReviewStatus === "needs_answers") {
          const unresolved = (nectarIssues ?? [])
            .map((g, i) => ({ g, i }))
            .filter(({ g, i }) => g.severity === "must_fix"
              && !nectarAnswers[i]?.trim()
              && nectarNA[i] === undefined);
          if (unresolved.length) {
            return "Answer every required NECTAR follow-up before continuing.";
          }
        }
        return null;
      }
      case "details": {
        if (!block) return null;
        const missing = missingRequired(block, details);
        if (missing.length) return `Complete the ${block.title.toLowerCase()}: ${missing.join(", ")}.`;
        if (detailKey === "behavior" && details.restraintUsed === "Yes") {
          const need: string[] = [];
          if (!String(details.holdType ?? "").trim()) need.push("type of hold");
          if (!String(details.restraintDuration ?? "").trim()) need.push("restraint duration");
          if (!String(details.restraintAuthorizedBy ?? "").trim()) need.push("authorized by");
          if (need.length) return `Restraint was used — also record: ${need.join(", ")}.`;
        }
        return null;
      }
      case "people": {
        const err = validatePersonName(peopleInvolved);
        if (err) return `People involved: ${err}`;
        return null;
      }
      case "injuries": {
        const e1 = validateRequiredText(injuries, 10);
        if (e1) return `Injuries: ${e1}`;
        const e2 = validateRequiredText(medicalAttention, 10);
        if (e2) return `Medical attention: ${e2}`;
        return null;
      }
      case "actions": {
        const e1 = validateRequiredText(immediateActions, 20);
        if (e1) return `Immediate actions: ${e1}`;
        if (isAbuse) {
          const e2 = validateRequiredText(preventionStrategies, 20);
          if (e2) return `Prevention strategies (§1.27(3)): ${e2}`;
        }
        return null;
      }
      case "nectar-interview":
        if (nectarReviewing) return "Nectar is still reviewing — give it a moment.";
        return null;
      default:
        return null;
    }
  }

  function handleNext() {
    const err = validateStep(currentKey);
    if (err) { setStepError(err); return; }
    setStepError(null);
    // On the narrative step: fold answered must-fix follow-ups into the
    // description and stash structured Q&A on details.
    if (currentKey === "narrative"
        && narrativeReviewStatus === "needs_answers"
        && nectarIssues?.some((g) => g.severity === "must_fix")) {
      const answered = (nectarIssues ?? [])
        .map((g, i) => {
          if (g.severity !== "must_fix") return null;
          const ans = nectarAnswers[i]?.trim();
          const na = nectarNA[i];
          if (ans) return `Q: ${g.question}\nA: ${ans}`;
          if (na !== undefined) return `Q: ${g.question}\nA: N/A — ${na?.trim() || "not applicable"}`;
          return null;
        })
        .filter((s): s is string => !!s);
      if (answered.length) {
        const composed = `${description.trim()}\n\nStaff follow-up answers:\n${answered.join("\n\n")}`;
        setDescription(composed);
        // Keep lastReviewedDescription in sync so the description change
        // doesn't flip narrativeReviewStatus back to "idle".
        setLastReviewedDescription(composed.trim());
      }
      setDetails((d) => ({
        ...d,
        nectar_narrative_followups: (nectarIssues ?? [])
          .filter((g) => g.severity === "must_fix")
          .map((g, i) => ({
            field: g.field,
            severity: g.severity,
            question: g.question,
            answer: nectarAnswers[i]?.trim() || null,
            not_applicable: nectarNA[i] !== undefined,
            not_applicable_reason: nectarNA[i] ?? null,
          })),
      }));
    }
    setStep((s) => Math.min(lastStep, s + 1));
  }

  // ── nectar-interview step: run unified review when entering the step.
  // The guard inside runNectarReview prevents a redundant call if
  // acceptNectarDraft already ran the review against the current description.
  useEffect(() => {
    if (currentKey !== "nectar-interview") return;
    if (!aiEnabled) return;
    let cancelled = false;
    void runNectarReview(undefined, () => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, aiEnabled]);

  // ── Completeness check on the review step
  async function runCompletenessCheck() {
    setCompletenessBusy(true);
    try {
      const draft = buildDraft();
      const r = await withAiTimeout(reviewFn({ data: { draft } }));
      if (!r || typeof r.complete !== "boolean" || r.skipped) {
        setCompletenessIssues([]); setNectarStatus("skipped");
        setDetails((d) => ({ ...d, ai_review_skipped: true }));
        toast.message("Nectar review unavailable — submitting with standard checks.");
        return;
      }
      const issues = Array.isArray(r.issues) ? (r.issues as AiIssue[]) : [];
      setCompletenessIssues(issues);
      if (issues.length === 0) toast.success("NECTAR: no remaining gaps.");
      else toast.warning(`NECTAR found ${issues.length} remaining item(s) to address.`);
    } catch {
      setCompletenessIssues([]); setNectarStatus("skipped");
      setDetails((d) => ({ ...d, ai_review_skipped: true }));
      toast.message("Nectar didn't respond in 20s — you can still submit.");
    } finally {
      setCompletenessBusy(false);
    }
  }


  const contradictions = useMemo(
    () => (currentKey === "review" ? findContradictions(buildDraft()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentKey, description, peopleInvolved, witnesses, injuries, medicalAttention, immediateActions],
  );

  // Single unified must-fix check — both in-step review and nectar-interview
  // wizard steps write to nectarAnswers/nectarNA, so this covers all paths.
  const unresolvedMustFix = (nectarIssues ?? [])
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => q.severity === "must_fix" && !(nectarAnswers[i]?.trim() || nectarNA[i]?.trim()));
  const completenessMustFix = (completenessIssues ?? []).filter((q) => q.severity === "must_fix");
  const submitBlocked =
    contradictions.length > 0 ||
    nectarReviewing || completenessBusy ||
    (nectarStatus !== "skipped" && nectarStatus !== "disabled" && unresolvedMustFix.length > 0) ||
    (nectarStatus !== "skipped" && nectarStatus !== "disabled" && completenessMustFix.length > 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (!canManageIncidents) throw new Error("You don't have permission to report incidents.");
      if (!pickedClientId) throw new Error("Pick the individual involved.");
      if (!category) throw new Error("Pick an incident category.");

      const aErr = validateAddress(location, knownAddresses);
      if (aErr) throw new Error(aErr);
      const dErr = validateDateLogic(occurredAt || null, discoveredAt || null);
      if (dErr) throw new Error(dErr);

      if (witnessedDirectly === "") throw new Error("Tell us whether you witnessed this directly.");
      if (witnessedDirectly === "no" && reportedBy.trim().length < 2) throw new Error("Who reported this to you?");
      if (isAbuse && preventionStrategies.trim().length < 5) throw new Error("Abuse / neglect / exploitation requires prevention strategies (§1.27(3)).");

      if (block) {
        const missing = missingRequired(block, details);
        if (missing.length) throw new Error(`Complete the ${block.title.toLowerCase()}: ${missing.join(", ")}.`);
      }

      let restraintFlag = false;
      if (detailKey === "behavior" && details.restraintUsed === "Yes") {
        restraintFlag = true;
        const need: string[] = [];
        if (!String(details.holdType ?? "").trim()) need.push("type of hold");
        if (!String(details.restraintDuration ?? "").trim()) need.push("restraint duration");
        if (!String(details.restraintAuthorizedBy ?? "").trim()) need.push("authorized by");
        if (need.length) throw new Error(`Restraint was used — also record: ${need.join(", ")}.`);
      }

      let apsNotifiedAt: string | null = null;
      let apsNotifiedBy: string | null = null;
      let apsReference: string | null = null;
      if (isAbuse) {
        const status = String(details.apsNotifiedStatus ?? "");
        if (status === "Yes") {
          if (!String(details.apsNotifiedBy ?? "").trim()) throw new Error("Record who notified APS (must be the person with direct knowledge).");
          if (!String(details.apsNotifiedAt ?? "").trim()) throw new Error("Record the APS notification date/time.");
          apsNotifiedBy = String(details.apsNotifiedBy);
          apsNotifiedAt = new Date(String(details.apsNotifiedAt)).toISOString();
          apsReference = String(details.apsReference ?? "").trim() || null;
        }
      }

      const discoveredIso = new Date(discoveredAt).toISOString();
      const occurredIso = occurredAt ? new Date(occurredAt).toISOString() : null;

      let finalStatus: "passed" | "answered" | "skipped" | "disabled";
      let finalIssues: AiIssue[] | null = null;
      if (orgAiEnabled === false) finalStatus = "disabled";
      else if (nectarStatus === "skipped") finalStatus = "skipped";
      else {
        const issues = nectarIssues ?? [];
        if (unresolvedMustFix.length > 0) throw new Error("__AI_REVIEW_PENDING__");
        finalStatus = issues.length === 0 ? "passed" : "answered";
        finalIssues = issues.map((q, i) => ({
          ...q,
          answer: nectarAnswers[i]?.trim() || null,
          not_applicable_reason: nectarNA[i]?.trim() || null,
        }));
      }

      const aiSkipped = finalStatus === "skipped" || draftSkipped;
      const detailsOut: Record<string, unknown> = {
        ...details,
        nectar_followups: finalIssues ?? [],
      };
      if (aiSkipped) detailsOut.ai_review_skipped = true;

      return createFn({
        data: {
          client_id: pickedClientId,
          occurred_at: occurredIso,
          discovered_at: discoveredIso,
          location: location.trim() || null,
          category,
          description: description.trim(),
          people_involved: peopleInvolved.trim() || null,
          witnesses: witnesses.trim() || null,
          injuries: injuries.trim() || null,
          medical_attention: medicalAttention.trim() || null,
          immediate_actions: immediateActions.trim() || null,
          is_abuse_neglect: isAbuse,
          prevention_strategies: isAbuse ? preventionStrategies.trim() : null,
          is_fatality: isFatality,
          triggered_by_note_id: triggeredByNoteId ?? null,
          triggered_by_note_type: triggeredByNoteType ?? null,
          details: detailsOut,
          witnessed_directly: witnessedDirectly === "yes",
          reported_to_reporter_by: witnessedDirectly === "no" ? reportedBy.trim() : null,
          restraint_used: restraintFlag,
          aps_notified_at: apsNotifiedAt,
          aps_notified_by: apsNotifiedBy,
          aps_reference: apsReference,
          ai_review_status: finalStatus,
          ai_review_issues: finalIssues,
        },
      });
    },
    onSuccess: (res) => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident-trends"] });
      qc.invalidateQueries({ queryKey: ["incident-submitted-for"] });
      toast.success(`Incident filed (${res?.report_number ?? ""}). Your supervisor has been notified.`);
      onSubmitted?.(res!.id);
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg === "__AI_REVIEW_PENDING__") return;
      toast.error(msg ?? "Could not file incident.");
    },
  });

  // Renders a nectar-q-* wizard step (fallback for users who skip in-step review)
  function renderQuestionStep(idx: number) {
    const q = nectarIssues?.[idx];
    if (!q) return null;
    const answered = !!(nectarAnswers[idx]?.trim() || nectarNA[idx]?.trim());
    const isGuardianQ = /guardian|authorized rep(resentative)?/i.test(q.question);
    const ownGuardianApplies = isGuardianQ && clientIsOwnGuardian === true;
    const clientFirst = (resolvedClientName || "").split(/\s+/)[0] || "the client";
    const naActive = nectarNA[idx] !== undefined;
    const naLabel = ownGuardianApplies
      ? `Not applicable — ${clientFirst} is their own guardian`
      : "Mark N/A";
    const naDefaultReason = ownGuardianApplies
      ? "Client is their own guardian — no separate notification required."
      : "Not applicable";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-semibold">NECTAR follow-up {idx + 1} of {nectarIssues!.length}</span>
          <Badge variant={q.severity === "must_fix" ? "destructive" : "outline"} className="text-[10px]">
            {q.severity === "must_fix" ? "Must answer" : "Suggested"}
          </Badge>
          {answered && <Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-700">Answered</Badge>}
        </div>
        <div className="rounded-md border border-violet-300 bg-violet-50/50 p-3 text-sm dark:bg-violet-950/30 dark:border-violet-800">
          <p className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300">Nectar's question — generated from what you wrote</p>
          <p className="mt-1 font-medium">{q.question}</p>
          {ownGuardianApplies && (
            <p className="mt-2 text-[11px] text-violet-800 dark:text-violet-200">
              {clientFirst} is their own guardian — no guardian notification is required.
            </p>
          )}
        </div>
        <div>
          <Label className="text-xs">Your answer</Label>
          <Textarea
            rows={3}
            value={nectarAnswers[idx] ?? ""}
            onChange={(e) => setNectarAnswers((s) => ({ ...s, [idx]: e.target.value }))}
            disabled={naActive}
            placeholder="Answer in 1–2 sentences."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={naActive ? "default" : "outline"}
            onClick={() => setNectarNA((s) => {
              const next = { ...s };
              if (naActive) delete next[idx];
              else next[idx] = naDefaultReason;
              return next;
            })}
          >
            {naActive ? "Clear N/A" : naLabel}
          </Button>
          {naActive && (
            <Input
              className="h-8 flex-1 min-w-[200px] text-[11px]"
              placeholder="Optional: add a reason"
              value={nectarNA[idx] ?? ""}
              onChange={(e) => setNectarNA((s) => ({ ...s, [idx]: e.target.value }))}
            />
          )}
        </div>
      </div>
    );
  }

  const isQuestionStep = currentKey.startsWith("nectar-q-");
  const questionIdx = isQuestionStep ? Number(currentKey.slice("nectar-q-".length)) : -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Incident Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your supervisor is notified the moment this is submitted. After submit it
            becomes read-only — only an admin/manager edits or closes it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-4 text-sm">
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-semibold">Incident submitted.</p>
              <p className="mt-1 text-xs">
                Your supervisor has been notified. They will start the UPI entry (within
                24 hours of discovery), notify the guardian, and complete the detailed
                UPI report within 5 business days.
              </p>
            </div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-foreground">
                Step {step + 1} of {stepKeys.length}
                <span className="ml-2 font-normal text-muted-foreground">— {currentKey}</span>
              </p>
              <div className="flex gap-1">
                {stepKeys.map((_, i) => (
                  <span key={i} className={`h-1.5 w-5 rounded-full ${i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-muted"}`} />
                ))}
              </div>
            </div>

            <div className="min-h-[260px] space-y-4">
              {currentKey === "who-when" && (
                <div className="space-y-3">
                  {!clientId && (
                    <div>
                      <Label className="text-xs">Individual *</Label>
                      <Select value={pickedClientId} onValueChange={setPickedClientId}>
                        <SelectTrigger><SelectValue placeholder="Pick the individual…" /></SelectTrigger>
                        <SelectContent>
                          {caseload.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {clientId && resolvedClientName && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                      Filing for <strong>{resolvedClientName}</strong>.
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Date/time the incident occurred</Label>
                      <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
                      <p className="mt-1 text-[10px] text-muted-foreground">Leave blank if unknown.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Date/time DISCOVERED *</Label>
                      <Input type="datetime-local" value={discoveredAt} onChange={(e) => setDiscoveredAt(e.target.value)} required />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Drives the 24-hour UPI / guardian and 5-business-day completion clocks.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentKey === "witnessed" && (
                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div>
                    <Label className="text-xs">Did you witness this directly? *</Label>
                    <div className="mt-1 flex gap-2">
                      {(["yes", "no"] as const).map((v) => (
                        <Button key={v} type="button" size="sm"
                          variant={witnessedDirectly === v ? "default" : "outline"}
                          onClick={() => setWitnessedDirectly(v)}>
                          {v === "yes" ? "Yes" : "No — reported to me"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {witnessedDirectly === "no" && (
                    <div>
                      <Label className="text-xs">Who reported it to you? *</Label>
                      <Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)}
                        placeholder="Full name and role (e.g. Maria Lopez, DSP)" />
                    </div>
                  )}
                </div>
              )}

              {currentKey === "where-what" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Location (street address) *</Label>
                    <Input value={location} onChange={(e) => setLocation(e.target.value)}
                      placeholder="House number + street, or pick from known addresses below" />
                    {knownAddresses.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {knownAddresses.slice(0, 6).map((a) => (
                          <button type="button" key={a}
                            onClick={() => setLocation(a)}
                            className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] hover:bg-muted">
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      "Home" / "house" won't pass UPI review — enter a real street address.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Category *</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as IncidentCategory)}>
                      <SelectTrigger><SelectValue placeholder="Pick a category…" /></SelectTrigger>
                      <SelectContent>
                        {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isFatality && (
                    <div className="flex items-start gap-2 rounded-md border-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
                      <Skull className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Fatality — immediate DHHS / §1.26 notifications are required. After you submit, contact the on-call administrator by phone now.</span>
                    </div>
                  )}
                </div>
              )}

              {currentKey === "narrative" && (
                <div className="space-y-3">
                  {aiEnabled && (
                    <div className="rounded-md border-2 border-violet-300 bg-violet-50/60 p-3 dark:bg-violet-950/30 dark:border-violet-800">
                      <div className="mb-2 flex items-center gap-2 text-violet-900 dark:text-violet-100">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-sm font-semibold">Draft with NECTAR</span>
                      </div>
                      <p className="text-[11px] text-violet-900/80 dark:text-violet-100/80">
                        Type rough shorthand — Nectar expands it into a UPI-grade narrative you edit before continuing.
                        Example: "client hit roommate, cops came, arrested".
                      </p>
                      <Textarea
                        rows={3}
                        value={shorthand}
                        onChange={(e) => setShorthand(e.target.value)}
                        placeholder="Shorthand — who/what/when in 1–2 lines…"
                        className="mt-2"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={runDraftWithNectar} disabled={draftBusy}>
                          {draftBusy ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Drafting…</> : <><Wand2 className="mr-1 h-3 w-3" />Draft with NECTAR</>}
                        </Button>
                        {speechSupported && (
                          <Button type="button" size="sm" variant="outline"
                            onClick={isRecording ? stopRecording : startRecording}>
                            {isRecording ? <><MicOff className="mr-1 h-3 w-3" />Stop voice</> : <><Mic className="mr-1 h-3 w-3" />Speak shorthand</>}
                          </Button>
                        )}
                        {nectarDraft && (
                          <Button type="button" size="sm" variant="secondary"
                            onClick={acceptNectarDraft}
                            disabled={!canAcceptDraft}
                            title={canAcceptDraft ? "" : "Answer the required follow-ups below first"}
                          >
                            Use this draft
                          </Button>
                        )}
                        {draftSkipped && (
                          <Badge variant="outline" className="text-[10px]">AI draft skipped — write manually</Badge>
                        )}
                      </div>
                      {nectarDraft && (
                        <div className="mt-2 rounded border border-violet-200 bg-background p-2 text-xs dark:border-violet-900">
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-violet-700 dark:text-violet-300">NECTAR draft — review then click "Use this draft"</p>
                          <p className="whitespace-pre-wrap">{nectarDraft}</p>
                        </div>
                      )}
                      {nectarDraft && nectarDraftGaps.filter((g) => g.severity === "must_fix").length > 0 && (
                        <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50/60 p-2 text-xs dark:bg-amber-950/30 dark:border-amber-800">
                          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
                            NECTAR needs a few details before it can finalize this draft. Answer each question — NECTAR will NOT make up information for you.
                          </p>
                          {nectarDraftGaps.map((g, i) => {
                            if (g.severity !== "must_fix") return null;
                            const answered = !!gapAnswers[i]?.trim();
                            const isYesNo = g.answer_type === "yes_no";
                            return (
                              <div key={i} className="rounded border border-amber-200 bg-background p-2 dark:border-amber-900">
                                <div className="mb-2 flex items-start gap-2">
                                  <Badge variant="destructive" className="text-[10px]">Required</Badge>
                                  <p className="text-[11px] leading-snug">{g.question}</p>
                                </div>
                                {isYesNo ? (
                                  <div className="flex gap-2">
                                    {(["Yes", "No"] as const).map((v) => (
                                      <Button key={v} type="button" size="sm"
                                        variant={gapAnswers[i] === v ? "default" : "outline"}
                                        onClick={() => setGapAnswers((s) => ({ ...s, [i]: v }))}>
                                        {v}
                                      </Button>
                                    ))}
                                  </div>
                                ) : (
                                  <Textarea
                                    rows={2}
                                    value={gapAnswers[i] ?? ""}
                                    onChange={(e) => setGapAnswers((s) => ({ ...s, [i]: e.target.value }))}
                                    placeholder="Type your answer in 1–2 sentences…"
                                    className="text-xs"
                                  />
                                )}
                                {!answered && (
                                  <p className="mt-1 text-[10px] text-rose-700 dark:text-rose-300">
                                    Required to use this draft.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">What happened * (at least 120 characters)</Label>
                    <Textarea rows={6} value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe in plain language — who was there, what led up to it, what happened, and the outcome." />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {description.trim().length} characters
                    </p>
                  </div>
                  {aiEnabled && (
                    <div className="rounded-md border-2 border-violet-300 bg-violet-50/40 p-3 dark:bg-violet-950/30 dark:border-violet-800">
                      <div className="mb-2 flex items-center gap-2 text-violet-900 dark:text-violet-100">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="text-sm font-semibold">Review with NECTAR</span>
                      </div>
                      <p className="text-[11px] text-violet-900/80 dark:text-violet-100/80">
                        NECTAR reads your narrative and asks for anything a UPI reviewer would push back on.
                        You must run a review before continuing — NECTAR will NOT make up information for you.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void runNectarReview()}
                          disabled={narrativeReviewStatus === "reviewing" || description.trim().length < 120}
                          title={description.trim().length < 120 ? "Write at least 120 characters first." : ""}
                        >
                          {narrativeReviewStatus === "reviewing"
                            ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />NECTAR reviewing…</>
                            : narrativeReviewStatus === "idle"
                              ? <><Sparkles className="mr-1 h-3 w-3" />Review with NECTAR</>
                              : <><Sparkles className="mr-1 h-3 w-3" />Re-run NECTAR review</>}
                        </Button>
                        {narrativeReviewStatus === "passed" && (
                          <Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-700 dark:text-emerald-300">
                            NECTAR has no follow-ups — you can continue.
                          </Badge>
                        )}
                        {narrativeReviewStatus === "skipped" && (
                          <Badge variant="outline" className="text-[10px]">AI review skipped — you can continue</Badge>
                        )}
                        {narrativeReviewStatus === "needs_answers" && (
                          <Badge variant="destructive" className="text-[10px]">
                            {(nectarIssues ?? []).filter((g) => g.severity === "must_fix").length} required follow-up{(nectarIssues ?? []).filter((g) => g.severity === "must_fix").length === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                      {narrativeReviewStatus === "needs_answers" && (nectarIssues ?? []).filter((g) => g.severity === "must_fix").length > 0 && (
                        <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50/60 p-2 text-xs dark:bg-amber-950/30 dark:border-amber-800">
                          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
                            NECTAR needs a few details. Answer each question before continuing — NECTAR will NOT make up information for you.
                          </p>
                          {(nectarIssues ?? []).map((g, i) => {
                            if (g.severity !== "must_fix") return null;
                            const answered = !!nectarAnswers[i]?.trim() || nectarNA[i] !== undefined;
                            const isYesNo = g.answer_type === "yes_no";
                            const isGuardianQ = /guardian|authorized rep(resentative)?/i.test(g.question);
                            const ownGuardianApplies = isGuardianQ && clientIsOwnGuardian === true;
                            const clientFirst = (resolvedClientName || "").split(/\s+/)[0] || "the client";
                            const naActive = nectarNA[i] !== undefined;
                            const naLabel = ownGuardianApplies
                              ? `N/A — ${clientFirst} is their own guardian`
                              : "Mark N/A";
                            const naDefaultReason = ownGuardianApplies
                              ? "Client is their own guardian — no separate notification required."
                              : "Not applicable";
                            return (
                              <div key={i} className="rounded border border-amber-200 bg-background p-2 dark:border-amber-900">
                                <div className="mb-2 flex items-start gap-2">
                                  <Badge variant="destructive" className="text-[10px]">Required</Badge>
                                  <p className="text-[11px] leading-snug">{g.question}</p>
                                </div>
                                {isYesNo ? (
                                  <div className="flex flex-wrap gap-2">
                                    {(["Yes", "No"] as const).map((v) => (
                                      <Button key={v} type="button" size="sm"
                                        disabled={naActive}
                                        variant={nectarAnswers[i] === v ? "default" : "outline"}
                                        onClick={() => setNectarAnswers((s) => ({ ...s, [i]: v }))}>
                                        {v}
                                      </Button>
                                    ))}
                                  </div>
                                ) : (
                                  <Textarea
                                    rows={2}
                                    disabled={naActive}
                                    value={nectarAnswers[i] ?? ""}
                                    onChange={(e) => setNectarAnswers((s) => ({ ...s, [i]: e.target.value }))}
                                    placeholder="Type your answer in 1–2 sentences…"
                                    className="text-xs"
                                  />
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={naActive ? "default" : "outline"}
                                    onClick={() => setNectarNA((s) => {
                                      const next = { ...s };
                                      if (naActive) delete next[i];
                                      else next[i] = naDefaultReason;
                                      return next;
                                    })}
                                  >
                                    {naActive ? "Clear N/A" : naLabel}
                                  </Button>
                                  {naActive && (
                                    <Input
                                      className="h-7 flex-1 min-w-[180px] text-[11px]"
                                      placeholder="Optional: add a reason"
                                      value={nectarNA[i] ?? ""}
                                      onChange={(e) => setNectarNA((s) => ({ ...s, [i]: e.target.value }))}
                                    />
                                  )}
                                </div>
                                {ownGuardianApplies && (
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {clientFirst} is their own guardian — no guardian notification is required.
                                  </p>
                                )}
                                {!answered && (
                                  <p className="mt-1 text-[10px] text-rose-700 dark:text-rose-300">
                                    Required to continue.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          <p className="text-[10px] text-amber-800 dark:text-amber-200">
                            Your answers will be appended to the narrative when you click Next.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {liveNudges.length > 0 && (
                    <div className="space-y-2">
                      {liveNudges.map((n) => (
                        <div key={n.term} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-amber-900 dark:text-amber-100">
                              Nectar noticed you mentioned <span className="font-mono">"{n.term}"</span> —
                              {detailKey === n.categoryKey
                                ? <> {n.categoryName} details will be required on the next step.</>
                                : <> {n.categoryName} details may apply.</>}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {detailKey !== n.categoryKey && (
                                <Button type="button" size="sm" variant="outline"
                                  onClick={() => setCategory(n.categoryName as IncidentCategory)}>
                                  Switch category to {n.categoryName}
                                </Button>
                              )}
                              <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => setDismissedTerms((s) => new Set(s).add(n.term))}>Dismiss</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentKey === "details" && block && (
                <div className="rounded-md border-2 border-amber-400 bg-amber-50/30 p-3 dark:bg-amber-950/20">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold">{block.title}</p>
                    <Badge variant="outline" className="text-[10px]">Required</Badge>
                  </div>
                  {block.notice && block.key === "abuse" && <ApsNotice />}
                  {block.notice && block.key !== "abuse" && (
                    <p className="mb-2 text-[11px] text-muted-foreground">{block.notice.text}</p>
                  )}
                  <div className="mt-2 grid gap-3">
                    {block.fields.map((f) => (
                      <FieldRenderer key={f.name} field={f} value={details[f.name]}
                        onChange={(v) => setDetails((d) => ({ ...d, [f.name]: v }))}
                        onUploadPhoto={uploadPhotos} photoUploading={photoUploading} />
                    ))}
                  </div>
                </div>
              )}

              {currentKey === "people" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">People involved * (full names)</Label>
                    <Textarea rows={2} value={peopleInvolved} onChange={(e) => setPeopleInvolved(e.target.value)}
                      placeholder="Full names of everyone directly involved (not just first names). Write 'no one else' if applicable." />
                  </div>
                  <div>
                    <Label className="text-xs">Witnesses</Label>
                    <Textarea rows={2} value={witnesses} onChange={(e) => setWitnesses(e.target.value)}
                      placeholder="Who else saw or heard this happen?" />
                  </div>
                </div>
              )}

              {currentKey === "injuries" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Injuries *</Label>
                    <Textarea rows={3} value={injuries} onChange={(e) => setInjuries(e.target.value)}
                      placeholder="Describe any injuries observed, or write 'No injuries observed at time of report.'" />
                  </div>
                  <div>
                    <Label className="text-xs">Medical attention received *</Label>
                    <Textarea rows={3} value={medicalAttention} onChange={(e) => setMedicalAttention(e.target.value)}
                      placeholder="What medical care was provided? Who provided it? If none, say so explicitly." />
                  </div>
                </div>
              )}

              {currentKey === "actions" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Immediate actions taken *</Label>
                    <Textarea rows={4} value={immediateActions} onChange={(e) => setImmediateActions(e.target.value)}
                      placeholder="What did you do in the moment to keep the person safe?" />
                  </div>
                  {isAbuse && (
                    <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/40">
                      <Label className="text-xs font-semibold text-amber-800 dark:text-amber-100">
                        Prevention strategies developed or planned *
                      </Label>
                      <p className="text-[10px] text-amber-700 dark:text-amber-200">
                        Required by §1.27(3) for abuse / neglect / exploitation incidents.
                      </p>
                      <Textarea rows={3} value={preventionStrategies}
                        onChange={(e) => setPreventionStrategies(e.target.value)} className="mt-2" />
                    </div>
                  )}
                </div>
              )}

              {currentKey === "nectar-interview" && (
                <div className="space-y-3 rounded-md border border-violet-300 bg-violet-50/40 p-4 dark:bg-violet-950/30 dark:border-violet-800">
                  <div className="flex items-center gap-2 text-violet-900 dark:text-violet-100">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-sm font-semibold">NECTAR is reviewing your narrative</span>
                  </div>
                  <p className="text-[11px] text-violet-900/70 dark:text-violet-100/70">
                    NECTAR reviews every narrative — whether you used its draft or wrote your own — and will ask follow-ups before you can submit. It never makes up information for you.
                  </p>

                  {nectarReviewing ? (
                    <p className="flex items-center gap-2 text-xs text-violet-900/80 dark:text-violet-100/80">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating follow-up questions specific to what you wrote…
                    </p>
                  ) : nectarStatus === "skipped" ? (
                    <>
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Nectar review unavailable (timeout or error). The 24-hour clock matters more — you can continue and submit. An <em>AI review skipped</em> badge will be visible to admins.
                      </p>
                    </>
                  ) : nectarIssues && nectarIssues.length === 0 ? (
                    <p className="text-xs text-emerald-800 dark:text-emerald-200">
                      NECTAR has no follow-ups — the narrative covers what a UPI reviewer would ask. Continue to the final review.
                    </p>
                  ) : nectarIssues && nectarIssues.length > 0 ? (
                    <div className="space-y-2 text-xs">
                      <p>NECTAR generated <strong>{nectarIssues.length}</strong> question{nectarIssues.length === 1 ? "" : "s"} from your draft. Click Next to answer each one.</p>
                      <ul className="ml-5 list-disc space-y-1">
                        {nectarIssues.map((q, i) => (
                          <li key={i}>
                            <Badge variant={q.severity === "must_fix" ? "destructive" : "outline"} className="mr-1 text-[10px]">
                              {q.severity === "must_fix" ? "Must" : "Suggested"}
                            </Badge>
                            {q.question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              {isQuestionStep && renderQuestionStep(questionIdx)}

              {currentKey === "review" && (() => {
                const hasBlockers =
                  contradictions.length > 0 || unresolvedMustFix.length > 0 || nectarReviewing;
                const jumpTo = (key: string) => {
                  const idx = stepKeys.indexOf(key);
                  if (idx >= 0) { setStep(idx); setStepError(null); }
                };
                const fmtDT = (v: string) => {
                  if (!v) return "";
                  const d = new Date(v);
                  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
                };
                const photos = Array.isArray(details.photos) ? (details.photos as string[]) : [];
                const detailRows = block
                  ? block.fields
                      .filter((f) => f.name !== "photos")
                      .map((f) => {
                        const v = details[f.name];
                        let text = "";
                        if (Array.isArray(v)) text = v.filter(Boolean).join(", ");
                        else if (typeof v === "string") text = v.trim();
                        else if (v !== undefined && v !== null) text = String(v);
                        if (f.type === "datetime" && text) text = fmtDT(text);
                        return { label: f.label, text };
                      })
                      .filter((r) => r.text.length > 0)
                  : [];
                const Section = ({ title, editKey, children }: { title: string; editKey: string; children: React.ReactNode }) => (
                  <div className="rounded-md border border-border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                      <button type="button" className="text-[11px] text-primary underline hover:no-underline"
                        onClick={() => jumpTo(editKey)}>Edit</button>
                    </div>
                    <div className="space-y-1 text-sm">{children}</div>
                  </div>
                );
                const Row = ({ label, value }: { label: string; value: string }) => (
                  value ? (
                    <div className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-2">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="whitespace-pre-wrap break-words">{value}</span>
                    </div>
                  ) : null
                );
                return (
                  <div className="space-y-4">
                    <div className={
                      hasBlockers
                        ? "rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-xs dark:bg-amber-950/30"
                        : "rounded-md border-2 border-emerald-400 bg-emerald-50 p-3 text-xs dark:bg-emerald-950/30"
                    }>
                      <p className="font-semibold">
                        {hasBlockers ? "Review before submitting" : "Ready to submit"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {hasBlockers
                          ? "Fix any red items below. Submit becomes available once everything is resolved."
                          : "Review the summary below and click Submit incident report."}
                      </p>
                    </div>

                    {contradictions.length > 0 && (
                      <div className="space-y-2">
                        {contradictions.map((msg, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-md border-2 border-rose-400 bg-rose-50 p-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium">{msg}</p>
                              <button type="button" className="mt-1 text-[11px] underline hover:no-underline"
                                onClick={() => jumpTo("narrative")}>
                                Edit narrative
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* NECTAR Completeness Check */}
                    <div className="rounded-md border border-violet-300 bg-violet-50/60 p-3 text-xs dark:bg-violet-950/30 dark:border-violet-800">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-violet-900 dark:text-violet-100">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span className="font-semibold">NECTAR Completeness Check</span>
                        {nectarStatus === "skipped" && (
                          <Badge variant="outline" className="text-[10px]">AI review skipped</Badge>
                        )}
                        {nectarStatus === "disabled" && (
                          <Badge variant="outline" className="text-[10px]">AI disabled by org settings</Badge>
                        )}
                        {nectarStatus === "passed" && (
                          <Badge variant="outline" className="text-[10px]">No follow-ups</Badge>
                        )}
                        {nectarStatus === null && nectarIssues && nectarIssues.length > 0 && unresolvedMustFix.length === 0 && (
                          <Badge variant="outline" className="text-[10px]">Follow-ups answered</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-violet-900/80 dark:text-violet-100/80">
                        Re-run NECTAR on the enriched draft (narrative + your answers) to surface any remaining gaps before submit.
                      </p>
                      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={runCompletenessCheck} disabled={completenessBusy || !aiEnabled}>
                        {completenessBusy ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Re-checking…</> : "Re-check with NECTAR"}
                      </Button>

                      {completenessIssues && completenessIssues.length === 0 && !completenessBusy && (
                        <p className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-200">No remaining gaps. You can submit.</p>
                      )}
                      {completenessIssues && completenessIssues.length > 0 && (
                        <ul className="mt-2 space-y-1 text-[11px]">
                          {completenessIssues.map((q, i) => (
                            <li key={i} className={`flex items-start gap-2 rounded border p-2 ${q.severity === "must_fix" ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"}`}>
                              <Badge variant={q.severity === "must_fix" ? "destructive" : "outline"} className="text-[10px]">
                                {q.severity === "must_fix" ? "Must address" : "Suggested"}
                              </Badge>
                              <span>{q.question}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {unresolvedMustFix.length > 0 && (
                      <div className="space-y-2">
                        {unresolvedMustFix.map(({ q, i }) => (
                          <div key={i} className="flex items-start gap-2 rounded-md border-2 border-rose-400 bg-rose-50 p-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium">Nectar follow-up needs an answer: {q.question}</p>
                              <button type="button" className="mt-1 text-[11px] underline hover:no-underline"
                                onClick={() => jumpTo(`nectar-q-${i}`)}>
                                Answer question
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {nectarReviewing && (
                      <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                        Nectar is still reviewing — Submit will unlock in a moment.
                      </div>
                    )}

                    <Section title="Who & when" editKey="who-when">
                      <Row label="Individual" value={resolvedClientName || "—"} />
                      <Row label="Occurred" value={fmtDT(occurredAt)} />
                      <Row label="Discovered" value={fmtDT(discoveredAt)} />
                    </Section>

                    <Section title="Witnessed" editKey="witnessed">
                      <Row label="Directly?" value={witnessedDirectly === "yes" ? "Yes" : witnessedDirectly === "no" ? "No" : ""} />
                      {witnessedDirectly === "no" && <Row label="Reported by" value={reportedBy} />}
                    </Section>

                    <Section title="Where & what" editKey="where-what">
                      <Row label="Category" value={category} />
                      <Row label="Location" value={location} />
                    </Section>

                    <Section title="Narrative" editKey="narrative">
                      <div className="max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/20 p-2 text-sm">
                        {description || <span className="text-muted-foreground">—</span>}
                      </div>
                    </Section>

                    {block && detailRows.length > 0 && (
                      <Section title={block.title} editKey="details">
                        {detailRows.map((r) => <Row key={r.label} label={r.label} value={r.text} />)}
                        {photos.length > 0 && <Row label="Photos" value={`${photos.length} attached`} />}
                      </Section>
                    )}

                    <Section title="People" editKey="people">
                      <Row label="Involved" value={peopleInvolved} />
                      <Row label="Witnesses" value={witnesses} />
                    </Section>

                    {stepKeys.includes("injuries") && (injuries.trim() || medicalAttention.trim()) && (
                      <Section title="Injuries & medical" editKey="injuries">
                        <Row label="Injuries" value={injuries} />
                        <Row label="Medical attention" value={medicalAttention} />
                      </Section>
                    )}

                    <Section title="Immediate actions" editKey="actions">
                      <Row label="Actions taken" value={immediateActions} />
                      {isAbuse && <Row label="Prevention strategies" value={preventionStrategies} />}
                    </Section>
                  </div>
                );
              })()}
            </div>

            {stepError && (
              <p className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                {stepError}
              </p>
            )}

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <div className="flex gap-2">
                {step > 0 && (
                  <Button variant="outline" onClick={() => { setStepError(null); setStep((s) => Math.max(0, s - 1)); }}>
                    Back
                  </Button>
                )}
                {step < reviewStepIndex && (
                  <Button
                    onClick={handleNext}
                    disabled={
                      (currentKey === "nectar-interview" && nectarReviewing)
                      || (currentKey === "narrative" && aiEnabled
                          && (narrativeReviewStatus === "idle" || narrativeReviewStatus === "reviewing"))
                    }
                    title={
                      currentKey === "narrative" && aiEnabled && narrativeReviewStatus === "idle"
                        ? "Click 'Review with NECTAR' below before continuing."
                        : ""
                    }
                  >
                    {currentKey === "nectar-interview" && nectarReviewing
                      ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />NECTAR…</>
                      : currentKey === "narrative" && narrativeReviewStatus === "reviewing"
                        ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />NECTAR…</>
                        : "Next"}
                  </Button>
                )}
                {step === reviewStepIndex && (
                  <Button onClick={() => submit.mutate()} disabled={submit.isPending || photoUploading || submitBlocked}>
                    {submit.isPending ? "Submitting…" : "Submit incident report"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
