import { useMemo, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Plus,
  UserPlus,
  Archive as ArchiveIcon,
  RotateCcw,
  Upload,
  Sparkles,
  FileText,
} from "lucide-react";
import {
  createReferral,
  createSupportCoordinator,
  findPossibleDuplicateReferral,
  getReferralPipelineStats,
  listReferrals,
  listSupportCoordinators,
  type ReferralStage,
} from "@/lib/referrals.functions";
import {
  archiveReferral,
  restoreReferral,
  listArchivedReferrals,
} from "@/lib/retention.functions";
import {
  recordReferralDocument,
  parseReferralDocument,
  attachDraftDocumentsToReferral,
  type ReferralPrefill,
} from "@/lib/referral-docs.functions";
import {
  PipelineStatsBar,
  ReferralDetailDialog,
  ReferralStageBadge,
  StageAdvancer,
} from "./referral-pipeline";
import { ProviderInterestOutlineButton } from "./provider-interest-outline";
import { MatchScorePanel } from "./match-score-panel";


type Category = "direct_support" | "rhs" | "hhs";
const CATEGORIES: { key: Category; label: string }[] = [
  { key: "direct_support", label: "Direct Support" },
  { key: "rhs", label: "RHS" },
  { key: "hhs", label: "HHS" },
];


function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ReferralsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const listFn = useServerFn(listReferrals);
  const scListFn = useServerFn(listSupportCoordinators);
  const statsFn = useServerFn(getReferralPipelineStats);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");


  const referrals = useQuery({
    enabled: !!orgId,
    queryKey: ["referrals", orgId],
    queryFn: () => listFn({ data: { organization_id: orgId! } }),
  });
  const scs = useQuery({
    enabled: !!orgId,
    queryKey: ["support-coordinators", orgId],
    queryFn: () => scListFn({ data: { organization_id: orgId! } }),
  });
  const stats = useQuery({
    enabled: !!orgId,
    queryKey: ["referral-pipeline-stats", orgId],
    queryFn: () => statsFn({ data: { organization_id: orgId! } }),
  });

  const scById = useMemo(() => {
    const m = new Map<string, { name: string; agency: string | null }>();
    (scs.data ?? []).forEach((s) => m.set(s.id, { name: s.name, agency: s.agency }));
    return m;
  }, [scs.data]);

  const grouped = useMemo(() => {
    const out: Record<Category | "unsorted", NonNullable<typeof referrals.data>> = {
      direct_support: [],
      rhs: [],
      hhs: [],
      unsorted: [],
    };
    (referrals.data ?? []).forEach((r) => {
      const c = (r.category ?? "unsorted") as Category | "unsorted";
      if (out[c]) out[c].push(r);
      else out.unsorted.push(r);
    });
    return out;
  }, [referrals.data]);


  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Referrals</h2>
          <p className="text-sm text-muted-foreground">
            Prospective-client intake inquiries. Move through the pipeline; log
            every contact, meeting, and note. Matching and follow-up email land
            in later increments.
          </p>
        </div>
        {orgId && (
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setView("active")}
                className={`rounded px-3 py-1 ${view === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setView("archived")}
                className={`rounded px-3 py-1 ${view === "archived" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Archived
              </button>
            </div>
            <ProviderInterestOutlineButton organizationId={orgId} />
            <NewReferralDialog organizationId={orgId} />
          </div>
        )}
      </div>

      {view === "archived" && orgId ? (
        <ArchivedReferralsList organizationId={orgId} />
      ) : (
        <>
      <PipelineStatsBar stats={stats.data} />



      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {([
          ...CATEGORIES,
          ...(grouped.unsorted.length > 0
            ? ([{ key: "unsorted" as const, label: "Unsorted" }])
            : []),
        ]).map((cat) => {
          const rows = (grouped as Record<string, typeof grouped.unsorted>)[cat.key] ?? [];

          return (
            <section
              key={cat.key}
              className="min-w-0 rounded-md border border-border bg-card p-3"
            >
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{cat.label}</h3>
                <Badge variant="secondary">{rows.length}</Badge>
              </header>
              {referrals.isLoading ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No referrals yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((r) => {
                    const sc = r.support_coordinator_id
                      ? scById.get(r.support_coordinator_id)
                      : null;
                    const loc = [r.location_city, r.location_county]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <li
                        key={r.id}
                        className="rounded-md border border-border bg-background p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setDetailId(r.id)}
                          >
                            <div className="truncate font-medium">
                              {r.first_name}
                              {r.age != null && (
                                <span className="ml-1 text-muted-foreground">
                                  · age {r.age}
                                </span>
                              )}
                            </div>
                            {loc && (
                              <div className="truncate text-xs text-muted-foreground">
                                {loc}
                              </div>
                            )}
                          </button>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <ReferralStageBadge
                              stage={(r.stage ?? "new") as ReferralStage}
                            />
                            {r.due_date && (
                              <Badge variant="outline" className="text-[10px]">
                                Due {r.due_date}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {sc && (
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            SC: {sc.name}
                            {sc.agency ? ` · ${sc.agency}` : ""}
                          </div>
                        )}
                        {r.requested_codes && r.requested_codes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.requested_codes.slice(0, 6).map((c) => (
                              <Badge key={c} variant="secondary" className="text-[10px]">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {orgId && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <StageAdvancer
                              organizationId={orgId}
                              referralId={r.id}
                              currentStage={(r.stage ?? "new") as ReferralStage}
                            />
                            <div className="flex items-center gap-3">
                              <ArchiveReferralButton organizationId={orgId} referralId={r.id} />
                              <button
                                type="button"
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => setDetailId(r.id)}
                              >
                                Activity →
                              </button>
                            </div>
                          </div>
                        )}
                        {r.stage === "decision" && r.decision_outcome && (
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            Outcome:{" "}
                            <span className="font-medium">
                              {r.decision_outcome}
                            </span>
                            {r.decision_reason ? ` — ${r.decision_reason}` : ""}
                          </div>
                        )}
                        {orgId && (
                          <div className="mt-2">
                            <MatchScorePanel
                              organizationId={orgId}
                              referralId={r.id}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
        </>
      )}



      {orgId && (
        <ReferralDetailDialog
          organizationId={orgId}
          referralId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
        />
      )}
    </div>
  );
}

// ─── New Referral dialog ───────────────────────────────────────

function NewReferralDialog({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const scListFn = useServerFn(listSupportCoordinators);
  const createScFn = useServerFn(createSupportCoordinator);
  const createRefFn = useServerFn(createReferral);
  const dupCheckFn = useServerFn(findPossibleDuplicateReferral);
  const recordDocFn = useServerFn(recordReferralDocument);
  const parseDocFn = useServerFn(parseReferralDocument);
  const attachDocsFn = useServerFn(attachDraftDocumentsToReferral);

  const scs = useQuery({
    queryKey: ["support-coordinators", organizationId],
    queryFn: () => scListFn({ data: { organization_id: organizationId } }),
    enabled: open,
  });

  // draft key links uploaded docs before referral exists
  const draftKeyRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
  );

  // form state
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [needLevel, setNeedLevel] = useState("");
  const [disabilityTypes, setDisabilityTypes] = useState("");
  const [disabilityLevel, setDisabilityLevel] = useState("");
  const [requestedCodes, setRequestedCodes] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [scId, setScId] = useState<string>("");
  const [duplicates, setDuplicates] = useState<
    Awaited<ReturnType<typeof dupCheckFn>> | null
  >(null);

  // upload / parse state
  const [uploadedDocs, setUploadedDocs] = useState<
    Array<{ id: string; name: string; mime: string | null }>
  >([]);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // inline SC create
  const [showScForm, setShowScForm] = useState(false);
  const [scName, setScName] = useState("");
  const [scAgency, setScAgency] = useState("");
  const [scEmail, setScEmail] = useState("");
  const [scPhone, setScPhone] = useState("");
  const [scRegion, setScRegion] = useState("");

  const reset = () => {
    setFirstName("");
    setAge("");
    setGender("");
    setCity("");
    setCounty("");
    setCategory("");
    setNeedLevel("");
    setDisabilityTypes("");
    setDisabilityLevel("");
    setRequestedCodes("");
    setBudgetNote("");
    setDescription("");
    setNotes("");
    setDueDate("");
    setScId("");
    setDuplicates(null);
    setShowScForm(false);
    setScName("");
    setScAgency("");
    setScEmail("");
    setScPhone("");
    setScRegion("");
    setUploadedDocs([]);
    setPasteText("");
    setParseMsg(null);
    setAutoFilled(new Set());
    draftKeyRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
  };

  // Apply prefill — only sets fields the user hasn't already touched (treat
  // empty current value as "untouched"). Tracks which fields were auto-filled.
  const applyPrefill = (p: ReferralPrefill) => {
    const filled = new Set(autoFilled);
    const set = (key: string, current: string, next?: string | number | null) => {
      if (next == null || next === "") return null;
      if (current.trim().length > 0) return null;
      filled.add(key);
      return String(next);
    };
    const arrSet = (key: string, current: string, next?: string[]) => {
      if (!next || next.length === 0) return null;
      if (current.trim().length > 0) return null;
      filled.add(key);
      return next.join(", ");
    };
    const fn = set("first_name", firstName, p.first_name);
    if (fn != null) setFirstName(fn);
    const a = set("age", age, p.age);
    if (a != null) setAge(a);
    const g = set("gender", gender, p.gender);
    if (g != null) setGender(g);
    const ci = set("location_city", city, p.location_city);
    if (ci != null) setCity(ci);
    const co = set("location_county", county, p.location_county);
    if (co != null) setCounty(co);
    const dl = set("disability_level", disabilityLevel, p.disability_level);
    if (dl != null) setDisabilityLevel(dl);
    const dt = arrSet("disability_types", disabilityTypes, p.disability_types);
    if (dt != null) setDisabilityTypes(dt);
    const rc = arrSet("requested_codes", requestedCodes, p.requested_codes);
    if (rc != null) setRequestedCodes(rc);
    const bn = set("budget_note", budgetNote, p.budget_note);
    if (bn != null) setBudgetNote(bn);
    const nl = set("need_level", needLevel, p.need_level);
    if (nl != null) setNeedLevel(nl);
    const ds = set("description", description, p.description);
    if (ds != null) setDescription(ds);
    const nt = set("notes", notes, p.notes);
    if (nt != null) setNotes(nt);
    const dd = set("due_date", dueDate, p.due_date);
    if (dd != null) setDueDate(dd);
    if (p.category && !category) {
      filled.add("category");
      setCategory(p.category);
    }
    setAutoFilled(filled);
  };

  const uploadAndParse = async (file: File) => {
    setParseMsg(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
      const path = `${organizationId}/draft-${draftKeyRef.current}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("referral-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const doc = await recordDocFn({
        data: {
          organization_id: organizationId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          draft_key: draftKeyRef.current,
        },
      });
      setUploadedDocs((prev) => [...prev, { id: doc.id, name: doc.file_name, mime: doc.mime_type }]);

      setParsing(true);
      const res = await parseDocFn({
        data: { organization_id: organizationId, document_id: doc.id },
      });
      if (res.ok) {
        applyPrefill(res.fields);
        const count = Object.keys(res.fields).filter(
          (k) => res.fields[k as keyof ReferralPrefill] != null,
        ).length;
        setParseMsg(
          count > 0
            ? `NECTAR pre-filled ${count} field${count === 1 ? "" : "s"} — review and correct before saving.`
            : "Doc stored. NECTAR couldn't extract structured fields — fill manually.",
        );
      } else {
        setParseMsg(res.message);
      }
    } catch (e) {
      setParseMsg((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const parsePastedText = async () => {
    if (!pasteText.trim()) return;
    setParseMsg(null);
    setParsing(true);
    try {
      const res = await parseDocFn({
        data: { organization_id: organizationId, text: pasteText },
      });
      if (res.ok) {
        applyPrefill(res.fields);
        const count = Object.keys(res.fields).filter(
          (k) => res.fields[k as keyof ReferralPrefill] != null,
        ).length;
        setParseMsg(
          count > 0
            ? `NECTAR pre-filled ${count} field${count === 1 ? "" : "s"} from pasted text — review before saving.`
            : "Couldn't extract structured fields. Use the notes field below.",
        );
      } else {
        setParseMsg(res.message);
      }
    } catch (e) {
      setParseMsg((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const createSc = useMutation({
    mutationFn: () =>
      createScFn({
        data: {
          organization_id: organizationId,
          name: scName.trim(),
          agency: scAgency || null,
          email: scEmail || null,
          phone: scPhone || null,
          region: scRegion || null,
        },
      }),
    onSuccess: (row) => {
      toast.success("Support Coordinator added");
      qc.invalidateQueries({ queryKey: ["support-coordinators", organizationId] });
      if (row?.id) setScId(row.id);
      setShowScForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runDupCheck = async () => {
    if (!firstName.trim()) return;
    try {
      const rows = await dupCheckFn({
        data: {
          organization_id: organizationId,
          first_name: firstName.trim(),
          age: age ? Number(age) : null,
          support_coordinator_id: scId || null,
        },
      });
      setDuplicates(rows);
    } catch {
      setDuplicates(null);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const row = await createRefFn({
        data: {
          organization_id: organizationId,
          first_name: firstName.trim(),
          age: age ? Number(age) : null,
          gender: gender || null,
          date_of_birth: null,
          location_city: city || null,
          location_county: county || null,
          disability_types: splitList(disabilityTypes),
          disability_level: disabilityLevel || null,
          requested_codes: splitList(requestedCodes).map((s) => s.toUpperCase()),
          budget_note: budgetNote || null,
          need_level: needLevel || null,
          description: description || null,
          notes: notes || null,
          category: (category || null) as Category | null,
          source: uploadedDocs.length > 0 ? "manual_upload" : "manual_upload",
          support_coordinator_id: scId || null,
          due_date: dueDate || null,
        },
      });
      if (row?.id && uploadedDocs.length > 0) {
        await attachDocsFn({
          data: {
            organization_id: organizationId,
            draft_key: draftKeyRef.current,
            referral_id: row.id,
          },
        });
      }
      return row;
    },
    onSuccess: () => {
      toast.success("Referral created");
      qc.invalidateQueries({ queryKey: ["referrals", organizationId] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAuto = (k: string) => autoFilled.has(k);
  const autoMark = (k: string) =>
    isAuto(k) ? (
      <Badge variant="secondary" className="ml-2 gap-1 text-[10px]">
        <Sparkles className="h-3 w-3" /> auto-filled
      </Badge>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New referral
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New referral</DialogTitle>
        </DialogHeader>

        {/* Upload + parse — NECTAR pre-fill */}
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" /> NECTAR pre-fill (optional)
              </h4>
              <p className="text-xs text-muted-foreground">
                Upload a referral PDF/image or paste forwarded email text. NECTAR will
                read it and pre-fill what it can — you review and correct before saving.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAndParse(f);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="gap-1 shrink-0"
            >
              <Upload className="h-4 w-4" /> Upload doc
            </Button>
          </div>

          <div>
            <Label htmlFor="paste-text" className="text-xs">
              …or paste forwarded email / referral text
            </Label>
            <Textarea
              id="paste-text"
              rows={3}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the body of a referral email here…"
              className="text-xs"
            />
            <div className="mt-1 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!pasteText.trim() || parsing}
                onClick={parsePastedText}
                className="gap-1"
              >
                <Sparkles className="h-3 w-3" />
                {parsing ? "Parsing…" : "Parse with NECTAR"}
              </Button>
            </div>
          </div>

          {uploadedDocs.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Linked documents:
              </div>
              <ul className="space-y-1">
                {uploadedDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{d.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parseMsg && (
            <p className="text-xs text-muted-foreground">{parseMsg}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-3">
          <div className="md:col-span-1">
            <Label htmlFor="ref-first">
              First name * {autoMark("first_name")}
            </Label>
            <Input
              id="ref-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={runDupCheck}
              placeholder="At minimum, save with just a name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-1">
            <div>
              <Label htmlFor="ref-age">Age {autoMark("age")}</Label>
              <Input
                id="ref-age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                onBlur={runDupCheck}
              />
            </div>
            <div>
              <Label htmlFor="ref-gender">Gender {autoMark("gender")}</Label>
              <Input
                id="ref-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
            </div>
          </div>

          {/* NOTES — prominent, every intake path */}
          <div className="md:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <Label htmlFor="ref-notes" className="text-sm font-semibold">
              Notes {autoMark("notes")}
            </Label>
            <p className="mb-1 text-xs text-muted-foreground">
              Notes from calls, emails, or any context that helps build this referral.
              NECTAR will use this alongside the structured fields when matching.
            </p>
            <Textarea
              id="ref-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Free-form — anything the SC mentioned, family preferences, scheduling constraints…"
            />
          </div>

          <div>
            <Label>Category {autoMark("category")}</Label>
            <Select
              value={category || undefined}
              onValueChange={(v) => setCategory(v as Category)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unsorted (optional)" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ref-due">Due date {autoMark("due_date")}</Label>
            <Input
              id="ref-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ref-city">City {autoMark("location_city")}</Label>
            <Input
              id="ref-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ref-county">County {autoMark("location_county")}</Label>
            <Input
              id="ref-county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ref-need">Need level {autoMark("need_level")}</Label>
            <Input
              id="ref-need"
              value={needLevel}
              onChange={(e) => setNeedLevel(e.target.value)}
              placeholder="e.g. T2, high supervision"
            />
          </div>
          <div>
            <Label htmlFor="ref-dlevel">
              Disability level {autoMark("disability_level")}
            </Label>
            <Input
              id="ref-dlevel"
              value={disabilityLevel}
              onChange={(e) => setDisabilityLevel(e.target.value)}
              placeholder="e.g. mild / moderate / severe"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-dtypes">
              Disability types {autoMark("disability_types")}
            </Label>
            <Input
              id="ref-dtypes"
              value={disabilityTypes}
              onChange={(e) => setDisabilityTypes(e.target.value)}
              placeholder="Comma-separated (e.g. ID, autism, physical)"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-codes">
              Requested codes {autoMark("requested_codes")}
            </Label>
            <Input
              id="ref-codes"
              value={requestedCodes}
              onChange={(e) => setRequestedCodes(e.target.value)}
              placeholder="Comma-separated (e.g. RHS, DSG, PBA)"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-budget">
              Budget / funding note {autoMark("budget_note")}
            </Label>
            <Input
              id="ref-budget"
              value={budgetNote}
              onChange={(e) => setBudgetNote(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Support Coordinator</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex-1">
                <Select
                  value={scId}
                  onValueChange={(v) => {
                    setScId(v);
                    setTimeout(runDupCheck, 0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Support Coordinator…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(scs.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.agency ? ` — ${s.agency}` : ""}
                      </SelectItem>
                    ))}
                    {(scs.data ?? []).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No coordinators yet — add one →
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowScForm((v) => !v)}
                className="gap-1"
              >
                <UserPlus className="h-4 w-4" />
                {showScForm ? "Cancel" : "Add new"}
              </Button>
            </div>

            {showScForm && (
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/40 p-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="sc-name">Name *</Label>
                  <Input
                    id="sc-name"
                    value={scName}
                    onChange={(e) => setScName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-agency">Agency</Label>
                  <Input
                    id="sc-agency"
                    value={scAgency}
                    onChange={(e) => setScAgency(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-region">Region</Label>
                  <Input
                    id="sc-region"
                    value={scRegion}
                    onChange={(e) => setScRegion(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-email">Email</Label>
                  <Input
                    id="sc-email"
                    type="email"
                    value={scEmail}
                    onChange={(e) => setScEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sc-phone">Phone</Label>
                  <Input
                    id="sc-phone"
                    value={scPhone}
                    onChange={(e) => setScPhone(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => createSc.mutate()}
                    disabled={!scName.trim() || createSc.isPending}
                  >
                    Save coordinator
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="ref-desc">
              Description {autoMark("description")}
            </Label>
            <Textarea
              id="ref-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {duplicates && duplicates.length > 0 && (
            <div className="md:col-span-2">
              <Alert variant="default" className="border-amber-400 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Possible duplicate</AlertTitle>
                <AlertDescription>
                  {duplicates.length} similar referral
                  {duplicates.length > 1 ? "s" : ""} created in the last 90
                  days. You can proceed anyway.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!firstName.trim() || create.isPending}
          >
            Create referral
          </Button>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}

// ─── Archived list ─────────────────────────────────────────────

function ArchivedReferralsList({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listArchivedReferrals);
  const restoreFn = useServerFn(restoreReferral);

  const q = useQuery({
    queryKey: ["referrals-archived", organizationId],
    queryFn: () => listFn({ data: { organization_id: organizationId } }),
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      restoreFn({ data: { organization_id: organizationId, referral_id: id } }),
    onSuccess: () => {
      toast.success("Referral restored");
      qc.invalidateQueries({ queryKey: ["referrals-archived", organizationId] });
      qc.invalidateQueries({ queryKey: ["referrals", organizationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading archived…</p>;
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No archived referrals.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pAfter = r.purge_after ? new Date(r.purge_after) : null;
        const aged = pAfter ? pAfter.getTime() < Date.now() : false;
        return (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm opacity-90"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{r.first_name}</span>
                <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                {aged ? (
                  <Badge variant="destructive" className="text-[10px]">Past grace — eligible to purge</Badge>
                ) : pAfter ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Purges {pAfter.toLocaleDateString()}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Archived {r.archived_at ? new Date(r.archived_at).toLocaleString() : "—"}
                {r.archive_reason ? ` · ${r.archive_reason}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={aged || restore.isPending}
              onClick={() => restore.mutate(r.id)}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Restore
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function ArchiveReferralButton({
  organizationId,
  referralId,
}: {
  organizationId: string;
  referralId: string;
}) {
  const qc = useQueryClient();
  const archiveFn = useServerFn(archiveReferral);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () =>
      archiveFn({
        data: {
          organization_id: organizationId,
          referral_id: referralId,
          reason: reason.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Referral archived");
      qc.invalidateQueries({ queryKey: ["referrals", organizationId] });
      qc.invalidateQueries({ queryKey: ["referrals-archived", organizationId] });
      setOpen(false);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-destructive"
        >
          <ArchiveIcon className="mr-1 inline h-3 w-3" />
          Archive
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive referral</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Archive is soft — recoverable until the purge grace period elapses.
          A log entry is written to the activity timeline.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="archive-reason">Reason (optional)</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. SC withdrew, placed elsewhere…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
