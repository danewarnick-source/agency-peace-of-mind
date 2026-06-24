import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Printer,
  GraduationCap,
  Search,
  FileSignature,
  Download,
  Calendar,
  BookOpen,
} from "lucide-react";
import {
  getOrgCeRoster,
  getStaffCeLedger,
  type CeRosterRow,
} from "@/lib/ce.functions";
import { toast } from "sonner";
import { TrainingCertificateDialog } from "@/components/training/training-certificate-dialog";

type Topic = {
  id: string;
  code: string;
  title: string;
  category: string;
  dspd_letter: string | null;
  sort_order: number;
};

type Completion = {
  id: string;
  user_id: string;
  topic_kind: "core" | "person";
  ref_id: string;
  topic_code: string | null;
  topic_title: string;
  dspd_letter: string | null;
  attestation_statement: string;
  typed_signature: string;
  completed_at: string;
  is_current: boolean;
  signer_full_name: string | null;
  signer_email: string | null;
  consent_statement: string | null;
  consent_accepted: boolean | null;
  content_version: string | null;
  ip_address: string | null;
  user_agent: string | null;
  time_zone: string | null;
  content_hash: string | null;
  question_answers: Array<{ question: string; answer: string }> | null;
};

type PersonModule = { id: string; title: string; user_id: string };

type Progress = {
  user_id: string;
  topic_kind: "core" | "person";
  ref_id: string;
  status: "not_started" | "in_progress" | "completed";
};

type OtherAssignment = {
  id: string;
  staff_id: string;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
};

type TrainingType = "core" | "person" | "ce" | "other";
const TYPE_LABEL: Record<TrainingType, string> = {
  core: "30-Day Core Training",
  person: "Person-Specific Training",
  ce: "Continuing Education",
  other: "Other / Assigned",
};

const DSPD_ORDER = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n"];

function escapeCsv(s: unknown): string {
  const v = String(s ?? "");
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TrainingRecordsAdmin() {
  const { data: org } = useCurrentOrg();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUserId, setModalUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedTypes, setSelectedTypes] = useState<Set<TrainingType>>(
    new Set(["core", "person", "ce", "other"]),
  );
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleType = (t: TrainingType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };
  const toggleStaff = (id: string) => {
    setSelectedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: members } = useQuery({
    enabled: !!org,
    queryKey: ["records-org-members", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email, username")
        .in("id", ids);
      return (profs ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({ id: p.id, label: p.full_name || p.email || p.username || "—" }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const { data: topics } = useQuery({
    queryKey: ["training-topics-admin"],
    queryFn: async (): Promise<Topic[]> => {
      const { data } = await supabase
        .from("training_topics")
        .select("id, code, title, category, dspd_letter, sort_order")
        .order("sort_order", { ascending: true });
      return (data ?? []) as Topic[];
    },
  });

  const memberIds = useMemo(() => (members ?? []).map((m) => m.id), [members]);

  const { data: progressAll } = useQuery({
    enabled: memberIds.length > 0,
    queryKey: ["records-progress-all", memberIds.join(",")],
    queryFn: async (): Promise<Progress[]> => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("user_id, topic_kind, ref_id, status")
        .in("user_id", memberIds);
      return (data ?? []) as Progress[];
    },
  });

  const { data: completionsAll } = useQuery({
    enabled: memberIds.length > 0,
    queryKey: ["records-completions-all", memberIds.join(",")],
    queryFn: async (): Promise<Completion[]> => {
      const { data } = await supabase
        .from("training_completions")
        .select(
          "id, user_id, topic_kind, ref_id, topic_code, topic_title, dspd_letter, attestation_statement, typed_signature, completed_at, is_current, signer_full_name, signer_email, consent_statement, consent_accepted, content_version, ip_address, user_agent, time_zone, content_hash, question_answers",
        )
        .in("user_id", memberIds)
        .eq("is_current", true)
        .order("completed_at", { ascending: false });
      return (data ?? []) as Completion[];
    },
  });

  const { data: personModules } = useQuery({
    enabled: memberIds.length > 0,
    queryKey: ["records-person-modules", memberIds.join(",")],
    queryFn: async (): Promise<PersonModule[]> => {
      const { data } = await supabase
        .from("training_person_modules")
        .select("id, title, user_id")
        .in("user_id", memberIds);
      return (data ?? []) as PersonModule[];
    },
  });

  const { data: otherAssignments } = useQuery({
    enabled: memberIds.length > 0,
    queryKey: ["records-other-all", memberIds.join(",")],
    queryFn: async (): Promise<OtherAssignment[]> => {
      const { data } = await supabase
        .from("staff_other_assignments")
        .select("id, staff_id, title, status, due_date, completed_at")
        .in("staff_id", memberIds);
      return (data ?? []) as OtherAssignment[];
    },
  });

  const fetchCeRoster = useServerFn(getOrgCeRoster);
  const fetchCeLedger = useServerFn(getStaffCeLedger);
  const { data: ceRoster } = useQuery({
    enabled: !!org,
    queryKey: ["ce-roster-records", org?.organization_id],
    queryFn: () => fetchCeRoster(),
  });

  const filteredMembers = (members ?? []).filter((m) =>
    !search.trim() ? true : m.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Overview metrics per staff member
  const overview = useMemo(() => {
    const totalCore = topics?.length ?? 0;
    return (members ?? []).map((m) => {
      const coreDone = (progressAll ?? []).filter(
        (p) => p.user_id === m.id && p.topic_kind === "core" && p.status === "completed",
      ).length;
      const persons = (personModules ?? []).filter((pm) => pm.user_id === m.id);
      const personDone = (progressAll ?? []).filter(
        (p) => p.user_id === m.id && p.topic_kind === "person" && p.status === "completed",
      ).length;
      const totalAll = totalCore + persons.length;
      const doneAll = coreDone + personDone;
      return {
        id: m.id,
        label: m.label,
        coreDone,
        coreTotal: totalCore,
        personDone,
        personTotal: persons.length,
        pct: totalAll ? Math.round((doneAll / totalAll) * 100) : 0,
      };
    });
  }, [members, topics, progressAll, personModules]);

  

  const selectAllStaff = () => {
    setSelectedStaffIds(new Set(filteredMembers.map((m) => m.id)));
  };
  const clearStaffSelection = () => setSelectedStaffIds(new Set());

  function buildExportRows(): string[][] {
    const header = [
      "Training Type",
      "Staff",
      "Email",
      "Item / Topic",
      "DSPD §1.8(4)",
      "Status",
      "Completed",
      "Hours",
      "Active Minutes",
      "Typed Signature",
      "Attestation",
    ];
    const out: string[][] = [header];
    const staffIds =
      selectedStaffIds.size > 0
        ? Array.from(selectedStaffIds)
        : filteredMembers.map((m) => m.id);
    const staffLookup = new Map((members ?? []).map((m) => [m.id, m.label]));
    const includeCore = selectedTypes.has("core");
    const includePerson = selectedTypes.has("person");
    const includeOther = selectedTypes.has("other");

    for (const sid of staffIds) {
      const label = staffLookup.get(sid) ?? "";
      const memberCompletions = (completionsAll ?? []).filter((c) => c.user_id === sid);
      const memberProgress = (progressAll ?? []).filter((p) => p.user_id === sid);
      const memberPersons = (personModules ?? []).filter((pm) => pm.user_id === sid);
      const progressMap = new Map(
        memberProgress.map((p) => [`${p.topic_kind}:${p.ref_id}`, p.status]),
      );
      const completionMap = new Map(
        memberCompletions.map((c) => [`${c.topic_kind}:${c.ref_id}`, c]),
      );

      if (includeCore) {
        for (const t of topics ?? []) {
          const key = `core:${t.id}`;
          const status = progressMap.get(key) ?? "not_started";
          const c = completionMap.get(key);
          out.push([
            TYPE_LABEL.core,
            label,
            "",
            t.title,
            t.dspd_letter ?? "",
            status,
            c ? new Date(c.completed_at).toISOString() : "",
            "",
            "",
            c?.typed_signature ?? "",
            c?.attestation_statement ?? "",
          ]);
        }
      }
      if (includePerson) {
        for (const pm of memberPersons) {
          const key = `person:${pm.id}`;
          const status = progressMap.get(key) ?? "not_started";
          const c = completionMap.get(key);
          out.push([
            TYPE_LABEL.person,
            label,
            "",
            pm.title,
            "o",
            status,
            c ? new Date(c.completed_at).toISOString() : "",
            "",
            "",
            c?.typed_signature ?? "",
            c?.attestation_statement ?? "",
          ]);
        }
      }
      if (includeOther) {
        const others = (otherAssignments ?? []).filter((o) => o.staff_id === sid);
        for (const o of others) {
          out.push([
            TYPE_LABEL.other,
            label,
            "",
            o.title,
            "",
            o.status,
            o.completed_at ? new Date(o.completed_at).toISOString() : "",
            "",
            "",
            "",
            "",
          ]);
        }
      }
    }
    return out;
  }

  async function exportSelected() {
    if (selectedTypes.size === 0) {
      toast.error("Pick at least one training type.");
      return;
    }
    setExporting(true);
    try {
      const rows = buildExportRows();

      // CE rows: fetch ledger per selected staff (or all visible) on demand.
      if (selectedTypes.has("ce")) {
        const staffIds =
          selectedStaffIds.size > 0
            ? Array.from(selectedStaffIds)
            : filteredMembers.map((m) => m.id);
        const staffLookup = new Map((members ?? []).map((m) => [m.id, m.label]));
        for (const sid of staffIds) {
          const label = staffLookup.get(sid) ?? "";
          const entries = await fetchCeLedger({ data: { staffId: sid } });
          for (const e of entries) {
            rows.push([
              TYPE_LABEL.ce,
              label,
              "",
              e.title,
              "",
              "completed",
              new Date(e.completed_at).toISOString(),
              Number(e.hours).toFixed(1),
              String(e.active_minutes),
              e.signature_name,
              `Continuing Education — ${e.type}`,
            ]);
          }
        }
      }

      const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
      const types = Array.from(selectedTypes).join("-");
      downloadCsv(
        `training-records-${types}-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
      toast.success("Export ready.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function printSelected() {
    window.print();
  }

  const showCe = selectedTypes.has("ce");
  const showCore = selectedTypes.has("core");
  const showPerson = selectedTypes.has("person");
  const showOther = selectedTypes.has("other");

  return (
    <div className="space-y-4">
      {/* Toolbar — type filters + export */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Training Records — single audit home</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              All training types in one place. Pick types and staff, then export
              or print exactly the records you need.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={exportSelected}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? "Building…" : "Export selected (CSV)"}
            </Button>
            <Button variant="outline" size="sm" onClick={printSelected}>
              <Printer className="mr-1.5 h-4 w-4" /> Print selected
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {(["core", "person", "ce", "other"] as TrainingType[]).map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                selectedTypes.has(t)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              <Checkbox
                checked={selectedTypes.has(t)}
                onCheckedChange={() => toggleType(t)}
                aria-label={TYPE_LABEL[t]}
                className="h-3.5 w-3.5"
              />
              {TYPE_LABEL[t]}
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {selectedStaffIds.size > 0
                ? `${selectedStaffIds.size} staff selected`
                : `All ${filteredMembers.length} staff will be exported`}
            </span>
            <Button variant="ghost" size="sm" onClick={selectAllStaff}>
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearStaffSelection}
              disabled={selectedStaffIds.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Core + Person-Specific overview (with selection) */}
      {(showCore || showPerson) && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">
              Core + Person-Specific — agency overview
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tick rows to include them in the export. Click "Open record" for the
            full per-staff audit table.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-8 py-2 text-left print:hidden"></th>
                  <th className="py-2 text-left">Staff</th>
                  <th className="py-2 text-left">Core (a–n + extras)</th>
                  <th className="py-2 text-left">Person-specific (o)</th>
                  <th className="py-2 text-left">% complete</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {overview
                  .filter((o) => filteredMembers.some((m) => m.id === o.id))
                  .map((o) => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 print:hidden">
                        <Checkbox
                          checked={selectedStaffIds.has(o.id)}
                          onCheckedChange={() => toggleStaff(o.id)}
                          aria-label={`Select ${o.label}`}
                        />
                      </td>
                      <td className="py-2 font-medium">{o.label}</td>
                      <td className="py-2 tabular-nums">
                        {o.coreDone} / {o.coreTotal}
                      </td>
                      <td className="py-2 tabular-nums">
                        {o.personDone} / {o.personTotal}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                              style={{ width: `${o.pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{o.pct}%</span>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setModalUserId(o.id);
                            setModalOpen(true);
                          }}
                        >
                          Open record
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!overview.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No staff found in this organization.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Continuing Education roster */}
      {showCe && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-semibold">
                Continuing Education — annual roster
              </h3>
            </div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {ceRoster?.goalHours ?? 12} hours / staff / year · Year 2+
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Rolling X / 12 hours per staff member, with the signed CE ledger
            available on export.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-8 py-2 text-left print:hidden"></th>
                  <th className="py-2 text-left">Staff</th>
                  <th className="py-2 text-left">Start date</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Hours this year</th>
                  <th className="py-2 text-left">Progress</th>
                  <th className="py-2 text-left">Year ends</th>

                </tr>
              </thead>
              <tbody>
                {(ceRoster?.rows ?? [])
                  .filter((r) =>
                    !search.trim()
                      ? true
                      : r.fullName.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((r: CeRosterRow) => {
                    const pct = r.ceApplies
                      ? Math.min(100, (r.hoursThisYear / r.goalHours) * 100)
                      : 0;
                    return (
                      <tr
                        key={r.staffId}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 print:hidden">
                          <Checkbox
                            checked={selectedStaffIds.has(r.staffId)}
                            onCheckedChange={() => toggleStaff(r.staffId)}
                            aria-label={`Select ${r.fullName}`}
                          />
                        </td>
                        <td className="py-2 font-medium">{r.fullName}</td>
                        <td className="py-2 whitespace-nowrap text-xs text-muted-foreground">{r.hireDate ?? "—"}</td>

                        <td className="py-2">
                          {r.status === "complete" && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              Complete
                            </Badge>
                          )}
                          {r.status === "on_track" && (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              On track
                            </Badge>
                          )}
                          {r.status === "behind" && (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                              Behind
                            </Badge>
                          )}
                          {r.status === "not_applicable" && (
                            <Badge variant="outline">Year 1</Badge>
                          )}
                        </td>
                        <td className="py-2 tabular-nums">
                          {r.ceApplies ? (
                            <>
                              <span className="font-semibold">
                                {r.hoursThisYear.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}/ {r.goalHours}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 min-w-[140px]">
                          {r.ceApplies ? (
                            <Progress value={pct} className="h-2" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 whitespace-nowrap text-xs text-muted-foreground">
                          {r.ceYearEnd ?? "—"}
                          {r.ceApplies && (
                            <div>{r.daysLeftInYear} days left</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {(!ceRoster || ceRoster.rows.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}

                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No CE roster data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Other / Assigned */}
      {showOther && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-semibold">Other / Assigned trainings</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Trainings admins or Nectar assigned to staff outside the core /
            person-specific tracks.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left">Staff</th>
                  <th className="py-2 text-left">Title</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Completed</th>
                  <th className="py-2 text-left">Signature</th>
                </tr>
              </thead>
              <tbody>
                {(otherAssignments ?? [])
                  .filter((o) => {
                    if (selectedStaffIds.size === 0) return true;
                    return selectedStaffIds.has(o.staff_id);
                  })
                  .map((o) => {
                    const staffLabel =
                      (members ?? []).find((m) => m.id === o.staff_id)?.label ??
                      "—";
                    return (
                      <tr
                        key={o.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 font-medium">{staffLabel}</td>
                        <td className="py-2">{o.title}</td>
                        <td className="py-2 text-xs">{o.status}</td>
                        <td className="py-2 text-xs tabular-nums">
                          {o.completed_at
                            ? new Date(o.completed_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-2 text-xs">—</td>
                      </tr>
                    );
                  })}
                {(!otherAssignments || otherAssignments.length === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No assigned trainings.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalUserId && (
        <StaffAuditRecordModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          staffId={modalUserId}
          staffLabel={members?.find((m) => m.id === modalUserId)?.label ?? ""}
          topics={topics ?? []}
          personModules={(personModules ?? []).filter(
            (pm) => pm.user_id === modalUserId,
          )}
          progress={(progressAll ?? []).filter(
            (p) => p.user_id === modalUserId,
          )}
          completions={(completionsAll ?? []).filter(
            (c) => c.user_id === modalUserId,
          )}
        />
      )}
    </div>
  );
}

function StaffAuditRecordModal({
  open,
  onClose,
  staffId,
  staffLabel,
  topics,
  personModules,
  progress,
  completions,
}: {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffLabel: string;
  topics: Topic[];
  personModules: PersonModule[];
  progress: Progress[];
  completions: Completion[];
}) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "in_progress" | "not_started"
  >("all");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="text-lg">
            Training Audit Record — {staffLabel}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            DSPD audit format · §1.8(4)(a–o) checklist
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="flex flex-wrap items-end gap-3 mb-4 sticky top-0 bg-background z-10 pb-3 border-b">
            <div className="w-44">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Filter by status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="not_started">Not started</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Print audit-ready PDF
            </Button>
          </div>
          
          <StaffRecordTable
            staffId={staffId}
            staffLabel={staffLabel}
            topics={topics}
            personModules={personModules}
            progress={progress}
            completions={completions}
            statusFilter={statusFilter}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StaffRecordTable({
  staffId,
  staffLabel,
  topics,
  personModules,
  progress,
  completions,
  statusFilter,
}: {
  staffId: string;
  staffLabel: string;
  topics: Topic[];
  personModules: PersonModule[];
  progress: Progress[];
  completions: Completion[];
  statusFilter: "all" | "completed" | "in_progress" | "not_started";
}) {
  const [openRecord, setOpenRecord] = useState<Completion | null>(null);
  const progressMap = useMemo(() => {
    const m = new Map<string, Progress["status"]>();
    progress.forEach((p) => m.set(`${p.topic_kind}:${p.ref_id}`, p.status));
    return m;
  }, [progress]);

  const completionMap = useMemo(() => {
    const m = new Map<string, Completion>();
    completions.forEach((c) => m.set(`${c.topic_kind}:${c.ref_id}`, c));
    return m;
  }, [completions]);

  const dspdTopics = DSPD_ORDER.map((letter) =>
    topics.find((t) => t.dspd_letter === letter),
  ).filter((t): t is Topic => !!t);
  const extraTopics = topics.filter((t) => !t.dspd_letter);

  type Row =
    | { kind: "core"; topic: Topic; letter?: string }
    | { kind: "person"; module: PersonModule; letter: string }
    | { kind: "completion"; completion: Completion };

  const dspdRows: Row[] = [
    ...dspdTopics.map((t) => ({
      kind: "core" as const,
      topic: t,
      letter: t.dspd_letter ?? undefined,
    })),
    ...personModules.map((pm) => ({
      kind: "person" as const,
      module: pm,
      letter: "o",
    })),
  ];

  const extraRows: Row[] = extraTopics.map((t) => ({
    kind: "core" as const,
    topic: t,
  }));

  // Surface client-specific & support-strategies completions that don't map to a training_topic row.
  const SPECIAL_CODES = new Set(["client_specific_training", "support_strategies_training"]);
  const matchedCompletionKeys = new Set<string>();
  [...dspdRows, ...extraRows].forEach((r) => {
    if (r.kind === "core") matchedCompletionKeys.add(`core:${r.topic.id}`);
    else if (r.kind === "person") matchedCompletionKeys.add(`person:${r.module.id}`);
  });
  const specialCompletionRows: Row[] = completions
    .filter(
      (c) =>
        SPECIAL_CODES.has(c.topic_code ?? "") &&
        !matchedCompletionKeys.has(`${c.topic_kind}:${c.ref_id}`),
    )
    .map((c) => ({ kind: "completion" as const, completion: c }));
  const allExtraRows: Row[] = [...extraRows, ...specialCompletionRows];

  const passesFilter = (row: Row): boolean => {
    if (statusFilter === "all") return true;
    const key =
      row.kind === "core" ? `core:${row.topic.id}` : `person:${row.module.id}`;
    const s = progressMap.get(key) ?? "not_started";
    return s === statusFilter;
  };

  const renderRow = (row: Row, idx: number) => {
    const refId = row.kind === "core" ? row.topic.id : row.module.id;
    const key = `${row.kind}:${refId}`;
    const status = progressMap.get(key) ?? "not_started";
    const completion = completionMap.get(key);
    const title = row.kind === "core" ? row.topic.title : row.module.title;
    const isDone = status === "completed";
    const isProg = status === "in_progress";

    return (
      <tr
        key={`${row.kind}-${refId}-${idx}`}
        className="border-b border-border/60 last:border-0 align-top"
      >
        <td className="py-2 pr-3 text-center text-xs font-bold uppercase tabular-nums">
          {row.letter ? `(${row.letter})` : "—"}
        </td>
        <td className="py-2 pr-3">
          {isDone ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-bold uppercase">Completed</span>
            </span>
          ) : isProg ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Loader2 className="h-4 w-4" />
              <span className="text-xs font-bold uppercase">In progress</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Circle className="h-4 w-4" />
              <span className="text-xs font-bold uppercase">Not started</span>
            </span>
          )}
        </td>
        <td className="py-2 pr-3">
          <p className="text-sm font-semibold">{title}</p>
          {completion && (
            <p className="mt-1 text-[11px] italic leading-relaxed text-muted-foreground">
              "{completion.attestation_statement}"
            </p>
          )}
        </td>
        <td className="py-2 pr-3 text-xs tabular-nums">
          {completion ? new Date(completion.completed_at).toLocaleDateString() : "—"}
        </td>
        <td className="py-2 pr-3 text-xs font-medium">
          {completion?.typed_signature ?? "—"}
        </td>
        <td className="py-2 pr-3 text-right">
          {completion && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenRecord(completion)}
            >
              <FileSignature className="mr-1 h-3.5 w-3.5" /> View record
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="mt-4 space-y-3 print:mt-0">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">DSPD audit format:</span>{" "}
          rows below mirror the Utah DSPD "In-Depth Review Tool — Part IV: Staff
          Requirements" §1.8(4)(a–o) checklist for{" "}
          <span className="font-semibold text-foreground">{staffLabel}</span>.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left">§1.8(4)</th>
              <th className="py-2 pr-3 text-left">Status</th>
              <th className="py-2 pr-3 text-left">
                Training item · attestation
              </th>
              <th className="py-2 pr-3 text-left">Completed</th>
              <th className="py-2 pr-3 text-left">Typed signature</th>
              <th className="py-2 pr-3 text-right"></th>
            </tr>
          </thead>
          <tbody>{dspdRows.filter(passesFilter).map(renderRow)}</tbody>
        </table>
      </div>

      {extraRows.filter(passesFilter).length > 0 && (
        <div>
          <h4 className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Additional HIVE training topics
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 text-left w-16">—</th>
                  <th className="py-2 pr-3 text-left">Status</th>
                  <th className="py-2 pr-3 text-left">
                    Training item · attestation
                  </th>
                  <th className="py-2 pr-3 text-left">Completed</th>
                  <th className="py-2 pr-3 text-left">Typed signature</th>
                  <th className="py-2 pr-3 text-right"></th>
                </tr>
              </thead>
              <tbody>{extraRows.filter(passesFilter).map(renderRow)}</tbody>
            </table>
          </div>
        </div>
      )}

      <p className="pt-2 text-[10px] text-muted-foreground print:pt-4">
        Record generated from HIVE training_completions audit table · staff id{" "}
        {staffId.slice(0, 8)}…
      </p>

      <Dialog open={!!openRecord} onOpenChange={(v) => !v && setOpenRecord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Signed training record</DialogTitle>
          </DialogHeader>
          {openRecord && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-semibold">Topic:</span>{" "}
                {openRecord.topic_title}
              </div>
              <div>
                <span className="font-semibold">Completed:</span>{" "}
                {new Date(openRecord.completed_at).toLocaleString()}
              </div>
              <div>
                <span className="font-semibold">Signature:</span>{" "}
                {openRecord.typed_signature}
              </div>
              <div className="italic text-muted-foreground">
                "{openRecord.attestation_statement}"
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
