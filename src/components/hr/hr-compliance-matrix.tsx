import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Minus,
  Clock,
  AlertTriangle,
  GraduationCap,
  Upload,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getHrComplianceMatrix,
  getHrDocumentUrl,
  type HrMatrix,
  type HrMatrixCell,
  type HrMatrixStaff,
} from "@/lib/hr-staff.functions";
import { AnnualHoursCell } from "@/components/hr/annual-hours-progress";
import { toast } from "sonner";

type GroupMode = "manager" | "house" | "flat";

/**
 * Org-wide HR compliance matrix (staff × requirements). Reads the same data
 * layer as the per-staff card view; never owns its own completion logic.
 * Caller gating is enforced server-side (admin → all, manager → own team).
 */
export function HrComplianceMatrix({
  organizationId,
}: {
  organizationId: string;
}) {
  const fetchMatrix = useServerFn(getHrComplianceMatrix);
  const getDocUrl = useServerFn(getHrDocumentUrl);
  const [group, setGroup] = useState<GroupMode>("manager");

  const q = useQuery({
    queryKey: ["hr-matrix", organizationId],
    queryFn: () =>
      fetchMatrix({ data: { organization_id: organizationId } }),
  });

  const todayMs = Date.now();
  const in60Ms = todayMs + 60 * 86400_000;

  const bands = useMemo(() => {
    const data = q.data;
    if (!data) return [] as Array<{ key: string; label: string; staff: HrMatrixStaff[]; managerId: string | null }>;
    if (group === "flat") {
      return [
        { key: "all", label: "All staff", staff: data.staff, managerId: null },
      ];
    }
    const map = new Map<string, { label: string; staff: HrMatrixStaff[]; managerId: string | null }>();
    for (const s of data.staff) {
      let key: string;
      let label: string;
      let managerId: string | null = null;
      if (group === "manager") {
        if (!s.team_id) {
          key = "__unassigned__";
          label = "Unassigned";
        } else {
          key = `t:${s.team_id}`;
          const mgr = s.manager_name ?? "No manager assigned";
          label = `${mgr} — ${s.team_name ?? "Team"}`;
          managerId = s.manager_id;
        }
      } else {
        // house = team
        key = s.team_id ?? "__unassigned__";
        label = s.team_id ? (s.team_name ?? "Team") : "Unassigned";
      }
      if (!map.has(key))
        map.set(key, { label, staff: [], managerId });
      map.get(key)!.staff.push(s);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [q.data, group]);

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading
          compliance matrix…
        </CardContent>
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }
  const data = q.data as HrMatrix;
  if (data.staff.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No staff visible in your HR scope.
        </CardContent>
      </Card>
    );
  }

  const reqs = useMemo(() => sortByPhase(data.requirements), [data.requirements]);
  const phaseGroups = useMemo(() => groupByPhase(reqs), [reqs]);


  const viewEvidence = async (docId: string) => {
    try {
      const r = await getDocUrl({
        data: { organization_id: organizationId, hr_document_id: docId },
      });
      window.open(r.signed_url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">HR Compliance Matrix</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff × requirements. Renewable items show expiry colored by urgency
            (green current, amber ≤60 days, red overdue). Cells read the same
            data as each staffer's HR tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={group} onValueChange={(v) => setGroup(v as GroupMode)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="house">House / Team</SelectItem>
              <SelectItem value="flat">All staff flat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TooltipProvider delayDuration={200}>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 bg-background border-b border-r border-border px-3 py-2 text-left font-medium min-w-[180px] align-bottom"
                  >
                    Staff
                  </th>
                  {phaseGroups.map((g) => (
                    <th
                      key={`phase-${g.phase ?? "unphased"}`}
                      colSpan={g.reqs.length}
                      className="border-b border-l border-border bg-muted/40 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {PHASE_LABEL[g.phase ?? "unphased"] ?? "Other"}
                    </th>
                  ))}
                </tr>
                <tr>
                  {reqs.map((r) => {
                    const isCum = r.requirement_type === "cumulative_hours";
                    return (
                      <th
                        key={r.requirement_id}
                        className={`border-b border-border px-2 py-2 text-center font-medium ${
                          isCum ? "min-w-[110px]" : "min-w-[72px]"
                        }`}
                      >
                        <HeaderLabel req={r} />
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {bands.map((band) => {
                  const summary = computeBandSummary(
                    band.staff,
                    reqs,
                    todayMs,
                    in60Ms,
                  );
                  return (
                    <BandRows
                      key={band.key}
                      band={band}
                      summary={summary}
                      reqs={reqs}
                      todayMs={todayMs}
                      in60Ms={in60Ms}
                      onEvidence={viewEvidence}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
        <div className="flex flex-wrap items-center gap-3 border-t border-border p-3 text-[11px] text-muted-foreground">
          <LegendDot color="bg-emerald-500" label="Complete (current)" />
          <LegendDot color="bg-amber-500" label="Due ≤60 days" />
          <LegendDot color="bg-rose-500" label="Expired / overdue" />
          <LegendDot color="bg-muted" label="Not started" />
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-600" /> In progress
          </span>
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3 w-3 text-emerald-600" /> Signed by
            staff (training)
          </span>
          <span className="inline-flex items-center gap-1">
            <Upload className="h-3 w-3" /> Uploaded by admin
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function BandRows({
  band,
  summary,
  reqs,
  todayMs,
  in60Ms,
  onEvidence,
}: {
  band: { key: string; label: string; staff: HrMatrixStaff[]; managerId: string | null };
  summary: { expired: number; dueSoon: number; total: number };
  reqs: ReturnType<() => HrMatrix["requirements"]> extends infer T ? T : never;
  todayMs: number;
  in60Ms: number;
  onEvidence: (docId: string) => void;
}) {
  const clean = summary.expired === 0 && summary.dueSoon === 0;
  return (
    <>
      <tr>
        <td
          colSpan={reqs.length + 1}
          className="sticky left-0 z-10 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        >
          <div className="flex items-center gap-2">
            <span>{band.label}</span>
            {summary.total > 0 ? (
              clean ? (
                <Badge className="bg-emerald-600 text-white">all current</Badge>
              ) : (
                <Badge variant="destructive">
                  {summary.expired > 0 && `${summary.expired} expired`}
                  {summary.expired > 0 && summary.dueSoon > 0 && " · "}
                  {summary.dueSoon > 0 && `${summary.dueSoon} due soon`}
                </Badge>
              )
            ) : null}
            {summary.expired > 0 && (
              <span
                className="inline-flex items-center gap-1 text-rose-600"
                title="A renewable item in this team is expired"
              >
                <AlertTriangle className="h-3 w-3" /> manager flag
              </span>
            )}
          </div>
        </td>
      </tr>
      {band.staff.map((s) => (
        <tr key={s.staff_id} className="hover:bg-muted/30">
          <td className="sticky left-0 z-10 bg-background border-b border-r border-border px-3 py-1.5 font-medium">
            <div className="truncate max-w-[200px]">{s.full_name}</div>
            {s.team_name && (
              <div className="text-[10px] text-muted-foreground truncate">
                {s.team_name}
              </div>
            )}
          </td>
          {reqs.map((r) => {
            const cell = s.cells[r.requirement_id];
            return (
              <td
                key={r.requirement_id}
                className="border-b border-border px-1 py-1 text-center align-middle"
              >
                <CellView
                  req={r}
                  cell={cell}
                  todayMs={todayMs}
                  in60Ms={in60Ms}
                  onEvidence={onEvidence}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function CellView({
  req,
  cell,
  todayMs,
  in60Ms,
  onEvidence,
}: {
  req: HrMatrix["requirements"][number];
  cell: HrMatrixCell | undefined;
  todayMs: number;
  in60Ms: number;
  onEvidence: (docId: string) => void;
}) {
  // N/A — confirmed not applicable to this staffer's type(s).
  if (cell && cell.applicable === false) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded border border-dashed border-border bg-muted/30 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            N/A
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Not applicable to this staffer's type
        </TooltipContent>
      </Tooltip>
    );
  }
  // Cumulative-hours requirements render as a progress meter regardless of
  // the binary status (status will be 'not_started' since no checklist row).
  if (req.requirement_type === "cumulative_hours" && cell?.cumulative_progress) {
    return <AnnualHoursCell progress={cell.cumulative_progress} />;
  }
  if (!cell || cell.status === "not_started") {
    return (
      <span className="inline-block h-6 w-6 rounded border border-dashed border-border" />
    );
  }
  if (cell.status === "in_progress") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent>In progress — not yet complete</TooltipContent>
      </Tooltip>
    );
  }
  if (cell.status === "waived") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Minus className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Waived</TooltipContent>
      </Tooltip>
    );
  }
  // complete or expired
  const expiryMs = cell.expires_at ? new Date(cell.expires_at).getTime() : null;
  const isExpired =
    cell.status === "expired" || (expiryMs !== null && expiryMs < todayMs);
  const isSoon =
    expiryMs !== null && expiryMs >= todayMs && expiryMs <= in60Ms;
  const color = isExpired
    ? "bg-rose-500"
    : isSoon
      ? "bg-amber-500"
      : "bg-emerald-500";
  const sourceIcon = cell.training_completion_id ? (
    <GraduationCap className="h-2.5 w-2.5 text-emerald-700" />
  ) : cell.evidence_document_id ? (
    <Upload className="h-2.5 w-2.5 text-muted-foreground" />
  ) : null;

  const inner = (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-white ${color}`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      {req.is_renewable && cell.expires_at && (
        <span
          className={
            "text-[10px] leading-none " +
            (isExpired
              ? "text-rose-600"
              : isSoon
                ? "text-amber-700"
                : "text-muted-foreground")
          }
        >
          {cell.expires_at.slice(2)}
        </span>
      )}
      {sourceIcon && <span className="inline-flex">{sourceIcon}</span>}
    </span>
  );

  const tip = (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium">{req.title}</div>
      {cell.completed_date && <div>Completed {cell.completed_date}</div>}
      {req.is_renewable && cell.expires_at && (
        <div>
          Expires {cell.expires_at}
          {req.renewal_interval_months &&
            ` (${req.renewal_interval_months} mo interval)`}
        </div>
      )}
      <div className="text-muted-foreground">
        {cell.training_completion_id
          ? "Signed by staff (training)"
          : cell.evidence_document_id
            ? "Uploaded by admin / manager"
            : "Marked complete by admin / manager"}
      </div>
    </div>
  );

  if (cell.evidence_document_id) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onEvidence(cell.evidence_document_id!)}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {inner}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{inner}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function computeBandSummary(
  staff: HrMatrixStaff[],
  reqs: HrMatrix["requirements"],
  todayMs: number,
  in60Ms: number,
) {
  let expired = 0;
  let dueSoon = 0;
  let total = 0;
  const renewable = reqs.filter((r) => r.is_renewable);
  for (const s of staff) {
    for (const r of renewable) {
      const c = s.cells[r.requirement_id];
      if (!c || c.applicable === false) continue;
      if (c.status !== "complete" && c.status !== "expired") continue;
      total++;
      const ts = c.expires_at ? new Date(c.expires_at).getTime() : null;
      if (c.status === "expired" || (ts !== null && ts < todayMs)) {
        expired++;
      } else if (ts !== null && ts <= in60Ms) {
        dueSoon++;
      }
    }
  }
  return { expired, dueSoon, total };
}

function deriveShortLabel(title: string): string {
  let t = title.replace(/^\s*Training\s*:\s*/i, "").trim();
  t = t.replace(/\s*\(.*?\)\s*/g, " ").trim();
  t = t.split(/\s+[–—\-·:/]\s+/)[0].trim();
  t = t
    .replace(/Professional/gi, "Prof.")
    .replace(/Communicable/gi, "Comm.")
    .replace(/Disease[s]?/gi, "Disease")
    .replace(/Prevention/gi, "Prev.")
    .replace(/Response/gi, "Resp.")
    .replace(/Management/gi, "Mgmt")
    .replace(/Discrimination/gi, "Disc.")
    .replace(/Certification/gi, "Cert");
  t = t.replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  let out = words[0] ?? t;
  for (let i = 1; i < words.length && out.length + 1 + words[i].length <= 14; i++) {
    out += " " + words[i];
  }
  if (out.length > 16) out = out.slice(0, 15) + "…";
  return out;
}

function HeaderLabel({ req }: { req: HrMatrix["requirements"][number] }) {
  const short =
    (req as { short_label?: string }).short_label?.trim() ||
    deriveShortLabel(req.title);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="inline-flex flex-col items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="whitespace-nowrap">{short}</span>
          {req.is_renewable && req.renewal_interval_months && (
            <span className="text-[9px] font-normal text-muted-foreground">
              {req.renewal_interval_months}mo
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          <div className="font-medium">{req.title}</div>
          {req.source_citation && (
            <div className="text-[11px] opacity-80">{req.source_citation}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
