import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, Circle, Loader2, Printer, GraduationCap, Search, FileSignature } from "lucide-react";

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
};

type PersonModule = { id: string; title: string; user_id: string };

type Progress = {
  user_id: string;
  topic_kind: "core" | "person";
  ref_id: string;
  status: "not_started" | "in_progress" | "completed";
};

const DSPD_ORDER = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n"];

export function TrainingRecordsAdmin() {
  const { data: org } = useCurrentOrg();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in_progress" | "not_started">("all");
  const [search, setSearch] = useState("");

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
        .select("id, user_id, topic_kind, ref_id, topic_code, topic_title, dspd_letter, attestation_statement, typed_signature, completed_at, is_current, signer_full_name, signer_email, consent_statement, consent_accepted, content_version, ip_address, user_agent, time_zone, content_hash")
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

  const selectedMember = members?.find((m) => m.id === selectedUserId);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Agency-wide training overview</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Who has completed what. Click a staff member to open their audit-ready record.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
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
                    <td className="py-2 font-medium">{o.label}</td>
                    <td className="py-2 tabular-nums">{o.coreDone} / {o.coreTotal}</td>
                    <td className="py-2 tabular-nums">{o.personDone} / {o.personTotal}</td>
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
                      <Button size="sm" variant="outline" onClick={() => setSelectedUserId(o.id)}>
                        Open record
                      </Button>
                    </td>
                  </tr>
                ))}
              {!overview.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                    No staff found in this organization.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Staff member</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a staff member…" />
              </SelectTrigger>
              <SelectContent>
                {members?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Filter by status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger>
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
          <Button
            variant="outline"
            disabled={!selectedUserId}
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print audit-ready PDF
          </Button>
        </div>

        {selectedUserId && (
          <StaffRecordTable
            staffId={selectedUserId}
            staffLabel={selectedMember?.label ?? ""}
            topics={topics ?? []}
            personModules={(personModules ?? []).filter((pm) => pm.user_id === selectedUserId)}
            progress={(progressAll ?? []).filter((p) => p.user_id === selectedUserId)}
            completions={(completionsAll ?? []).filter((c) => c.user_id === selectedUserId)}
            statusFilter={statusFilter}
          />
        )}
      </div>
    </div>
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

  // DSPD a–n ordered first using dspd_letter; then person modules under (o); then extras
  const dspdTopics = DSPD_ORDER.map((letter) => topics.find((t) => t.dspd_letter === letter)).filter(
    (t): t is Topic => !!t,
  );
  const extraTopics = topics.filter((t) => !t.dspd_letter);

  type Row =
    | { kind: "core"; topic: Topic; letter?: string }
    | { kind: "person"; module: PersonModule; letter: string };

  const dspdRows: Row[] = [
    ...dspdTopics.map((t) => ({ kind: "core" as const, topic: t, letter: t.dspd_letter ?? undefined })),
    ...personModules.map((pm) => ({ kind: "person" as const, module: pm, letter: "o" })),
  ];

  const extraRows: Row[] = extraTopics.map((t) => ({ kind: "core" as const, topic: t }));

  const passesFilter = (row: Row): boolean => {
    if (statusFilter === "all") return true;
    const key = row.kind === "core" ? `core:${row.topic.id}` : `person:${row.module.id}`;
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
      <tr key={`${row.kind}-${refId}-${idx}`} className="border-b border-border/60 last:border-0 align-top">
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
      </tr>
    );
  };

  return (
    <div className="mt-4 space-y-3 print:mt-0">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">DSPD audit format:</span> rows below mirror the Utah
          DSPD "In-Depth Review Tool — Part IV: Staff Requirements" §1.8(4)(a–o) checklist for{" "}
          <span className="font-semibold text-foreground">{staffLabel}</span>.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left">§1.8(4)</th>
              <th className="py-2 pr-3 text-left">Status</th>
              <th className="py-2 pr-3 text-left">Training item · attestation</th>
              <th className="py-2 pr-3 text-left">Completed</th>
              <th className="py-2 pr-3 text-left">Typed signature</th>
            </tr>
          </thead>
          <tbody>
            {dspdRows.filter(passesFilter).map(renderRow)}
          </tbody>
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
                  <th className="py-2 pr-3 text-left">Training item · attestation</th>
                  <th className="py-2 pr-3 text-left">Completed</th>
                  <th className="py-2 pr-3 text-left">Typed signature</th>
                </tr>
              </thead>
              <tbody>
                {extraRows.filter(passesFilter).map(renderRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="pt-2 text-[10px] text-muted-foreground print:pt-4">
        Record generated from HIVE training_completions audit table · staff id {staffId.slice(0, 8)}…
      </p>
    </div>
  );
}
