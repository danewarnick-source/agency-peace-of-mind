import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCatalogRelations,
  proposeCatalogRelations,
  setCatalogRelationStatus,
  type AgencySourceRow,
} from "@/lib/obligations/catalog-relation.functions";
import {
  promoteOverlayStatus,
  type CatalogRelationKind,
} from "@/lib/obligations/catalog-relation";

const KIND_COPY: Record<CatalogRelationKind, { label: string; hint: string }> = {
  match: {
    label: "Match",
    hint: "Same catalog duty (title, alias, or key).",
  },
  overlay: {
    label: "Overlay",
    hint: "Agency wording of a known catalog duty.",
  },
  conflict: {
    label: "Conflict",
    hint: "Competing keys, citation mismatch, or no counterpart.",
  },
};

function kindOf(row: AgencySourceRow): CatalogRelationKind {
  return row.catalog_relation ?? row.live_proposal.kind;
}

export function AgencySourcesPanel({ orgId }: { orgId: string | null | undefined }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCatalogRelations);
  const proposeFn = useServerFn(proposeCatalogRelations);
  const statusFn = useServerFn(setCatalogRelationStatus);
  const [bucket, setBucket] = useState<CatalogRelationKind | "all">("all");

  const query = useQuery({
    queryKey: ["catalog-relations", orgId],
    enabled: !!orgId,
    queryFn: () => listFn({ data: { organizationId: orgId as string } }),
  });

  const propose = useMutation({
    mutationFn: () =>
      proposeFn({ data: { organizationId: orgId as string } }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-relations", orgId] });
      if (!res.softReady) {
        toast.message(
          "Catalog relation columns are pending Soft Core. Proposals are shown live and not stored yet.",
        );
        return;
      }
      toast.success(`Proposed ${res.proposed} catalog relation${res.proposed === 1 ? "" : "s"}.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Propose failed.");
    },
  });

  const setStatus = useMutation({
    mutationFn: (input: {
      requirementId: string;
      status: "confirmed" | "dismissed" | "proposed";
    }) =>
      statusFn({
        data: {
          organizationId: orgId as string,
          requirementId: input.requirementId,
          status: input.status,
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-relations", orgId] });
      if (!res.softReady) {
        toast.message("Catalog relation columns are pending Soft Core.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    },
  });

  const rows = query.data?.rows ?? [];
  const grouped = useMemo(() => {
    const g: Record<CatalogRelationKind, AgencySourceRow[]> = {
      match: [],
      overlay: [],
      conflict: [],
    };
    for (const row of rows) g[kindOf(row)].push(row);
    return g;
  }, [rows]);

  const visible =
    bucket === "all" ? rows : grouped[bucket];

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-border/60 bg-background/60 p-6 text-center text-sm text-muted-foreground">
        Select a workspace to review agency sources against the catalog.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Agency Sources</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Intake-drafted requirements related to the keyed catalog. Match
            means the same duty. Overlay is agency wording of a known duty.
            Conflict needs a human look.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => propose.mutate()}
          disabled={propose.isPending || query.isLoading}
        >
          {propose.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Propose catalog relations
        </Button>
      </div>

      {query.data && !query.data.softReady ? (
        <div className="rounded-lg border border-amber-300/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          Soft columns are not live yet. Relations are computed in the app and
          will persist after Core applies the Step 7 migration (after Step 5).
        </div>
      ) : null}

      <Tabs
        value={bucket}
        onValueChange={(v) => setBucket(v as CatalogRelationKind | "all")}
      >
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-2">{rows.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="match">
            Match <Badge variant="secondary" className="ml-2">{grouped.match.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="overlay">
            Overlay <Badge variant="secondary" className="ml-2">{grouped.overlay.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="conflict">
            Conflict <Badge variant="secondary" className="ml-2">{grouped.conflict.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={bucket} className="mt-4 space-y-3">
          {query.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No agency-source rows in this bucket.
            </div>
          ) : (
            visible.map((row) => (
              <AgencySourceCard
                key={row.id}
                row={row}
                busy={setStatus.isPending}
                onConfirm={() =>
                  setStatus.mutate({
                    requirementId: row.id,
                    status: kindOf(row) === "overlay"
                      ? promoteOverlayStatus()
                      : "confirmed",
                  })
                }
                onDismiss={() =>
                  setStatus.mutate({ requirementId: row.id, status: "dismissed" })
                }
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgencySourceCard({
  row,
  busy,
  onConfirm,
  onDismiss,
}: {
  row: AgencySourceRow;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const kind = kindOf(row);
  const copy = KIND_COPY[kind];
  const Icon =
    kind === "match" ? CheckCircle2 : kind === "overlay" ? Layers : AlertTriangle;
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{row.title}</h3>
            <Badge variant="outline">{copy.label}</Badge>
            {row.catalog_relation_status ? (
              <Badge variant="secondary">{row.catalog_relation_status}</Badge>
            ) : (
              <Badge variant="secondary">live</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
          <p className="text-sm text-muted-foreground">
            {row.catalog_relation_rationale ?? row.live_proposal.rationale}
          </p>
          {row.catalog_key ? (
            <p className="font-mono text-xs text-muted-foreground">
              {row.catalog_key}
              {row.live_proposal.catalog_title
                ? ` · ${row.live_proposal.catalog_title}`
                : ""}
            </p>
          ) : null}
          {row.source_citation ? (
            <p className="text-xs text-muted-foreground">{row.source_citation}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || row.catalog_relation_status === "confirmed"}
            onClick={onConfirm}
          >
            {kind === "overlay" ? "Promote overlay" : "Confirm"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || row.catalog_relation_status === "dismissed"}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
