import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink, ShieldCheck, AlertCircle, CheckCircle2, CalendarClock,
  FileWarning, Sparkles, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listExternalRequirements,
  attestExternalCompletion,
  autoClassifyRequirements,
  EXTERNAL_SYSTEMS,
  type ExternalSystem,
} from "@/lib/external-compliance.functions";

export const Route = createFileRoute("/dashboard/external-compliance")({
  head: () => ({ meta: [{ title: "External Compliance — HIVE" }] }),
  component: ExternalCompliancePage,
});

type Item = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_citation: string | null;
  external_system: ExternalSystem | null;
  classification_inferred: boolean;
  renewal_cadence: string | null;
  renewal_due_at: string | null;
  last_attestation: {
    attested_at: string;
    user_display_name: string | null;
    statement: string;
  } | null;
};

function statusOf(item: Item): "outstanding" | "attested" | "renewal_due" {
  if (!item.last_attestation) return "outstanding";
  if (item.renewal_due_at) {
    const due = new Date(item.renewal_due_at).getTime();
    if (!Number.isNaN(due) && due < Date.now() + 30 * 86_400_000) return "renewal_due";
  }
  return "attested";
}

export function ExternalCompliancePage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const qc = useQueryClient();
  const listFn = useServerFn(listExternalRequirements);
  const autoFn = useServerFn(autoClassifyRequirements);

  const listQ = useQuery({
    queryKey: ["external-requirements", orgId],
    enabled: !!orgId,
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const auto = useMutation({
    mutationFn: () => autoFn({ data: { organizationId: orgId } }),
    onSuccess: (r) => {
      toast.success(`NECTAR classified ${r.classified} requirement${r.classified === 1 ? "" : "s"} — ${r.external} flagged external.`);
      qc.invalidateQueries({ queryKey: ["external-requirements", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Auto-classify failed"),
  });

  const [filter, setFilter] = useState<"all" | "outstanding" | "attested" | "renewal_due">("all");
  const items = (listQ.data?.items ?? []) as Item[];
  const filtered = items.filter((i) => filter === "all" || statusOf(i) === filter);

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of filtered) {
      const k = it.external_system ?? "Other external";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const counts = {
    total: items.length,
    outstanding: items.filter((i) => statusOf(i) === "outstanding").length,
    attested: items.filter((i) => statusOf(i) === "attested").length,
    renewal: items.filter((i) => statusOf(i) === "renewal_due").length,
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#d97a1c] text-white">
              <ExternalLink className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9a3412]">
                <Sparkles className="h-3.5 w-3.5" /> NECTAR · External Resources &amp; Platform Compliance
              </div>
              <h1 className="font-display text-lg font-semibold text-[#7c2d12]">
                Compliance steps that happen outside HIVE
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[#7c2d12]/80">
                These requirements live on other systems (UPI/USTEPS, DACS, DWS, TAPS, QuickBooks)
                or in the physical world (business license, DHS licenses, certifications).
                HIVE can't hold the primary evidence — you attest here that the step was done so
                the provider stays audit-ready.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={auto.isPending || !orgId}
            onClick={() => auto.mutate()}
            className="border-[#fed7aa] bg-white text-[#9a3412]"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {auto.isPending ? "NECTAR classifying…" : "Auto-classify with NECTAR"}
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4 sm:max-w-2xl">
          <Stat n={counts.total} label="External items" />
          <Stat n={counts.outstanding} label="Outstanding" tone="amber" />
          <Stat n={counts.renewal} label="Renewal due ≤30d" tone="rose" />
          <Stat n={counts.attested} label="Attested" tone="emerald" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-muted-foreground" /> Checklist
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">All</option>
            <option value="outstanding">Outstanding only</option>
            <option value="renewal_due">Renewal due</option>
            <option value="attested">Attested</option>
          </select>
        </div>
      </section>

      {listQ.isLoading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading external compliance items…
        </div>
      )}
      {!listQ.isLoading && grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No external compliance items match the filter. Try "Auto-classify with NECTAR" to scan existing requirements.
        </div>
      )}
      {grouped.map(([system, list]) => (
        <section key={system} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
              <ExternalLink className="h-4 w-4 text-[#d97a1c]" />
              {system}
              <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {list.map((it) => <ExternalRow key={it.id} item={it} orgId={orgId} />)}
          </ul>
        </section>
      ))}

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong>Audit-readiness</strong> combines internal evidence (in HIVE) and external attestations
        (produced here). HIVE records what was attested; it does not verify the external systems.
        Counsel review recommended before relying on this as a legal record.
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "amber" | "rose" | "emerald" }) {
  const cls =
    tone === "amber" ? "border-amber-200 text-amber-800"
    : tone === "rose" ? "border-rose-200 text-rose-800"
    : tone === "emerald" ? "border-emerald-200 text-emerald-800"
    : "border-[#fed7aa] text-[#9a3412]";
  return (
    <div className={`rounded-lg border bg-white/70 p-2 ${cls}`}>
      <div className="font-display text-lg font-bold">{n}</div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}

function ExternalRow({ item, orgId }: { item: Item; orgId: string }) {
  const status = statusOf(item);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const attestFn = useServerFn(attestExternalCompletion);
  const [completedOn, setCompletedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [nextRenewalAt, setNextRenewalAt] = useState("");

  const attest = useMutation({
    mutationFn: () =>
      attestFn({
        data: {
          requirementId: item.id,
          completedOn,
          reference: reference || undefined,
          notes: notes || undefined,
          proofUrl: proofUrl || undefined,
          nextRenewalAt: nextRenewalAt || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("External completion attested — logged to the attestation trail.");
      qc.invalidateQueries({ queryKey: ["external-requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't attest"),
  });

  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{item.title}</span>
          <Badge variant="outline" className="border-[#fed7aa] bg-[#fff7ed] text-[10px] text-[#9a3412]">
            External
          </Badge>
          {item.classification_inferred && (
            <Badge variant="outline" className="text-[10px]" title="NECTAR inferred — admin can correct on the Requirements tab.">
              NECTAR-inferred
            </Badge>
          )}
          {status === "outstanding" && (
            <Badge className="bg-amber-500/15 text-[10px] text-amber-800"><AlertCircle className="mr-1 h-3 w-3" />Outstanding</Badge>
          )}
          {status === "attested" && (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />Attested</Badge>
          )}
          {status === "renewal_due" && (
            <Badge className="bg-rose-500/15 text-[10px] text-rose-800"><CalendarClock className="mr-1 h-3 w-3" />Renewal due</Badge>
          )}
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {item.source_citation && <span>Cite: {item.source_citation}</span>}
          {item.renewal_cadence && <span>Renewal cadence: {item.renewal_cadence}</span>}
          {item.renewal_due_at && <span>Next renewal: {new Date(item.renewal_due_at).toLocaleDateString()}</span>}
          {item.last_attestation && (
            <span>
              Last attested {new Date(item.last_attestation.attested_at).toLocaleDateString()}
              {item.last_attestation.user_display_name ? ` by ${item.last_attestation.user_display_name}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="min-h-[44px] bg-[#d97a1c] text-white hover:bg-[#b8651a]"
        >
          <ShieldCheck className="mr-1 h-4 w-4" />
          {item.last_attestation ? "Re-attest" : "Attest completion"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-[#d97a1c]" />
              Attest external completion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="rounded-md border border-[#fed7aa] bg-[#fff7ed] p-2 text-xs text-[#9a3412]">
              This step is performed in <strong>{item.external_system ?? "an external system"}</strong> —
              HIVE is tracking it, not performing it. Your attestation is logged to the immutable trail.
            </p>
            <div>
              <Label htmlFor="completedOn">Completed on</Label>
              <Input id="completedOn" type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="reference">Reference / confirmation # (optional)</Label>
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI submission #12345" />
            </div>
            <div>
              <Label htmlFor="proofUrl">Proof URL (optional)</Label>
              <Input id="proofUrl" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label htmlFor="nextRenewalAt">Next renewal date (optional)</Label>
              <Input id="nextRenewalAt" type="date" value={nextRenewalAt} onChange={(e) => setNextRenewalAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={attest.isPending}
              onClick={() => attest.mutate()}
              className="bg-[#d97a1c] text-white hover:bg-[#b8651a]"
            >
              {attest.isPending ? "Logging…" : "Log attestation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

void EXTERNAL_SYSTEMS;
