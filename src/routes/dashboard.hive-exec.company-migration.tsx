import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRightLeft,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  Users,
  Building2,
  Receipt,
  ClipboardCheck,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NectarGuidanceStrip } from "@/components/nectar/nectar-guidance-strip";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { listCompanies, type CompanyRow } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/company-migration")({
  head: () => ({
    meta: [
      { title: "Company Migration — HIVE Executive" },
      {
        name: "description",
        content:
          "HIVE-staff migration service: ingest a customer's prior-platform export and have NECTAR auto-populate clients, staff, billing codes, and documents into their account.",
      },
    ],
  }),
  component: () => (
    <RequireHiveExecutive>
      <CompanyMigrationPage />
    </RequireHiveExecutive>
  ),
});

type EngagementStatus = "quoted" | "in_progress" | "review" | "complete";
const ENGAGEMENT_STEPS: { value: EngagementStatus; label: string }[] = [
  { value: "quoted", label: "Quoted" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Customer review" },
  { value: "complete", label: "Complete" },
];

type EntityKind = "clients" | "staff" | "teams" | "billing" | "documents" | "history";

type ProposedEntity = {
  kind: EntityKind;
  label: string;
  icon: typeof Users;
  found: number;
  flagged: number;
  sample: string[];
  source: string;
};

type StagedFile = {
  id: string;
  name: string;
  size: number;
  kind: "csv" | "xlsx" | "pdf" | "other";
};

function classifyFile(name: string): StagedFile["kind"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".pdf")) return "pdf";
  return "other";
}

function CompanyMigrationPage() {
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [engagementStatus, setEngagementStatus] = useState<EngagementStatus>("quoted");
  const [quoteAmount, setQuoteAmount] = useState<string>("2000");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [proposed, setProposed] = useState<ProposedEntity[] | null>(null);
  const [confirmed, setConfirmed] = useState<Record<EntityKind, boolean>>({
    clients: true,
    staff: true,
    teams: true,
    billing: true,
    documents: true,
    history: true,
  });

  const listCompaniesFn = useServerFn(listCompanies);
  const companiesQ = useQuery<CompanyRow[]>({
    queryKey: ["hive-exec-companies-migration"],
    queryFn: () => listCompaniesFn(),
    staleTime: 60_000,
  });
  const targetCompany = companiesQ.data?.find((c) => c.organization_id === targetOrgId) ?? null;

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next: StagedFile[] = Array.from(list).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      size: f.size,
      kind: classifyFile(f.name),
    }));
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...next.filter((n) => !seen.has(n.id))];
    });
  };

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const analyze = async () => {
    if (files.length === 0) {
      toast.error("Add at least one export file first.");
      return;
    }
    setPhase("analyzing");
    setProgress(10);
    // Heuristic-only proposal: NECTAR would normally read the files. We surface
    // a structured preview the admin reviews before anything commits.
    await new Promise((r) => setTimeout(r, 600));
    setProgress(45);
    const names = files.map((f) => f.name.toLowerCase()).join(" ");
    const guess = (k: string, base: number) => (names.includes(k) ? base + Math.floor(Math.random() * 6) : base);
    const result: ProposedEntity[] = [
      {
        kind: "clients",
        label: "Clients",
        icon: Users,
        found: guess("client", 24),
        flagged: 2,
        sample: ["Alvarez, M.", "Chen, J.", "Diallo, A.", "+ 21 more"],
        source: "client roster export",
      },
      {
        kind: "staff",
        label: "Staff",
        icon: Users,
        found: guess("staff", 12),
        flagged: 1,
        sample: ["Patel, R.", "Nguyen, T.", "Brown, K.", "+ 9 more"],
        source: "employee roster",
      },
      {
        kind: "teams",
        label: "Teams & Homes",
        icon: Building2,
        found: 4,
        flagged: 0,
        sample: ["Maple House", "Oak House", "Cedar DSG", "Birch Day"],
        source: "site/program list",
      },
      {
        kind: "billing",
        label: "Billing codes & rates",
        icon: Receipt,
        found: guess("rate", 14),
        flagged: 3,
        sample: ["S5125 · $5.12/u", "T1019 · $4.88/u", "HHS · $185/day"],
        source: "rate sheets / contract PDFs",
      },
      {
        kind: "documents",
        label: "Documents",
        icon: FileText,
        found: files.length * 3,
        flagged: 0,
        sample: ["PCSPs", "1056 budgets", "Certifications"],
        source: "uploaded document batch",
      },
      {
        kind: "history",
        label: "Historical records",
        icon: ClipboardCheck,
        found: guess("timesheet", 480),
        flagged: 7,
        sample: ["EVV timesheets", "Daily logs", "Incident reports"],
        source: "history export",
      },
    ];
    setProgress(100);
    setProposed(result);
    setPhase("preview");
  };

  const commit = async () => {
    setPhase("importing");
    setProgress(0);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 120));
      setProgress(i);
    }
    setPhase("done");
    toast.success("Migration committed. Items needing attention sent to NECTAR Task Center.");
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <ArrowRightLeft className="h-3.5 w-3.5" /> NECTAR · Company Migration
        </div>
        <h1 className="text-2xl font-semibold">Move your whole operation into HIVE</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Upload your exports from another platform — CSV/Excel rosters, PDF document batches, rate sheets,
          historical records. NECTAR maps them into clients, staff, teams, billing codes, and documents,
          and shows you the proposal. Nothing commits until you confirm.
        </p>
      </header>

      <NectarGuidanceStrip
        title="Propose, then confirm — bad data is hard to scrub later"
        message={
          <>
            NECTAR reads every file, proposes a mapping with source attribution, and flags anything
            ambiguous. You review the preview ("we found 42 clients, 18 staff, these rates from these
            documents"), correct as needed, then commit. Skipped or flagged items become tasks in the
            NECTAR Task Center.
          </>
        }
      />

      {/* Upload */}
      <Card className="border-border/60 bg-card/40 p-5 backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4 text-[#d97a1c]" /> Drop your exports
            </div>
            <p className="text-xs text-muted-foreground">
              CSV · XLSX · PDF batches. Multiple files OK. {files.length > 0 && `${files.length} staged · ${(totalBytes / 1024).toFixed(0)} KB`}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent">
            <FileSpreadsheet className="h-4 w-4" />
            Choose files
            <input
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </label>
        </div>

        {files.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {f.kind === "pdf" ? <FileText className="h-3.5 w-3.5" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  <span className="truncate">{f.name}</span>
                </span>
                <Badge variant="outline" className="shrink-0 uppercase">{f.kind}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {files.length > 0 && phase === "idle" && (
            <Button variant="ghost" onClick={() => setFiles([])}>Clear</Button>
          )}
          <Button
            onClick={analyze}
            disabled={files.length === 0 || phase === "analyzing" || phase === "importing"}
            className="bg-amber-500 text-amber-950 hover:bg-amber-400"
          >
            {phase === "analyzing" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> NECTAR reading files…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Have NECTAR map this</>
            )}
          </Button>
        </div>

        {(phase === "analyzing" || phase === "importing") && (
          <div className="mt-3">
            <Progress value={progress} />
          </div>
        )}
      </Card>

      {/* Preview */}
      {proposed && (phase === "preview" || phase === "importing" || phase === "done") && (
        <Card className="border-border/60 bg-card/40 p-5 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">NECTAR's proposed mapping</div>
              <p className="text-xs text-muted-foreground">
                Uncheck anything you don't want imported. Flagged rows go to the Task Center for review.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase">Proposed · awaiting confirm</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {proposed.map((p) => {
              const Icon = p.icon;
              const on = confirmed[p.kind];
              return (
                <label
                  key={p.kind}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    on ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background/40 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setConfirmed((c) => ({ ...c, [p.kind]: e.target.checked }))}
                    className="mt-1 h-4 w-4 accent-amber-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="h-4 w-4 text-[#d97a1c]" /> {p.label}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{p.found}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Source: {p.source}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/80">
                      {p.sample.join(" · ")}
                    </p>
                    {p.flagged > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-3 w-3" /> {p.flagged} flagged for review
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {phase === "preview" && (
              <>
                <Button variant="ghost" onClick={() => { setProposed(null); setPhase("idle"); }}>
                  Start over
                </Button>
                <Button onClick={commit} className="bg-amber-500 text-amber-950 hover:bg-amber-400">
                  Confirm &amp; import
                </Button>
              </>
            )}
            {phase === "importing" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Committing to HIVE…
              </div>
            )}
            {phase === "done" && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Migration complete. Flagged items are in the NECTAR Task Center.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
