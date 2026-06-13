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
import { AlertTriangle, Skull, ShieldAlert, Sparkles, X, Loader2, ShieldCheck } from "lucide-react";
import { createIncident } from "@/lib/incidents.functions";
import {
  INCIDENT_CATEGORIES, ABUSE_CATEGORY, FATALITY_CATEGORY, type IncidentCategory,
} from "./incident-categories";
import {
  DETAIL_BLOCKS, detailKeyForCategory, type DetailField, type DetailCategoryKey,
  APS_HOTLINE,
} from "@/lib/incident-detail-schemas";
import { scanNarrativeForCategories, type NarrativeCategoryHit } from "@/lib/nectar-triggers";
import {
  validateNarrative, validatePersonName, validateRequiredText, findContradictions,
} from "@/lib/nectar-quality";
import { useCaseload } from "@/hooks/use-caseload";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
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
  field,
  value,
  onChange,
  onUploadPhoto,
  photoUploading,
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
      return (
        <div>
          {labelEl}
          <Input
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelEl}
          <Textarea
            rows={field.rows ?? 3}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "datetime":
      return (
        <div>
          {labelEl}
          <Input
            type="datetime-local"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "select":
      return (
        <div>
          {labelEl}
          <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
            <SelectTrigger><SelectValue placeholder="Pick one…" /></SelectTrigger>
            <SelectContent>
              {field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "yesno":
    case "yesno_na": {
      const opts = field.type === "yesno_na" ? ["Yes", "No", "N/A"] : ["Yes", "No"];
      return (
        <div>
          {labelEl}
          <div className="mt-1 flex flex-wrap gap-2">
            {opts.map((o) => {
              const active = value === o;
              return (
                <Button
                  key={o}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => onChange(o)}
                >
                  {o}
                </Button>
              );
            })}
          </div>
        </div>
      );
    }
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          {labelEl}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {field.options.map((o) => {
              const active = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    const next = active ? selected.filter((s) => s !== o) : [...selected, o];
                    onChange(next);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
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
        <div>
          {labelEl}
          <div className="mt-1 space-y-2">
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={photoUploading}
              onChange={(e) => {
                if (e.target.files && e.target.files.length) onUploadPhoto?.(e.target.files);
                e.currentTarget.value = "";
              }}
              className="block w-full text-xs"
            />
            {photoUploading && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
              </p>
            )}
            {photos.length > 0 && (
              <ul className="space-y-1 text-[11px]">
                {photos.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2 py-1">
                    <span className="truncate font-mono">{p.split("/").pop()}</span>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => onChange(photos.filter((x) => x !== p))}
                    >
                      <X className="h-3 w-3" />
                    </button>
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
      <p className="mt-1">
        APS intake: <span className="font-mono font-semibold">{APS_HOTLINE}</span>{" "}
        <span className="text-[10px] opacity-80">(verify with current state listing)</span>
      </p>
    </div>
  );
}

// Required-field check inside a detail block.
function missingRequired(block: { fields: DetailField[] }, values: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const f of block.fields) {
    if (!("required" in f) || !f.required) continue;
    const v = values[f.name];
    if (f.type === "multiselect") {
      if (!Array.isArray(v) || v.length === 0) missing.push(f.label);
    } else if (typeof v === "string") {
      if (!v.trim()) missing.push(f.label);
    } else if (v === undefined || v === null) {
      missing.push(f.label);
    }
  }
  return missing;
}

// ─── Main dialog ─────────────────────────────────────────────────────────

export function IncidentReportDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  defaultDiscoveredAt,
  triggeredByNoteId,
  triggeredByNoteType,
  onSubmitted,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { data: caseload = [] } = useCaseload();
  const createFn = useServerFn(createIncident);

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

  // Discovery chain
  const [witnessedDirectly, setWitnessedDirectly] = useState<"yes" | "no" | "">("");
  const [reportedBy, setReportedBy] = useState("");

  // Category-specific details
  const [details, setDetails] = useState<Record<string, unknown>>({});

  // Nectar AI pre-submit review
  type AiIssue = { field: string | null; severity: "must_fix" | "should_add"; question: string };
  const [aiIssues, setAiIssues] = useState<AiIssue[] | null>(null);
  const [aiStatus, setAiStatus] = useState<"passed" | "answered" | "skipped" | "disabled" | null>(null);
  const [aiAnswers, setAiAnswers] = useState<Record<number, string>>({});
  const [aiNA, setAiNA] = useState<Record<number, string>>({});
  const [aiReviewing, setAiReviewing] = useState(false);
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

  // Live narrative nudges
  const [dismissedTerms, setDismissedTerms] = useState<Set<string>>(new Set());
  const detailKey = detailKeyForCategory(category);
  const block = detailKey ? DETAIL_BLOCKS[detailKey] : null;
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  // ─── WIZARD: one question/group per step ─────────────────────────────────
  // Step keys; "details" is skipped when no category-specific block applies.
  const stepKeys = useMemo<string[]>(() => {
    const base = ["who-when", "witnessed", "where-what", "narrative"];
    if (block) base.push("details");
    base.push("people", "injuries", "actions", "review");
    return base;
  }, [block]);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const lastStep = stepKeys.length - 1;
  const reviewStepIndex = lastStep;
  const currentKey = stepKeys[Math.min(step, lastStep)];

  // Reset when dialog opens.
  useEffect(() => {
    if (!open) return;
    setPickedClientId(clientId ?? "");
    setOccurredAt("");
    setDiscoveredAt(initialDiscovered);
    setLocation("");
    setCategory("");
    setDescription("");
    setPeopleInvolved("");
    setWitnesses("");
    setInjuries("");
    setMedicalAttention("");
    setImmediateActions("");
    setPreventionStrategies("");
    setWitnessedDirectly("");
    setReportedBy("");
    setDetails({});
    setDismissedTerms(new Set());
    setSubmitted(false);
    setAiIssues(null);
    setAiStatus(null);
    setAiAnswers({});
    setAiNA({});
    setStep(0);
    setStepError(null);
  }, [open, clientId, initialDiscovered]);


  const isAbuse = category === ABUSE_CATEGORY;
  const isFatality = category === FATALITY_CATEGORY;

  // Live narrative scan (debounced via useMemo on text)
  const narrativeHits = useMemo<NarrativeCategoryHit[]>(
    () => scanNarrativeForCategories(description),
    [description],
  );

  /** Hits that the writer hasn't acknowledged — either the matching category
   *  block isn't selected, or its key fields are empty. */
  const liveNudges = useMemo(() => {
    const out: NarrativeCategoryHit[] = [];
    for (const h of narrativeHits) {
      if (dismissedTerms.has(h.term)) continue;
      // If the selected category already maps to this block AND a required
      // key field is set, skip the nudge.
      if (detailKey === h.categoryKey) {
        const targetBlock = DETAIL_BLOCKS[h.categoryKey];
        // The block is "engaged" once at least one required field has a value
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

  // Photo upload to incident-photos bucket — relative paths stored in details.photos
  const [photoUploading, setPhotoUploading] = useState(false);
  async function uploadPhotos(files: FileList) {
    if (!org?.organization_id || !user?.id) {
      toast.error("Cannot upload photos until your session and org are loaded.");
      return;
    }
    setPhotoUploading(true);
    try {
      const current = Array.isArray(details.photos) ? (details.photos as string[]) : [];
      const next = [...current];
      for (const file of Array.from(files)) {
        const ts = Date.now();
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${org.organization_id}/${pickedClientId || "unassigned"}/${ts}_${safe}`;
        const { error } = await supabase.storage
          .from("incident-photos")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        next.push(path);
      }
      setDetails((d) => ({ ...d, photos: next }));
    } finally {
      setPhotoUploading(false);
    }
  }

  // ─── Per-step validation ─────────────────────────────────────────────────
  function validateStep(key: string): string | null {
    switch (key) {
      case "who-when":
        if (!pickedClientId) return "Pick the individual involved.";
        if (!discoveredAt) return "Record when you DISCOVERED this — drives the 24-hour clock.";
        return null;
      case "witnessed":
        if (witnessedDirectly === "") return "Tell us whether you witnessed this directly.";
        if (witnessedDirectly === "no") {
          const nameErr = validatePersonName(reportedBy);
          if (nameErr) return `Who reported it? ${nameErr}`;
        }
        return null;
      case "where-what":
        if (!category) return "Pick an incident category.";
        return null;
      case "narrative":
        return validateNarrative(description);
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
      default:
        return null;
    }
  }

  function handleNext() {
    const err = validateStep(currentKey);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setStep((s) => Math.min(lastStep, s + 1));
  }

  // Draft built for AI review + contradiction scanning.
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
    };
  }

  // Contradictions across the whole draft — recomputed every render of review step.
  const contradictions = useMemo(
    () => (currentKey === "review" ? findContradictions(buildDraft()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentKey, description, peopleInvolved, witnesses, injuries, medicalAttention, immediateActions],
  );

  // Kick off Nectar AI review the moment we hit the Review step.
  // 10s timeout via Promise.race — AI downtime must never permanently block
  // an incident report (24-hour UPI clock).
  useEffect(() => {
    if (currentKey !== "review") return;
    if (orgAiEnabled === null) return;                 // wait for org pref
    if (orgAiEnabled === false) { setAiStatus("disabled"); return; }
    if (aiIssues !== null || aiStatus === "skipped") return;
    let cancelled = false;
    (async () => {
      setAiReviewing(true);
      try {
        const draft = buildDraft();
        const result = await Promise.race([
          supabase.functions.invoke("review-incident-report", { body: { draft } }),
          new Promise<{ data: null; error: Error }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error("timeout") }), 10000),
          ),
        ]);
        if (cancelled) return;
        const { data: r, error: rerr } = result as { data: { complete?: boolean; skipped?: boolean; issues?: AiIssue[] } | null; error: Error | null };
        if (rerr || !r || typeof r.complete !== "boolean" || r.skipped) {
          setAiIssues([]);
          setAiStatus("skipped");
          return;
        }
        const issues = Array.isArray(r.issues) ? (r.issues as AiIssue[]) : [];
        setAiIssues(issues);
        setAiStatus(issues.length === 0 ? "passed" : null);
      } catch {
        if (!cancelled) { setAiIssues([]); setAiStatus("skipped"); }
      } finally {
        if (!cancelled) setAiReviewing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, orgAiEnabled]);

  // Submit blocked while contradictions exist OR any must_fix is unanswered.
  const unresolvedMustFix = (aiIssues ?? [])
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => q.severity === "must_fix" && !(aiAnswers[i]?.trim() || aiNA[i]?.trim()));
  const submitBlocked =
    contradictions.length > 0 ||
    aiReviewing ||
    (orgAiEnabled !== false && aiIssues === null && aiStatus === null) ||
    (aiStatus !== "skipped" && aiStatus !== "disabled" && unresolvedMustFix.length > 0);



  const submit = useMutation({
    mutationFn: async () => {
      if (!pickedClientId) throw new Error("Pick the individual involved.");
      if (!category) throw new Error("Pick an incident category.");
      if (description.trim().length < 10) throw new Error("Add a short description of what happened.");

      // Discovery chain
      if (witnessedDirectly === "") {
        throw new Error("Tell us whether you witnessed this directly.");
      }
      if (witnessedDirectly === "no" && reportedBy.trim().length < 2) {
        throw new Error("Who reported this to you?");
      }

      // Abuse-specific prevention strategies (§1.27(3))
      if (isAbuse && preventionStrategies.trim().length < 5) {
        throw new Error("Abuse / neglect / exploitation requires prevention strategies (§1.27(3)).");
      }

      // Category-specific required-field validation
      if (block) {
        const missing = missingRequired(block, details);
        if (missing.length) {
          throw new Error(`Complete the ${block.title.toLowerCase()}: ${missing.join(", ")}.`);
        }
      }

      // Behavior — restraint cross-check
      let restraintFlag = false;
      if (detailKey === "behavior" && details.restraintUsed === "Yes") {
        restraintFlag = true;
        const need: string[] = [];
        if (!String(details.holdType ?? "").trim()) need.push("type of hold");
        if (!String(details.restraintDuration ?? "").trim()) need.push("restraint duration");
        if (!String(details.restraintAuthorizedBy ?? "").trim()) need.push("authorized by");
        if (need.length) throw new Error(`Restraint was used — also record: ${need.join(", ")}.`);
      }

      // Abuse APS capture
      let apsNotifiedAt: string | null = null;
      let apsNotifiedBy: string | null = null;
      let apsReference: string | null = null;
      if (isAbuse) {
        const status = String(details.apsNotifiedStatus ?? "");
        if (status === "Yes") {
          if (!String(details.apsNotifiedBy ?? "").trim()) {
            throw new Error("Record who notified APS (must be the person with direct knowledge).");
          }
          if (!String(details.apsNotifiedAt ?? "").trim()) {
            throw new Error("Record the APS notification date/time.");
          }
          apsNotifiedBy = String(details.apsNotifiedBy);
          apsNotifiedAt = new Date(String(details.apsNotifiedAt)).toISOString();
          apsReference = String(details.apsReference ?? "").trim() || null;
        }
      }

      const discoveredIso = new Date(discoveredAt).toISOString();
      const occurredIso = occurredAt ? new Date(occurredAt).toISOString() : null;

      // AI review already ran on the Review step (effect above). Just resolve
      // the final status from the already-populated state.
      let finalStatus: "passed" | "answered" | "skipped" | "disabled";
      let finalIssues: AiIssue[] | null = null;
      if (orgAiEnabled === false || aiStatus === "disabled") {
        finalStatus = "disabled";
      } else if (aiStatus === "skipped") {
        finalStatus = "skipped";
      } else {
        const issues = aiIssues ?? [];
        const unresolved = issues
          .map((q, i) => ({ q, i }))
          .filter(({ q, i }) => q.severity === "must_fix" && !(aiAnswers[i]?.trim() || aiNA[i]?.trim()));
        if (unresolved.length > 0) throw new Error("__AI_REVIEW_PENDING__");
        finalStatus = issues.length === 0 ? "passed" : "answered";
        finalIssues = issues.map((q, i) => ({
          ...q,
          answer: aiAnswers[i]?.trim() || null,
          not_applicable_reason: aiNA[i]?.trim() || null,
        })) as AiIssue[];
      }
      setAiStatus(finalStatus);



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
          details: finalStatus === "skipped" ? { ...details, ai_review_skipped: true } : details,
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
      if (msg === "__AI_REVIEW_PENDING__") return; // surfaced inline below
      toast.error(msg ?? "Could not file incident.");
    },
  });

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
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* ─── Stepper header — one question per step ─────────────── */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-foreground">
                Step {step + 1} of {stepKeys.length}
                <span className="ml-2 font-normal text-muted-foreground">— {stepKeys[step]}</span>
              </p>
              <div className="flex gap-1">
                {stepKeys.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-5 rounded-full ${
                      i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* ─── Step body — render ONLY the current step's fields ──── */}
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
                            <SelectItem key={c.id} value={c.id}>
                              {c.first_name} {c.last_name}
                            </SelectItem>
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
                      <Input type="datetime-local" value={occurredAt}
                             onChange={(e) => setOccurredAt(e.target.value)} />
                      <p className="mt-1 text-[10px] text-muted-foreground">Leave blank if unknown.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Date/time DISCOVERED *</Label>
                      <Input type="datetime-local" value={discoveredAt}
                             onChange={(e) => setDiscoveredAt(e.target.value)} required />
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
                        <Button
                          key={v}
                          type="button"
                          size="sm"
                          variant={witnessedDirectly === v ? "default" : "outline"}
                          onClick={() => setWitnessedDirectly(v)}
                        >
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
                    <Label className="text-xs">Location</Label>
                    <Input value={location} onChange={(e) => setLocation(e.target.value)}
                           placeholder="Where did it happen?" />
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
                      <span>
                        Fatality — immediate DHHS / §1.26 notifications are required. After you
                        submit, contact the on-call administrator by phone now.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {currentKey === "narrative" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">What happened * (at least 120 characters)</Label>
                    <Textarea
                      rows={6}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe in plain language — who was there, what led up to it, what happened, and the outcome."
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {description.trim().length} / 120 characters
                    </p>
                  </div>
                  {liveNudges.length > 0 && (
                    <div className="space-y-2">
                      {liveNudges.map((n) => (
                        <div key={n.term}
                             className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
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
                              <button type="button"
                                      className="text-[11px] text-muted-foreground hover:text-foreground"
                                      onClick={() => setDismissedTerms((s) => new Set(s).add(n.term))}>
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentKey === "details" && block && (
                <div ref={detailScrollRef}
                     className="rounded-md border-2 border-amber-400 bg-amber-50/30 p-3 dark:bg-amber-950/20">
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
                      <FieldRenderer
                        key={f.name}
                        field={f}
                        value={details[f.name]}
                        onChange={(v) => setDetails((d) => ({ ...d, [f.name]: v }))}
                        onUploadPhoto={uploadPhotos}
                        photoUploading={photoUploading}
                      />
                    ))}
                  </div>
                  {block.key === "behavior" && details.restraintUsed === "Yes" && (
                    <div className="mt-2 rounded-md border border-amber-500 bg-amber-100/60 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      <strong>Restraint use is separately reportable</strong> and must align with an
                      approved rights modification / BSP. The fields above are required.
                    </div>
                  )}
                </div>
              )}

              {currentKey === "people" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">People involved * (full names)</Label>
                    <Textarea rows={2} value={peopleInvolved}
                              onChange={(e) => setPeopleInvolved(e.target.value)}
                              placeholder="Full names of everyone directly involved (not just first names). Write 'no one else' if applicable." />
                  </div>
                  <div>
                    <Label className="text-xs">Witnesses</Label>
                    <Textarea rows={2} value={witnesses}
                              onChange={(e) => setWitnesses(e.target.value)}
                              placeholder="Who else saw or heard this happen?" />
                  </div>
                </div>
              )}

              {currentKey === "injuries" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Injuries *</Label>
                    <Textarea rows={3} value={injuries}
                              onChange={(e) => setInjuries(e.target.value)}
                              placeholder="Describe any injuries observed, or write 'No injuries observed at time of report.'" />
                  </div>
                  <div>
                    <Label className="text-xs">Medical attention received *</Label>
                    <Textarea rows={3} value={medicalAttention}
                              onChange={(e) => setMedicalAttention(e.target.value)}
                              placeholder="What medical care was provided? Who provided it? If none, say so explicitly." />
                  </div>
                </div>
              )}

              {currentKey === "actions" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Immediate actions taken *</Label>
                    <Textarea rows={4} value={immediateActions}
                              onChange={(e) => setImmediateActions(e.target.value)}
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

              {currentKey === "review" && (
                <div className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <p className="font-semibold">Review before submitting</p>
                    <p className="mt-1 text-muted-foreground">
                      Fix any red items below. Submit becomes available once everything is resolved.
                    </p>
                  </div>

                  {/* Deterministic contradictions */}
                  {contradictions.length > 0 && (
                    <div className="space-y-2">
                      {contradictions.map((msg, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-md border-2 border-rose-400 bg-rose-50 p-2 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium">{msg}</p>
                            <div className="mt-1 flex gap-2">
                              <button type="button" className="text-[11px] underline hover:no-underline"
                                onClick={() => { const i = stepKeys.indexOf("narrative"); if (i >= 0) { setStep(i); setStepError(null); } }}>
                                Edit narrative
                              </button>
                              <button type="button" className="text-[11px] underline hover:no-underline"
                                onClick={() => { const i = stepKeys.indexOf("people"); if (i >= 0) { setStep(i); setStepError(null); } }}>
                                Edit people
                              </button>
                              <button type="button" className="text-[11px] underline hover:no-underline"
                                onClick={() => { const i = stepKeys.indexOf("injuries"); if (i >= 0) { setStep(i); setStepError(null); } }}>
                                Edit injuries/medical
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Nectar AI review */}
                  <div className="rounded-md border border-violet-300 bg-violet-50/60 p-3 text-xs dark:bg-violet-950/30 dark:border-violet-800">
                    <div className="mb-2 flex items-center gap-2 text-violet-900 dark:text-violet-100">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="font-semibold">Nectar review</span>
                      {aiReviewing && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Loader2 className="h-3 w-3 animate-spin" /> Nectar is reviewing…
                        </span>
                      )}
                      {aiStatus === "skipped" && (
                        <Badge variant="outline" className="text-[10px]">
                          Nectar review unavailable — submitting with standard checks
                        </Badge>
                      )}
                      {aiStatus === "disabled" && (
                        <Badge variant="outline" className="text-[10px]">AI review disabled by org settings</Badge>
                      )}
                      {aiStatus === "passed" && (
                        <Badge variant="outline" className="text-[10px]">No follow-ups</Badge>
                      )}
                    </div>
                    {aiIssues && aiIssues.length > 0 && (
                      <div className="space-y-2">
                        {aiIssues.map((q, i) => {
                          const answered = !!(aiAnswers[i]?.trim() || aiNA[i]?.trim());
                          return (
                            <div key={i} className={`rounded border p-2 ${q.severity === "must_fix" ? (answered ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-rose-300 bg-rose-50 dark:bg-rose-950/30") : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
                              <div className="flex items-start gap-2">
                                <Badge variant={q.severity === "must_fix" ? "destructive" : "outline"} className="text-[10px] shrink-0">
                                  {q.severity === "must_fix" ? "Must answer" : "Suggested"}
                                </Badge>
                                <span className="font-medium">{q.question}</span>
                              </div>
                              <Textarea
                                rows={2}
                                className="mt-2"
                                placeholder="Answer in 1–2 sentences…"
                                value={aiAnswers[i] ?? ""}
                                onChange={(e) => setAiAnswers((s) => ({ ...s, [i]: e.target.value }))}
                                disabled={aiNA[i] !== undefined}
                              />
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`ai-na-${i}`}
                                  checked={aiNA[i] !== undefined}
                                  onChange={(e) => setAiNA((s) => {
                                    const next = { ...s };
                                    if (e.target.checked) next[i] = "";
                                    else delete next[i];
                                    return next;
                                  })}
                                />
                                <Label htmlFor={`ai-na-${i}`} className="text-[11px]">N/A — reason:</Label>
                                <Input
                                  className="h-7 text-[11px]"
                                  placeholder="Why this question doesn't apply"
                                  value={aiNA[i] ?? ""}
                                  onChange={(e) => setAiNA((s) => ({ ...s, [i]: e.target.value }))}
                                  disabled={aiNA[i] === undefined}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  <Button variant="outline"
                          onClick={() => { setStepError(null); setStep((s) => Math.max(0, s - 1)); }}>
                    Back
                  </Button>
                )}
                {step < reviewStepIndex && (
                  <Button onClick={handleNext}>Next</Button>
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
