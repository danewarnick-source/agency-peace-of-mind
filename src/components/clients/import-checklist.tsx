// Unified Smart-Import setup checklist for the done page.
//
// Composes the existing ClientReadinessCard + FinishOnboardingCard under
// ONE header so the user sees a single list, adds an EVV gating note driven
// by the EVV_SERVICE_CODES registry (per SOW §1.12), wires the SOW
// supplemental items (level of need, 2nd emergency contact, grievance
// acknowledgment, HRC chain for rights restrictions) and exposes the
// end-of-life group (which never blocks Submit) — auto-expanded when
// NECTAR has detected EOL signals on the client.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ListChecks, ChevronDown, ChevronRight, ShieldCheck, Send, Loader2,
  HeartPulse, Sparkles, Gavel, FileSignature, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientReadinessCard, useClientReadiness } from "@/components/clients/client-readiness-card";
import { FinishOnboardingCard } from "@/components/clients/finish-onboarding-card";
import { NectarAsk } from "@/components/clients/nectar-ask";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { submitForSetup } from "@/lib/smart-import-review.functions";
import {
  setEndOfLifeStatus,
  setLevelOfNeed,
  setEmergencyContact,
  setGrievanceAcknowledgment,
  listHrcReviewsForClient,
  createHrcReview,
} from "@/lib/import-checklist.functions";
import { supabase } from "@/integrations/supabase/client";

export function ImportChecklist({ clientId, jobId }: { clientId: string; jobId: string }) {
  const qc = useQueryClient();
  const readinessQ = useClientReadiness(clientId);

  // EVV gating — strictly the registry, per SOW §1.12.
  const evvApplicable = useMemo(() => {
    const codes = readinessQ.data?.currentCodes ?? [];
    return codes.some((c) =>
      EVV_SERVICE_CODES.find((d) => d.code === c.toUpperCase())?.evvLock,
    );
  }, [readinessQ.data?.currentCodes]);

  const submitFn = useServerFn(submitForSetup);
  const submitM = useMutation({
    mutationFn: () => submitFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Submitted for setup.");
      qc.invalidateQueries({ queryKey: ["smart-import-done", jobId] });
      qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!readinessQ.data?.isLive;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Setup checklist</div>
            <div className="text-xs text-muted-foreground">
              Answer everything required to go live, then submit for setup.
            </div>
          </div>
        </div>
        {readinessQ.data?.isLive ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="mr-1 h-3 w-3" /> Ready to submit
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
            Needs attention
          </Badge>
        )}
      </div>

      {!evvApplicable && readinessQ.data && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
          NECTAR hid the EVV geocoding requirement — no EVV-locked codes
          (per SOW §1.12) are on this client&apos;s authorization.
        </div>
      )}

      <ClientReadinessCard clientId={clientId} />
      <FinishOnboardingCard clientId={clientId} />

      <SowSupplementalGroup clientId={clientId} />
      <EndOfLifeGroup clientId={clientId} />

      <div className="flex items-center justify-end gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        {!canSubmit && (
          <span className="text-xs text-muted-foreground">
            Answer all required items to submit.
          </span>
        )}
        <Button
          onClick={() => submitM.mutate()}
          disabled={!canSubmit || submitM.isPending}
        >
          {submitM.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Submit for setup
        </Button>
      </div>
    </div>
  );
}

// ── SOW supplemental: level of need, 2nd EC, grievance, HRC ────────────
function SowSupplementalGroup({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["client-sow-supp", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "level_of_need, emergency_contact_name, emergency_contact_phone, emergency_contact_instructions, emergency_contact_2_name, emergency_contact_2_phone, emergency_contact_2_instructions, grievance_acknowledged, grievance_signed_date, rights_restrictions",
        )
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-sow-supp", clientId] });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-primary" />
        <div>
          <div className="text-sm font-semibold">Scope-of-Work supplemental items</div>
          <div className="text-xs text-muted-foreground">
            DSPD §1.10 / §1.20 — required to go live.
          </div>
        </div>
      </div>

      <LevelOfNeedRow
        clientId={clientId}
        current={(q.data?.level_of_need as string | null) ?? null}
        onSaved={refresh}
      />

      <EmergencyContact2Row
        clientId={clientId}
        primaryInstructions={(q.data?.emergency_contact_instructions as string | null) ?? null}
        ec2Name={(q.data?.emergency_contact_2_name as string | null) ?? null}
        ec2Phone={(q.data?.emergency_contact_2_phone as string | null) ?? null}
        ec2Instructions={(q.data?.emergency_contact_2_instructions as string | null) ?? null}
        onSaved={refresh}
      />

      <GrievanceRow
        clientId={clientId}
        acknowledged={(q.data?.grievance_acknowledged as boolean | null) ?? null}
        signedDate={(q.data?.grievance_signed_date as string | null) ?? null}
        onSaved={refresh}
      />

      <RightsRestrictionRow
        clientId={clientId}
        restrictions={(q.data?.rights_restrictions as string[] | null) ?? null}
        onSaved={refresh}
      />
    </div>
  );
}

function LevelOfNeedRow({
  clientId, current, onSaved,
}: { clientId: string; current: string | null; onSaved: () => void }) {
  const [val, setVal] = useState(current ?? "");
  useEffect(() => setVal(current ?? ""), [current]);
  const fn = useServerFn(setLevelOfNeed);
  const m = useMutation({
    mutationFn: () => fn({ data: { clientId, value: val.trim() || null } }),
    onSuccess: () => { toast.success("Level of need saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <Label className="text-xs font-semibold">Level of need (DSPD-assigned)</Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder='e.g. "Level 4", "High acuity"'
          className="h-9"
        />
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Saving…" : current ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function EmergencyContact2Row({
  clientId, primaryInstructions, ec2Name, ec2Phone, ec2Instructions, onSaved,
}: {
  clientId: string;
  primaryInstructions: string | null;
  ec2Name: string | null; ec2Phone: string | null; ec2Instructions: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(!!ec2Name);
  const [primInstr, setPrimInstr] = useState(primaryInstructions ?? "");
  const [name, setName] = useState(ec2Name ?? "");
  const [phone, setPhone] = useState(ec2Phone ?? "");
  const [instr, setInstr] = useState(ec2Instructions ?? "");
  useEffect(() => { setPrimInstr(primaryInstructions ?? ""); }, [primaryInstructions]);
  useEffect(() => {
    setName(ec2Name ?? ""); setPhone(ec2Phone ?? ""); setInstr(ec2Instructions ?? "");
  }, [ec2Name, ec2Phone, ec2Instructions]);

  const fn = useServerFn(setEmergencyContact);
  const savePrim = useMutation({
    mutationFn: () => fn({ data: { clientId, slot: "primary", instructions: primInstr } }),
    onSuccess: () => { toast.success("Primary contact instructions saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSec = useMutation({
    mutationFn: () => fn({ data: { clientId, slot: "secondary", name, phone, instructions: instr } }),
    onSuccess: () => { toast.success("Second emergency contact saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Emergency contacts (§1.10(4) — plural + how-to-reach)</div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-primary">
          {open ? "Collapse" : ec2Name ? "Edit" : "Add second contact"}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">Primary contact — how to reach them</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={primInstr}
              onChange={(e) => setPrimInstr(e.target.value)}
              placeholder="e.g. text first, then call; available evenings only"
              className="h-9"
            />
            <Button size="sm" variant="outline" onClick={() => savePrim.mutate()} disabled={savePrim.isPending}>
              {savePrim.isPending ? "…" : "Save"}
            </Button>
          </div>
        </div>
        {open && (
          <div className="space-y-2 border-t border-border pt-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second contact name" className="h-9" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="h-9" />
            </div>
            <Textarea
              value={instr}
              onChange={(e) => setInstr(e.target.value)}
              placeholder="How to reach this contact (instructions)"
              rows={2}
            />
            <Button size="sm" onClick={() => saveSec.mutate()} disabled={saveSec.isPending || (!name.trim() && !phone.trim())}>
              <UserPlus className="mr-1 h-3 w-3" />
              {saveSec.isPending ? "Saving…" : ec2Name ? "Update second contact" : "Save second contact"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function GrievanceRow({
  clientId, acknowledged, signedDate, onSaved,
}: {
  clientId: string; acknowledged: boolean | null; signedDate: string | null; onSaved: () => void;
}) {
  const [date, setDate] = useState(signedDate ?? new Date().toISOString().slice(0, 10));
  useEffect(() => setDate(signedDate ?? new Date().toISOString().slice(0, 10)), [signedDate]);
  const fn = useServerFn(setGrievanceAcknowledgment);
  const ack = useMutation({
    mutationFn: () => fn({ data: { clientId, acknowledged: true, signedDate: date } }),
    onSuccess: () => { toast.success("Grievance acknowledgment recorded."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (acknowledged) {
    return (
      <NectarAsk
        question="Grievance policy acknowledged?"
        kind="simple_yes_no"
        answeredSummary={`Client / representative acknowledged on ${signedDate ?? "unknown date"}`}
        clientId={clientId}
        uploadDocumentType="grievance_acknowledgment"
      />
    );
  }
  return (
    <NectarAsk
      question="Has the client / representative signed the grievance-policy acknowledgment? (SOW §1.10(11))"
      kind="data_rich_gap"
      clientId={clientId}
      uploadDocumentType="grievance_acknowledgment"
      onNone={async () => {
        await fn({ data: { clientId, acknowledged: false } });
        onSaved();
      }}
      manualForm={
        <div className="space-y-2">
          <Label className="text-xs">Signed date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-full md:w-60" />
          <Button size="sm" onClick={() => ack.mutate()} disabled={ack.isPending}>
            {ack.isPending ? "Saving…" : "Confirm acknowledgment"}
          </Button>
        </div>
      }
    />
  );
}

// ── HRC chain (existing hrc_reviews table) ──────────────────────────────
function RightsRestrictionRow({
  clientId, restrictions, onSaved,
}: { clientId: string; restrictions: string[] | null; onSaved: () => void }) {
  const hasRestrictions = (restrictions ?? []).length > 0;
  const [yes, setYes] = useState<boolean | null>(hasRestrictions ? true : null);
  useEffect(() => { if (hasRestrictions) setYes(true); }, [hasRestrictions]);
  const reviewsQ = useQuery({
    queryKey: ["hrc-reviews-for-client", clientId],
    queryFn: async () => {
      const list = useServerFnSafe(listHrcReviewsForClient);
      const r = await list({ data: { clientId } });
      return r.reviews as Array<{ id: string; status: string; restriction_summary: string | null }>;
    },
    enabled: yes === true,
  });
  const createFn = useServerFn(createHrcReview);
  const [summary, setSummary] = useState("");
  const createM = useMutation({
    mutationFn: () => createFn({ data: { clientId, restriction_summary: summary, status: "pending" } }),
    onSuccess: () => {
      toast.success("HRC review created (pending).");
      setSummary("");
      onSaved();
      reviewsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Rights restrictions (§1.20 — HRC chain)</div>
        <Gavel className="h-4 w-4 text-muted-foreground" />
      </div>
      {yes === null && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setYes(true)}>Yes — restrictions exist</Button>
          <Button size="sm" variant="ghost" onClick={() => setYes(false)}>No / none</Button>
        </div>
      )}
      {yes === false && (
        <div className="mt-2 text-xs text-muted-foreground">No rights restrictions reported.</div>
      )}
      {yes === true && (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-muted-foreground">
            DSPD §1.20: every restriction requires an HRC review + documented informed consent.
            Link an existing review, create a new one, or upload the signed approval.
          </div>
          {reviewsQ.data && reviewsQ.data.length > 0 && (
            <div className="space-y-1 rounded border border-border bg-background p-2">
              <div className="text-xs font-semibold">Existing HRC reviews</div>
              {reviewsQ.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{r.restriction_summary ?? "(no summary)"}</span>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Create new HRC review</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summarize the restriction(s)"
              rows={2}
            />
            <Button size="sm" onClick={() => createM.mutate()} disabled={createM.isPending || !summary.trim()}>
              {createM.isPending ? "Creating…" : "Create HRC review (pending)"}
            </Button>
          </div>
          <NectarAsk
            question="Upload signed HRC approval"
            kind="data_rich_gap"
            clientId={clientId}
            uploadDocumentType="hrc_approval"
            onNone={() => { /* no-op, group stays expanded */ }}
          />
        </div>
      )}
    </div>
  );
}

// useServerFnSafe — useServerFn returns a stable callable; we wrap it so
// React Query's queryFn can call it without smuggling hooks into the body.
function useServerFnSafe<T extends (...args: never[]) => unknown>(fn: T): T {
  // useServerFn is hook-safe at call sites; this indirection keeps types tidy.
  return useServerFn(fn as unknown as Parameters<typeof useServerFn>[0]) as T;
}

// ── Advanced care / end-of-life (collapsed by default, never blocks) ────
type EolField = "dnr_status" | "polst_status" | "palliative_care_status" | "hospice_status";

const EOL_QUESTIONS: Array<{ field: EolField; question: string; positive: string; needsLocation?: boolean }> = [
  { field: "dnr_status", question: "Does this client have a DNR on file?", positive: "DNR on file", needsLocation: true },
  { field: "polst_status", question: "Does this client have a POLST on file?", positive: "POLST on file" },
  { field: "palliative_care_status", question: "Does this client have palliative care orders?", positive: "Palliative care orders on file" },
  { field: "hospice_status", question: "Does this client have hospice protocols on file?", positive: "Hospice protocols on file" },
];

function EndOfLifeGroup({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["client-eol", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("dnr_status, dnr_location, polst_status, palliative_care_status, hospice_status, special_directions")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      // Detect NECTAR EOL signals from any uploaded client_documents text:
      // simplest signal — special_directions contains EOL keywords, OR any
      // EOL status column is already non-null. We also look for matching
      // document_type rows that imply EOL was discussed.
      const { data: docs } = await supabase
        .from("client_documents")
        .select("document_type")
        .eq("client_id", clientId)
        .in("document_type", ["dnr", "polst", "palliative", "hospice"]);
      return {
        row: (data ?? {}) as Record<string, string | null>,
        nectarDetected: (docs ?? []).length > 0,
      };
    },
  });

  const detected = useMemo(() => {
    const row = q.data?.row ?? {};
    const anyStatus = ["dnr_status", "polst_status", "palliative_care_status", "hospice_status"]
      .some((k) => !!(row[k] && row[k] !== "none"));
    const specials = (row.special_directions ?? "").toLowerCase();
    const kw = ["hospice", "palliative", "comfort care", "polst", "dnr"]
      .some((k) => specials.includes(k));
    return anyStatus || kw || !!q.data?.nectarDetected;
  }, [q.data]);

  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? detected;

  const setFn = useServerFn(setEndOfLifeStatus);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-eol", clientId] });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpenOverride(open ? false : true)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left min-h-11"
      >
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold">Advanced care / end-of-life</div>
            <div className="text-xs text-muted-foreground">
              Optional — does not block submission.
              {detected && (
                <span className="ml-1 text-primary">
                  NECTAR detected end-of-life signals — please confirm.
                </span>
              )}
            </div>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4">
          {EOL_QUESTIONS.map((row) => {
            const current = (q.data?.row?.[row.field] as string | null) ?? null;
            const answered = current ? (current === "none" ? "Not on file" : row.positive) : null;
            return (
              <NectarAsk
                key={row.field}
                question={row.question}
                kind="data_rich_gap"
                clientId={clientId}
                uploadDocumentType={
                  row.field === "dnr_status" ? "dnr"
                    : row.field === "polst_status" ? "polst"
                    : row.field === "palliative_care_status" ? "palliative"
                    : "hospice"
                }
                answeredSummary={answered}
                onYes={async () => {
                  if (row.needsLocation) return;
                  await setFn({ data: { clientId, field: row.field, status: "on_file" } });
                  refresh();
                }}
                onNone={async () => {
                  await setFn({ data: { clientId, field: row.field, status: "none" } });
                  refresh();
                }}
                manualForm={row.needsLocation ? (
                  <DnrLocationForm
                    clientId={clientId}
                    initialLocation={(q.data?.row?.dnr_location as string | null) ?? ""}
                    onSaved={refresh}
                  />
                ) : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DnrLocationForm({
  clientId, initialLocation, onSaved,
}: { clientId: string; initialLocation: string; onSaved: () => void }) {
  const [loc, setLoc] = useState(initialLocation);
  const setFn = useServerFn(setEndOfLifeStatus);
  const m = useMutation({
    mutationFn: () => setFn({ data: { clientId, field: "dnr_status", status: "on_file", location: loc.trim() } }),
    onSuccess: () => { toast.success("DNR location saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <Label className="text-xs">Where is the DNR kept?</Label>
      <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. front of binder, fridge magnet…" />
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !loc.trim()}>
        {m.isPending ? "Saving…" : "Save DNR location"}
      </Button>
    </div>
  );
}
