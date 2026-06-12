/**
 * CRM Phase B1 — Client Whiteboard tab.
 *
 * READ-ONLY planning view. NEVER writes to Teams/Homes, clients,
 * placements, hhp_cue_cards, or referrals. Drag-and-drop rematch is B2.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  HomeIcon,
  Info,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { ClientDischargeDialog } from "./client-discharge-dialog";
import {
  getWhiteboardSnapshot,
  type WhiteboardCategory,
  type WhiteboardClient,
  type WhiteboardHost,
  type WhiteboardReferral,
  type WhiteboardSnapshot,
} from "@/lib/whiteboard.functions";
import { useCurrentOrg } from "@/hooks/use-org";

const CATEGORY_META: Record<
  WhiteboardCategory,
  { label: string; blurb: string; tone: string }
> = {
  direct_support: {
    label: "Direct Support",
    blurb: "1:1 supports only (DSI, SEI, CMP/CMS, COM…).",
    tone: "border-sky-200 bg-sky-50/40",
  },
  rhs: {
    label: "RHS — Residential",
    blurb: "Staffed homes (RHS / SLH / SLN).",
    tone: "border-violet-200 bg-violet-50/40",
  },
  hhs: {
    label: "HHS — Host Home",
    blurb: "Host-home daily (HHS).",
    tone: "border-amber-200 bg-amber-50/40",
  },
};

function ScorePill({
  score,
  scored,
}: {
  score: number | null;
  scored: string[] | null;
}) {
  if (score == null) {
    return (
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] italic text-muted-foreground">
        insufficient info
      </span>
    );
  }
  const tone =
    score >= 8
      ? "bg-emerald-100 text-emerald-900"
      : score >= 6
        ? "bg-amber-100 text-amber-900"
        : score >= 4
          ? "bg-orange-100 text-orange-900"
          : "bg-rose-100 text-rose-900";
  const n = scored?.length ?? 5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
      title={`${n} of 5 factors scored`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {score.toFixed(1)}/10
      {n < 5 && (
        <span className="ml-0.5 font-normal opacity-80">· {n}/5</span>
      )}
    </span>
  );
}

function ReferralRow({ r }: { r: WhiteboardReferral }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{r.first_name}</span>
          <Badge variant="outline" className="text-[9px]">
            referral · {r.stage ?? "new"}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {[r.location_city, r.location_county].filter(Boolean).join(", ") ||
            "Location unknown"}
          {r.need_level ? ` · ${r.need_level}` : ""}
          {r.requested_codes.length > 0
            ? ` · ${r.requested_codes.slice(0, 3).join("/")}`
            : ""}
        </div>
      </div>
      <ScorePill score={r.match_score} scored={r.scored_components} />
    </div>
  );
}

function ClientRow({ c, organizationId }: { c: WhiteboardClient; organizationId: string }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">
            {c.first_name} {c.last_name}
          </span>
          <Badge variant="secondary" className="text-[9px]">
            current client
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {c.team_name ? (
            <>
              Placed:{" "}
              <span className="font-medium text-foreground/80">
                {c.team_name}
              </span>
              {c.team_setting ? ` (${c.team_setting})` : ""}
            </>
          ) : (
            "No home assignment"
          )}
          {c.authorized_dspd_codes.length > 0
            ? ` · ${c.authorized_dspd_codes.slice(0, 3).join("/")}`
            : ""}
        </div>
      </div>
      <ClientDischargeDialog
        organizationId={organizationId}
        clientId={c.id}
        clientName={`${c.first_name} ${c.last_name}`}
        trigger={
          <button
            type="button"
            className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 hover:bg-amber-100"
            title="Open the SOW §1.22 discharge workflow"
          >
            rematch ⇒ discharge workflow
          </button>
        }
      />
    </div>
  );
}

function CategoryLane({
  category,
  referrals,
  clients,
  organizationId,
}: {
  category: WhiteboardCategory;
  referrals: WhiteboardReferral[];
  clients: WhiteboardClient[];
  organizationId: string;
}) {
  const meta = CATEGORY_META[category];
  const sortedRefs = useMemo(
    () =>
      [...referrals].sort(
        (a, b) => (b.match_score ?? -1) - (a.match_score ?? -1),
      ),
    [referrals],
  );
  return (
    <div className={`flex flex-col rounded-lg border ${meta.tone} p-3`}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{meta.label}</h3>
          <p className="text-[10px] text-muted-foreground">{meta.blurb}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Badge variant="outline" className="text-[10px]">
            {referrals.length} ref
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {clients.length} placed
          </Badge>
        </div>
      </header>

      <section className="mb-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prospective referrals
        </div>
        {sortedRefs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-background/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
            No active referrals in this lane.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sortedRefs.map((r) => (
              <ReferralRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Current clients (context)
        </div>
        {clients.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-background/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
            No active clients in this category.
          </p>
        ) : (
          <div className="space-y-1.5">
            {clients.map((c) => (
              <ClientRow key={c.id} c={c} organizationId={organizationId} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HostsPanel({
  hosts,
  referrals,
  suggestions,
}: {
  hosts: WhiteboardHost[];
  referrals: WhiteboardReferral[];
  suggestions: WhiteboardSnapshot["host_suggestions"];
}) {
  const refById = useMemo(
    () => new Map(referrals.map((r) => [r.id, r])),
    [referrals],
  );
  const byHost = useMemo(() => {
    const m = new Map<string, typeof suggestions>();
    for (const s of suggestions) {
      if (!m.has(s.host_id)) m.set(s.host_id, []);
      m.get(s.host_id)!.push(s);
    }
    return m;
  }, [suggestions]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <header className="mb-2 flex items-center gap-2">
        <HomeIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Available host home cards</h3>
        <Badge variant="outline" className="text-[10px]">
          {hosts.length}
        </Badge>
      </header>
      {hosts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-background px-2 py-4 text-center text-[11px] text-muted-foreground">
          No ready / onboarding host cards. Add a host in the HHP cue cards
          section to power matching.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {hosts.map((h) => {
            const sug = byHost.get(h.id) ?? [];
            return (
              <article
                key={h.id}
                className="rounded-md border border-border bg-background p-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{h.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {[h.location_city, h.location_county]
                        .filter(Boolean)
                        .join(", ") || "Location unspecified"}
                    </div>
                  </div>
                  <Badge
                    variant={h.status === "ready" ? "default" : "outline"}
                    className="shrink-0 text-[9px]"
                  >
                    {h.status}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {h.independence_levels_accepted.slice(0, 3).map((l) => (
                    <span
                      key={l}
                      className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]"
                    >
                      {l}
                    </span>
                  ))}
                  {h.wheelchair_accessible && (
                    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] text-sky-900">
                      ♿ accessible
                    </span>
                  )}
                  {h.sign_language && (
                    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] text-sky-900">
                      ASL
                    </span>
                  )}
                </div>
                {sug.length > 0 && (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-900">
                      <Sparkles className="h-2.5 w-2.5" /> Rematch suggestion
                    </div>
                    <ul className="space-y-0.5">
                      {sug.slice(0, 3).map((s) => {
                        const r = refById.get(s.referral_id);
                        if (!r) return null;
                        return (
                          <li
                            key={s.referral_id}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="truncate">
                              {r.first_name}{" "}
                              <span className="text-[9px] text-muted-foreground">
                                · new referral
                              </span>
                            </span>
                            <ScorePill
                              score={s.score}
                              scored={r.scored_components}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClientWhiteboardTab() {
  const { data: org } = useCurrentOrg();
  const organizationId = org?.organization_id;

  const fetchFn = useServerFn(getWhiteboardSnapshot);
  const q = useQuery({
    queryKey: ["whiteboard-snapshot", organizationId],
    queryFn: () => fetchFn({ data: { organization_id: organizationId! } }),
    enabled: !!organizationId,
  });

  const data = q.data;

  const byCategory = useMemo(() => {
    const result = {
      direct_support: { refs: [] as WhiteboardReferral[], clients: [] as WhiteboardClient[] },
      rhs: { refs: [] as WhiteboardReferral[], clients: [] as WhiteboardClient[] },
      hhs: { refs: [] as WhiteboardReferral[], clients: [] as WhiteboardClient[] },
    };
    for (const r of data?.referrals ?? []) {
      result[r.inferred_category].refs.push(r);
    }
    for (const c of data?.clients ?? []) {
      result[c.inferred_category].clients.push(c);
    }
    return result;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <strong>Planning view — read-only.</strong> No changes are saved
          here. Real placements happen in Teams / Homes.
        </div>
        <Link
          to="/dashboard/clients/rhs-board"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
        >
          Open RHS planning board
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {q.isLoading ? (
        <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
          Loading whiteboard…
        </p>
      ) : q.isError ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-900">
          {(q.error as Error).message}
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <CategoryLane
              category="direct_support"
              referrals={byCategory.direct_support.refs}
              clients={byCategory.direct_support.clients}
            />
            <CategoryLane
              category="rhs"
              referrals={byCategory.rhs.refs}
              clients={byCategory.rhs.clients}
            />
            <CategoryLane
              category="hhs"
              referrals={byCategory.hhs.refs}
              clients={byCategory.hhs.clients}
            />
          </div>

          <HostsPanel
            hosts={data.hosts}
            referrals={data.referrals}
            suggestions={data.host_suggestions}
          />

          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mr-1 inline h-3 w-3" />
            NECTAR presents — the provider decides. Suggestions for{" "}
            <strong>placed</strong> clients always require the SOW discharge
            workflow before any move. Suggestions for{" "}
            <strong>new referrals</strong> are normal planning moves and
            still need provider approval to act on.
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {data.clients.length} active clients
            </span>
            <span>·</span>
            <span>{data.referrals.length} active referrals</span>
            <span>·</span>
            <span>{data.hosts.length} ready/onboarding hosts</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
