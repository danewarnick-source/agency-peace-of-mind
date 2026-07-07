/**
 * CRM Phase B3 — Consolidated Whiteboard planning board.
 *
 * ABSORBS the standalone RHS drag-and-drop board (rhs-planning-board.tsx)
 * into a single tab surface with three container shapes:
 *   - RHS residential homes (house)          → accepts client + staff pills
 *   - HHS host homes (house)                 → accepts client + staff pills
 *   - Direct Support per-client cards (human)→ accepts staff pills
 *
 * Draggable pill types:
 *   - Client pills (RHS + HHS)  — reuses the existing ClientPill pattern.
 *   - Staff pills               — reuses <PersonAvatar /> for staff photos.
 *
 * SESSION-ONLY. Dragging mutates local React state exclusively. Nothing
 * writes to teams, clients, staff assignments, or referrals. Refresh or
 * leave = plan discarded. Reset restores the starting arrangement; Undo
 * steps back one move.
 *
 * SCORING: The existing RHS composition scorer keeps running for RHS
 * homes only (green/yellow/red glow, honest about unscored signals).
 * HHS / Direct Support glow is deliberately NOT wired yet — a later pass
 * extends scoring across container types and adds placement notes.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  GripVertical,
  Info,
  RotateCcw,
  Undo2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person/person-avatar";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getRhsBoardSnapshot,
  type RhsBoardSnapshot,
  type RhsClient,
  type RhsHome,
} from "@/lib/rhs-board.functions";
import {
  getWhiteboardSnapshot,
  type WhiteboardSnapshot,
  type WhiteboardClient,
  type WhiteboardHost,
} from "@/lib/whiteboard.functions";
import {
  getBoardStaff,
  type BoardStaff,
} from "@/lib/whiteboard-board.functions";
import {
  scoreComposition,
  type MoveLight,
  type MoveScore,
} from "@/lib/rhs-board-scoring";
import { NotesPopover } from "./notes-popover";
import { getWhiteboardNoteCounts } from "@/lib/whiteboard-notes.functions";

/** Board-wide context so pills can render the notes popover without prop-drilling. */
type NotesCtx = {
  organizationId: string | null;
  canWrite: boolean;
  countsByKey: Map<string, number>;
};
const NotesBoardContext = createContext<NotesCtx>({
  organizationId: null,
  canWrite: false,
  countsByKey: new Map(),
});
const notesKey = (t: "client" | "staff", id: string) => `${t}:${id}`;

/** Reserved container ids. */
const POOL_CLIENTS = "pool:clients";
const POOL_STAFF = "pool:staff";

/** Namespaced ids so client vs staff pills don't collide. */
const draggableId = (kind: "client" | "staff", id: string) => `${kind}:${id}`;
function parseDraggable(id: string): { kind: "client" | "staff"; id: string } | null {
  const [kind, ...rest] = id.split(":");
  if (kind !== "client" && kind !== "staff") return null;
  return { kind, id: rest.join(":") };
}

/** Placement maps — the entire session-scoped plan state. */
type Plan = {
  // client_id → containerId (rhs-home:<id>, hhs-host:<id>, or POOL_CLIENTS)
  clients: Record<string, string>;
  // staff_id → containerId (rhs-home / hhs-host / ds-client / POOL_STAFF)
  staff: Record<string, string>;
};

function lightClasses(l: MoveLight): string {
  switch (l) {
    case "green": return "border-emerald-300 bg-emerald-50/60";
    case "yellow": return "border-amber-300 bg-amber-50/60";
    case "red": return "border-rose-300 bg-rose-50/60";
    default: return "";
  }
}
function lightDot(l: MoveLight): string {
  switch (l) {
    case "green": return "bg-emerald-500";
    case "yellow": return "bg-amber-500";
    case "red": return "bg-rose-500";
    default: return "bg-muted-foreground/40";
  }
}

// ---------- Shape frames ----------------------------------------------------

/** House-shaped frame — triangle roof + rectangular body. */
function HouseFrame({
  title,
  subtitle,
  badge,
  score,
  toneClass,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  score?: MoveScore | null;
  toneClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {/* Roof */}
      <div
        className={`mx-auto h-4 w-[calc(100%-16px)] ${toneClass ?? "bg-muted"} border-l border-r border-t border-border`}
        style={{ clipPath: "polygon(0% 100%, 50% 0%, 100% 100%)" }}
        aria-hidden
      />
      {/* Body */}
      <div className={`flex flex-1 flex-col rounded-b-lg border p-3 ${toneClass ?? "bg-card"}`}>
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {score && (
                <span
                  className={`h-2 w-2 rounded-full ${lightDot(score.light)}`}
                  title={`NECTAR: ${score.light}`}
                />
              )}
              <h4 className="truncate text-sm font-semibold">{title}</h4>
            </div>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
            )}
          </div>
          {badge}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Human-outline frame — head circle above body rectangle. */
function HumanFrame({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch">
      {/* Head */}
      <div className="mx-auto -mb-2 h-7 w-7 rounded-full border border-border bg-sky-50" aria-hidden />
      {/* Body */}
      <div className="flex flex-1 flex-col rounded-2xl border border-border bg-sky-50/40 p-3 pt-4">
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold">{title}</h4>
            {subtitle && (
              <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
            )}
          </div>
          {badge}
        </header>
        {children}
      </div>
    </div>
  );
}

// ---------- Pills ----------------------------------------------------------

function ClientPillDraggable({
  client,
  canDrag,
}: {
  client: RhsClient | WhiteboardClient;
  canDrag: boolean;
}) {
  const dragId = draggableId("client", client.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !canDrag,
  });
  const tags: string[] = [];
  if ("choking_risk" in client && client.choking_risk) tags.push("choking-risk");
  if ("controlled_med" in client && client.controlled_med) tags.push("controlled-meds");
  if ("med_count" in client && client.med_count > 0) tags.push(`${client.med_count} meds`);
  const notesCtx = useContext(NotesBoardContext);
  const label = `${client.first_name} ${("last_name" in client ? client.last_name : "") || ""}`.trim();
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative flex items-start gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm ${
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-90"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      {canDrag && <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label || "Client"}</div>
        {tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {notesCtx.organizationId && (
        <NotesPopover
          organizationId={notesCtx.organizationId}
          subjectType="client"
          subjectId={client.id}
          subjectLabel={label || "Client"}
          canWrite={notesCtx.canWrite}
          initialCount={notesCtx.countsByKey.get(notesKey("client", client.id)) ?? 0}
        />
      )}
    </div>
  );
}

function StaffPillDraggable({
  staff,
  canDrag,
}: {
  staff: BoardStaff;
  canDrag: boolean;
}) {
  const dragId = draggableId("staff", staff.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !canDrag,
  });
  const notesCtx = useContext(NotesBoardContext);
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-1 rounded-full border border-border bg-background px-1 py-1 pr-1.5 text-xs shadow-sm ${
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-90"
      } ${isDragging ? "opacity-50" : ""}`}
      title={staff.position ?? undefined}
    >
      <PersonAvatar
        bucket="staff-photos"
        path={staff.photo_path}
        name={staff.full_name}
        className="h-6 w-6 text-[10px] border"
      />
      <span className="truncate max-w-[110px] font-medium">{staff.full_name}</span>
      {notesCtx.organizationId && (
        <NotesPopover
          organizationId={notesCtx.organizationId}
          subjectType="staff"
          subjectId={staff.id}
          subjectLabel={staff.full_name}
          canWrite={notesCtx.canWrite}
          initialCount={notesCtx.countsByKey.get(notesKey("staff", staff.id)) ?? 0}
        />
      )}
    </div>
  );
}

// ---------- Overlay pills (presentational, no drag wiring) -----------------

function ClientPillOverlay({ client }: { client: RhsClient | WhiteboardClient }) {
  const label = `${client.first_name} ${("last_name" in client ? client.last_name : "") || ""}`.trim();
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-primary bg-background px-2 py-1.5 text-xs shadow-lg ring-2 ring-primary/40 cursor-grabbing">
      <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label || "Client"}</div>
      </div>
    </div>
  );
}

function StaffPillOverlay({ staff }: { staff: BoardStaff }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-primary bg-background px-1 py-1 pr-1.5 text-xs shadow-lg ring-2 ring-primary/40 cursor-grabbing">
      <PersonAvatar
        bucket="staff-photos"
        path={staff.photo_path}
        name={staff.full_name}
        className="h-6 w-6 text-[10px] border"
      />
      <span className="truncate max-w-[110px] font-medium">{staff.full_name}</span>
    </div>
  );
}

// ---------- Droppable containers -------------------------------------------

function Droppable({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} rounded-lg transition-shadow ${
        isOver ? "ring-2 ring-primary ring-offset-2 bg-primary/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

function RhsHomeContainer({
  home,
  clients,
  staff,
  score,
  canDrag,
}: {
  home: RhsHome;
  clients: RhsClient[];
  staff: BoardStaff[];
  score: MoveScore | null;
  canDrag: boolean;
}) {
  return (
    <Droppable id={`rhs-home:${home.id}`} className="min-h-[240px]">
      <HouseFrame
        title={home.team_name}
        subtitle={`RHS · ${home.address ?? "No address"}`}
        toneClass={score ? lightClasses(score.light) : "bg-violet-50/40"}
        score={score}
        badge={
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {clients.length}
            {home.capacity != null ? ` / ${home.capacity}` : ""}
          </Badge>
        }
      >
        <div className="mb-2 space-y-1.5">
          {clients.length === 0 ? (
            <p className="rounded border border-dashed border-border bg-background/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
              Drop clients here.
            </p>
          ) : (
            clients.map((c) => (
              <ClientPillDraggable key={c.id} client={c} canDrag={canDrag} />
            ))
          )}
        </div>
        <div className="mt-auto border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Staff on site
          </div>
          <div className="flex flex-wrap gap-1">
            {staff.length === 0 ? (
              <span className="text-[10px] italic text-muted-foreground">
                Drop staff here.
              </span>
            ) : (
              staff.map((s) => (
                <StaffPillDraggable key={s.id} staff={s} canDrag={canDrag} />
              ))
            )}
          </div>
        </div>
        {score && (
          <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[10px]">
            {score.hard_blocks.map((b) => (
              <div key={b} className="flex items-start gap-1 rounded bg-rose-100 px-1.5 py-1 text-rose-900">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>{b}</span>
              </div>
            ))}
            {score.risks.map((r) => (
              <div key={r} className="flex items-start gap-1 rounded bg-amber-100/70 px-1.5 py-1 text-amber-900">
                <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </HouseFrame>
    </Droppable>
  );
}

function HhsHostContainer({
  host,
  clients,
  staff,
  canDrag,
}: {
  host: WhiteboardHost;
  clients: WhiteboardClient[];
  staff: BoardStaff[];
  canDrag: boolean;
}) {
  return (
    <Droppable id={`hhs-host:${host.id}`} className="min-h-[220px]">
      <HouseFrame
        title={host.name}
        subtitle={`HHS host · ${[host.location_city, host.location_county].filter(Boolean).join(", ") || "Location unspecified"}`}
        toneClass="bg-amber-50/40"
        badge={
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {clients.length} · {staff.length} staff
          </Badge>
        }
      >
        <div className="mb-2 space-y-1.5">
          {clients.length === 0 ? (
            <p className="rounded border border-dashed border-border bg-background/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
              Drop host + client pills here.
            </p>
          ) : (
            clients.map((c) => (
              <ClientPillDraggable key={c.id} client={c} canDrag={canDrag} />
            ))
          )}
        </div>
        <div className="mt-auto border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Direct-support visitors (1–2)
          </div>
          <div className="flex flex-wrap gap-1">
            {staff.length === 0 ? (
              <span className="text-[10px] italic text-muted-foreground">
                Drop staff here.
              </span>
            ) : (
              staff.map((s) => (
                <StaffPillDraggable key={s.id} staff={s} canDrag={canDrag} />
              ))
            )}
            {staff.length > 2 && (
              <span className="rounded bg-amber-100 px-1 text-[9px] text-amber-900">
                over recommended (2)
              </span>
            )}
          </div>
        </div>
      </HouseFrame>
    </Droppable>
  );
}

function DirectSupportContainer({
  client,
  staff,
  canDrag,
}: {
  client: WhiteboardClient;
  staff: BoardStaff[];
  canDrag: boolean;
}) {
  return (
    <Droppable id={`ds-client:${client.id}`} className="min-h-[160px]">
      <HumanFrame
        title={`${client.first_name} ${client.last_name}`}
        subtitle={`Direct support · ${client.authorized_dspd_codes.slice(0, 4).join("/") || "no codes"}`}
        badge={
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {staff.length} staff
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-1">
          {staff.length === 0 ? (
            <span className="text-[10px] italic text-muted-foreground">
              Drop a staff pill onto this client.
            </span>
          ) : (
            staff.map((s) => (
              <StaffPillDraggable key={s.id} staff={s} canDrag={canDrag} />
            ))
          )}
        </div>
      </HumanFrame>
    </Droppable>
  );
}

// ---------- Board ----------------------------------------------------------

function buildStartingPlan(
  rhs: RhsBoardSnapshot,
  wb: WhiteboardSnapshot,
): Plan {
  const clients: Record<string, string> = {};
  // RHS clients start at their real home (or unplaced pool).
  for (const c of rhs.clients) {
    clients[c.id] = c.team_id ? `rhs-home:${c.team_id}` : POOL_CLIENTS;
  }
  // HHS clients start unplaced — no persisted host relationship to seed from.
  for (const c of wb.clients) {
    if (c.inferred_category === "hhs" && !(c.id in clients)) {
      clients[c.id] = POOL_CLIENTS;
    }
  }
  // Staff always start in the pool.
  return { clients, staff: {} };
}

export function WhiteboardPlanningBoard() {
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const canDrag = can("manage_referrals");
  const orgId = org?.organization_id;

  const rhsFn = useServerFn(getRhsBoardSnapshot);
  const wbFn = useServerFn(getWhiteboardSnapshot);
  const staffFn = useServerFn(getBoardStaff);

  const rhsQ = useQuery({
    queryKey: ["rhs-board-snapshot", orgId],
    queryFn: () => rhsFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const wbQ = useQuery({
    queryKey: ["whiteboard-snapshot", orgId],
    queryFn: () => wbFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const staffQ = useQuery({
    queryKey: ["whiteboard-board-staff", orgId],
    queryFn: () => staffFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });

  const notesCountsFn = useServerFn(getWhiteboardNoteCounts);
  const notesCountsQ = useQuery({
    queryKey: ["whiteboard-note-counts", orgId],
    queryFn: () => notesCountsFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const notesCtxValue = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of notesCountsQ.data ?? []) {
      m.set(notesKey(r.subject_type, r.subject_id), r.count);
    }
    return { organizationId: orgId ?? null, canWrite: canDrag, countsByKey: m };
  }, [notesCountsQ.data, orgId, canDrag]);

  const rhs = rhsQ.data;
  const wb = wbQ.data;
  const staff = staffQ.data;

  const [plan, setPlan] = useState<Plan>({ clients: {}, staff: {} });
  const startingRef = useRef<Plan | null>(null);
  const historyRef = useRef<Plan[]>([]);

  useEffect(() => {
    if (rhs && wb) {
      const start = buildStartingPlan(rhs, wb);
      startingRef.current = start;
      historyRef.current = [];
      // Only reset if empty — avoid clobbering user's in-progress plan on refetch.
      if (Object.keys(plan.clients).length === 0 && Object.keys(plan.staff).length === 0) {
        setPlan(start);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhs, wb]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // --- Indexes -----------------------------------------------------------

  const rhsClientById = useMemo(() => {
    const m = new Map<string, RhsClient>();
    for (const c of rhs?.clients ?? []) m.set(c.id, c);
    return m;
  }, [rhs]);
  const wbClientById = useMemo(() => {
    const m = new Map<string, WhiteboardClient>();
    for (const c of wb?.clients ?? []) m.set(c.id, c);
    return m;
  }, [wb]);
  const staffById = useMemo(() => {
    const m = new Map<string, BoardStaff>();
    for (const s of staff ?? []) m.set(s.id, s);
    return m;
  }, [staff]);

  // Placement inverse indexes.
  const clientsByContainer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [cid, dest] of Object.entries(plan.clients)) {
      if (!m.has(dest)) m.set(dest, []);
      m.get(dest)!.push(cid);
    }
    return m;
  }, [plan.clients]);
  const staffByContainer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [sid, dest] of Object.entries(plan.staff)) {
      if (!m.has(dest)) m.set(dest, []);
      m.get(dest)!.push(sid);
    }
    return m;
  }, [plan.staff]);

  // Direct-support clients (containers).
  const dsClients = useMemo(
    () => (wb?.clients ?? []).filter((c) => c.inferred_category === "direct_support"),
    [wb],
  );

  // Scoring — RHS only, using the planned RHS-client roster.
  const scoreByHome = useMemo(() => {
    const m = new Map<string, MoveScore>();
    if (!rhs) return m;
    for (const home of rhs.homes) {
      const ids = clientsByContainer.get(`rhs-home:${home.id}`) ?? [];
      const roster = ids.map((id) => rhsClientById.get(id)).filter(Boolean) as RhsClient[];
      m.set(home.id, scoreComposition(home, roster, rhs.unscored_signals));
    }
    return m;
  }, [rhs, clientsByContainer, rhsClientById]);

  // --- Actions -----------------------------------------------------------

  function handleDragEnd(e: DragEndEvent) {
    const dest = e.over?.id ? String(e.over.id) : null;
    if (!dest) return;
    const parsed = parseDraggable(String(e.active.id));
    if (!parsed) return;

    setPlan((prev) => {
      const next: Plan = { clients: { ...prev.clients }, staff: { ...prev.staff } };
      if (parsed.kind === "client") {
        // Clients can only land in client-accepting containers (rhs-home / hhs-host / POOL_CLIENTS).
        if (!(dest.startsWith("rhs-home:") || dest.startsWith("hhs-host:") || dest === POOL_CLIENTS)) {
          return prev;
        }
        if (prev.clients[parsed.id] === dest) return prev;
        next.clients[parsed.id] = dest;
      } else {
        // Staff can go anywhere (rhs-home / hhs-host / ds-client / POOL_STAFF).
        if (
          !(
            dest.startsWith("rhs-home:") ||
            dest.startsWith("hhs-host:") ||
            dest.startsWith("ds-client:") ||
            dest === POOL_STAFF
          )
        ) {
          return prev;
        }
        if (prev.staff[parsed.id] === dest) return prev;
        next.staff[parsed.id] = dest;
      }
      historyRef.current.push(prev);
      return next;
    });
  }

  function undo() {
    const hist = historyRef.current;
    if (hist.length === 0) return;
    const prev = hist.pop()!;
    setPlan(prev);
  }

  function reset() {
    if (!startingRef.current) return;
    historyRef.current = [];
    setPlan(startingRef.current);
  }

  // --- Render ------------------------------------------------------------

  if (!orgId) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
        Select an organization.
      </p>
    );
  }
  if (rhsQ.isLoading || wbQ.isLoading || staffQ.isLoading) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
        Loading planning board…
      </p>
    );
  }
  const err = rhsQ.error || wbQ.error || staffQ.error;
  if (err) {
    return (
      <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-900">
        {(err as Error).message}
      </p>
    );
  }
  if (!rhs || !wb || !staff) return null;

  // Pool contents.
  const poolClientIds = clientsByContainer.get(POOL_CLIENTS) ?? [];
  const poolStaffIds = staff
    .map((s) => s.id)
    .filter((id) => (plan.staff[id] ?? POOL_STAFF) === POOL_STAFF);

  return (
    <NotesBoardContext.Provider value={notesCtxValue}>
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Planning banner + controls */}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Planning view — dragging changes nothing real.</strong>{" "}
              Real placements happen in Teams &amp; Homes. Refresh or leave = plan discarded.
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
              onClick={undo}
              disabled={historyRef.current.length === 0}
            >
              <Undo2 className="mr-1 h-3 w-3" />
              Undo
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>

        {/* Pools */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Droppable id={POOL_CLIENTS}>
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Unplaced clients</h3>
                <Badge variant="outline" className="text-[10px]">{poolClientIds.length}</Badge>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {poolClientIds.length === 0 ? (
                  <span className="text-[11px] italic text-muted-foreground">
                    All clients placed. Drop back here to unplace.
                  </span>
                ) : (
                  poolClientIds.map((id) => {
                    const c = rhsClientById.get(id) ?? wbClientById.get(id);
                    if (!c) return null;
                    return <ClientPillDraggable key={id} client={c} canDrag={canDrag} />;
                  })
                )}
              </div>
            </div>
          </Droppable>

          <Droppable id={POOL_STAFF}>
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <header className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <UserRound className="h-3.5 w-3.5" /> Staff pool
                </h3>
                <Badge variant="outline" className="text-[10px]">{poolStaffIds.length}</Badge>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {poolStaffIds.length === 0 ? (
                  <span className="text-[11px] italic text-muted-foreground">
                    All staff placed. Drop back here to unassign.
                  </span>
                ) : (
                  poolStaffIds.map((id) => {
                    const s = staffById.get(id);
                    if (!s) return null;
                    return <StaffPillDraggable key={id} staff={s} canDrag={canDrag} />;
                  })
                )}
              </div>
            </div>
          </Droppable>
        </div>

        {/* RHS Residential lane */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            RHS — Residential homes
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rhs.homes.length === 0 ? (
              <p className="col-span-full rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-[11px] text-muted-foreground">
                No residential homes configured.
              </p>
            ) : (
              rhs.homes.map((h) => {
                const cIds = clientsByContainer.get(`rhs-home:${h.id}`) ?? [];
                const sIds = staffByContainer.get(`rhs-home:${h.id}`) ?? [];
                return (
                  <RhsHomeContainer
                    key={h.id}
                    home={h}
                    clients={cIds.map((id) => rhsClientById.get(id)).filter(Boolean) as RhsClient[]}
                    staff={sIds.map((id) => staffById.get(id)).filter(Boolean) as BoardStaff[]}
                    score={scoreByHome.get(h.id) ?? null}
                    canDrag={canDrag}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* HHS Host Home lane */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            HHS — Host homes
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {wb.hosts.length === 0 ? (
              <p className="col-span-full rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-[11px] text-muted-foreground">
                No host homes on file.
              </p>
            ) : (
              wb.hosts.map((h) => {
                const cIds = clientsByContainer.get(`hhs-host:${h.id}`) ?? [];
                const sIds = staffByContainer.get(`hhs-host:${h.id}`) ?? [];
                return (
                  <HhsHostContainer
                    key={h.id}
                    host={h}
                    clients={cIds.map((id) => wbClientById.get(id)).filter(Boolean) as WhiteboardClient[]}
                    staff={sIds.map((id) => staffById.get(id)).filter(Boolean) as BoardStaff[]}
                    canDrag={canDrag}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* Direct Support lane */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Direct Support — 1:1 supports
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {dsClients.length === 0 ? (
              <p className="col-span-full rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-[11px] text-muted-foreground">
                No active direct-support clients.
              </p>
            ) : (
              dsClients.map((c) => {
                const sIds = staffByContainer.get(`ds-client:${c.id}`) ?? [];
                return (
                  <DirectSupportContainer
                    key={c.id}
                    client={c}
                    staff={sIds.map((id) => staffById.get(id)).filter(Boolean) as BoardStaff[]}
                    canDrag={canDrag}
                  />
                );
              })
            )}
          </div>
        </section>

        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3" />
          NECTAR scores RHS home composition from stored signals only —
          capacity, age range, medication load. It explicitly does NOT
          score: {rhs.unscored_signals.join(" · ")}. HHS and Direct-Support
          scoring will be wired in a later pass.
        </div>
      </div>
    </DndContext>
    </NotesBoardContext.Provider>
  );
}
