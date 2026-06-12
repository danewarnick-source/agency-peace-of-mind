/**
 * CRM Phase B2 — RHS drag-and-drop planning board.
 *
 * Strictly SESSION-SCOPED. Dragging mutates local React state only; we
 * NEVER write to clients/teams/placements. Restore re-reads actuals;
 * Discard clears the plan; Export emits a PDF artifact. Refresh = gone.
 *
 * NECTAR scoring is honest — it only uses stored composition signals
 * (capacity, age, medication load). It explicitly tells the user which
 * compatibility signals it CANNOT evaluate, instead of inventing one.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  Download,
  Info,
  RotateCcw,
  Trash2,
  GripVertical,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getRhsBoardSnapshot,
  type RhsBoardSnapshot,
  type RhsClient,
  type RhsHome,
} from "@/lib/rhs-board.functions";
import {
  scoreComposition,
  type MoveLight,
  type MoveScore,
} from "@/lib/rhs-board-scoring";

const UNPLACED = "__unplaced__";

type Plan = Record<string, string>; // client_id → team_id | UNPLACED

function buildActualPlan(clients: RhsClient[]): Plan {
  const p: Plan = {};
  for (const c of clients) p[c.id] = c.team_id ?? UNPLACED;
  return p;
}

function lightClasses(l: MoveLight): string {
  switch (l) {
    case "green":
      return "border-emerald-300 bg-emerald-50/60";
    case "yellow":
      return "border-amber-300 bg-amber-50/60";
    case "red":
      return "border-rose-300 bg-rose-50/60";
    default:
      return "border-border bg-muted/30";
  }
}

function lightDot(l: MoveLight): string {
  switch (l) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-500";
    case "red":
      return "bg-rose-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function ClientPill({
  client,
  draggable,
  changed,
}: {
  client: RhsClient;
  draggable: boolean;
  changed: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: client.id,
    disabled: !draggable,
  });
  const tags: string[] = [];
  if (client.choking_risk) tags.push("choking-risk");
  if (client.controlled_med) tags.push("controlled-meds");
  if (client.med_count > 0) tags.push(`${client.med_count} meds`);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs shadow-sm ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-90"
      } ${
        isDragging ? "opacity-50" : ""
      } ${
        changed
          ? "border-violet-300 bg-violet-50/70"
          : "border-border bg-background"
      }`}
    >
      {draggable && (
        <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {client.first_name} {client.last_name}
        </div>
        {tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {changed && (
        <Badge variant="outline" className="shrink-0 text-[9px]">
          moved
        </Badge>
      )}
    </div>
  );
}

function HomeColumn({
  home,
  roster,
  score,
  canDrag,
  changedIds,
}: {
  home: RhsHome | null;
  roster: RhsClient[];
  score: MoveScore | null;
  canDrag: boolean;
  changedIds: Set<string>;
}) {
  const dropId = home?.id ?? UNPLACED;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const heading = home ? home.team_name : "Unplaced (no home)";
  const tone = score ? lightClasses(score.light) : "border-border bg-card";
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[260px] flex-col rounded-lg border p-3 transition ${tone} ${
        isOver ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {score && (
              <span
                className={`h-2 w-2 rounded-full ${lightDot(score.light)}`}
                title={`NECTAR: ${score.light}`}
              />
            )}
            <h4 className="truncate text-sm font-semibold">{heading}</h4>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {home?.address ?? (home ? "No address" : "Drop here to remove a planned placement")}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {roster.length}
          {home?.capacity != null ? ` / ${home.capacity}` : ""}
        </Badge>
      </header>

      <div className="mb-2 flex-1 space-y-1.5">
        {roster.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-background/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
            Empty.
          </p>
        ) : (
          roster.map((c) => (
            <ClientPill
              key={c.id}
              client={c}
              draggable={canDrag}
              changed={changedIds.has(c.id)}
            />
          ))
        )}
      </div>

      {score && home && (
        <div className="space-y-1 border-t border-border/60 pt-2 text-[10px]">
          {score.hard_blocks.map((b) => (
            <div
              key={b}
              className="flex items-start gap-1 rounded bg-rose-100 px-1.5 py-1 text-rose-900"
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>{b}</span>
            </div>
          ))}
          {score.risks.map((r) => (
            <div
              key={r}
              className="flex items-start gap-1 rounded bg-amber-100/70 px-1.5 py-1 text-amber-900"
            >
              <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              <span>{r}</span>
            </div>
          ))}
          {score.hard_blocks.length === 0 && score.risks.length === 0 && (
            <div className="rounded bg-emerald-100/70 px-1.5 py-1 text-emerald-900">
              No composition risks from stored signals.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RhsPlanningBoard() {
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const canDrag = can("manage_referrals");

  const fetchFn = useServerFn(getRhsBoardSnapshot);
  const q = useQuery({
    queryKey: ["rhs-board-snapshot", org?.organization_id],
    queryFn: () => fetchFn({ data: { organization_id: org!.organization_id! } }),
    enabled: !!org?.organization_id,
  });

  const data: RhsBoardSnapshot | undefined = q.data;

  const [plan, setPlan] = useState<Plan>({});
  const [touched, setTouched] = useState(false);

  // Initialize / reset plan whenever snapshot loads.
  useEffect(() => {
    if (data) {
      setPlan(buildActualPlan(data.clients));
      setTouched(false);
    }
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const clientById = useMemo(() => {
    const m = new Map<string, RhsClient>();
    for (const c of data?.clients ?? []) m.set(c.id, c);
    return m;
  }, [data]);

  const actualById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.clients ?? []) m.set(c.id, c.team_id ?? UNPLACED);
    return m;
  }, [data]);

  const changedIds = useMemo(() => {
    const s = new Set<string>();
    for (const [cid, dest] of Object.entries(plan)) {
      if (actualById.get(cid) !== dest) s.add(cid);
    }
    return s;
  }, [plan, actualById]);

  const rosterByHome = useMemo(() => {
    const m = new Map<string, RhsClient[]>();
    for (const [cid, dest] of Object.entries(plan)) {
      const c = clientById.get(cid);
      if (!c) continue;
      if (!m.has(dest)) m.set(dest, []);
      m.get(dest)!.push(c);
    }
    return m;
  }, [plan, clientById]);

  const scoreByHome = useMemo(() => {
    const m = new Map<string, MoveScore>();
    if (!data) return m;
    for (const home of data.homes) {
      const roster = rosterByHome.get(home.id) ?? [];
      m.set(home.id, scoreComposition(home, roster, data.unscored_signals));
    }
    return m;
  }, [data, rosterByHome]);

  function handleDragEnd(e: DragEndEvent) {
    const clientId = String(e.active.id);
    const dest = e.over?.id ? String(e.over.id) : null;
    if (!dest) return;
    setPlan((p) => {
      if (p[clientId] === dest) return p;
      setTouched(true);
      return { ...p, [clientId]: dest };
    });
  }

  function restore() {
    if (!data) return;
    setPlan(buildActualPlan(data.clients));
    setTouched(false);
  }

  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 40;
    let y = margin;
    const lineH = 14;
    const write = (txt: string, size = 10, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(txt, 612 - margin * 2);
      for (const line of lines) {
        if (y > 760) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineH;
      }
    };
    write("RHS Planning Board — Proposed Arrangement", 14, true);
    write(`Generated: ${new Date().toLocaleString()}`, 9);
    write(
      "PLANNING VIEW — no changes saved. Real placements happen in Teams/Homes.",
      9,
      true,
    );
    y += 6;

    const homesPlusUnplaced: Array<RhsHome | null> = [...data.homes, null];
    for (const home of homesPlusUnplaced) {
      const dest = home?.id ?? UNPLACED;
      const roster = rosterByHome.get(dest) ?? [];
      const score = home ? scoreByHome.get(home.id) : null;
      write(
        `${home ? home.team_name : "Unplaced (no home)"}  [${roster.length}${
          home?.capacity != null ? `/${home.capacity}` : ""
        }]${score ? `  — ${score.light.toUpperCase()}` : ""}`,
        11,
        true,
      );
      if (roster.length === 0) write("  (empty)");
      for (const c of roster) {
        const moved = changedIds.has(c.id) ? "  [MOVED]" : "";
        write(`  • ${c.first_name} ${c.last_name}${moved}`);
      }
      if (score) {
        for (const b of score.hard_blocks) write(`  ! ${b}`, 9);
        for (const r of score.risks) write(`  ~ ${r}`, 9);
      }
      y += 4;
    }
    y += 8;
    write("Signals NOT evaluated by NECTAR (review manually):", 10, true);
    for (const s of data.unscored_signals) write(`  • ${s}`);

    doc.save(`rhs-planning-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (!org?.organization_id) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
        Select an organization.
      </p>
    );
  }

  if (q.isLoading) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
        Loading RHS planning board…
      </p>
    );
  }

  if (q.isError) {
    return (
      <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-900">
        {(q.error as Error).message}
      </p>
    );
  }

  if (!data) return null;

  const unplacedRoster = rosterByHome.get(UNPLACED) ?? [];

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Planning view — no changes saved.</strong> Real
              placements happen in Teams &amp; Homes. Refresh or leave =
              plan discarded.
              {!canDrag && (
                <span className="ml-1 italic">
                  (Read-only — manage_referrals required to drag.)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={restore}
              disabled={!touched}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Restore actual
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={restore}
              disabled={!touched}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Discard plan
            </Button>
            <Button size="sm" variant="default" onClick={exportPdf}>
              <Download className="mr-1 h-3 w-3" />
              Export plan (PDF)
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3" />
          NECTAR scores each home's composition from stored signals only —
          capacity, age range, medication load. It explicitly does NOT
          score: {data.unscored_signals.join(" · ")}. Use the lights as a
          conversation starter, not a decision.
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.homes.map((h) => (
            <HomeColumn
              key={h.id}
              home={h}
              roster={rosterByHome.get(h.id) ?? []}
              score={scoreByHome.get(h.id) ?? null}
              canDrag={canDrag}
              changedIds={changedIds}
            />
          ))}
          <HomeColumn
            home={null}
            roster={unplacedRoster}
            score={null}
            canDrag={canDrag}
            changedIds={changedIds}
          />
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{data.clients.length} RHS clients</span>
          <span>·</span>
          <span>{data.homes.length} residential homes</span>
          <span>·</span>
          <span>
            {changedIds.size} planned move{changedIds.size === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </DndContext>
  );
}
