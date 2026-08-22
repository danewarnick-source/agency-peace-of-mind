import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, CheckCircle2, Circle, AlertTriangle, MinusCircle, Home } from "lucide-react";
import {
  AUDIT_PART_HINT,
  DSPD_AUDIT_ITEMS,
  itemApplies,
  itemAppliesToPerson,
  naReason,
  obligationTitleMatches,
  type AuditItem,
  type AuditPart,
  type OrgFootprint,
} from "@/lib/dspd-audit-tool";
import {
  EMPTY_AUDIT_EVIDENCE,
  personVerdictForItem,
  toneFromVerdict,
  type AuditEvidenceItem,
  type AuditEvidenceSnapshot,
  type PersonAuditEvidence,
} from "@/lib/audit-evidence";
import { FulfillmentBadge, RollupStatus, catalogFor } from "./obligation-meta";
import { ObligationCard, type ObligationWithInstance } from "./obligation-card";
import type { ObligationListItem } from "@/lib/company-obligations.functions";

function itemStatus(
  item: AuditItem,
  applies: boolean,
  linked: ObligationListItem[],
  live: AuditEvidenceItem | null,
): { tone: "na" | "overdue" | "open" | "met" | "hive" | "gap"; label: string } {
  if (!applies) return { tone: "na", label: "N/A" };
  if (live && live.verdict !== "unknown") {
    return { tone: toneFromVerdict(live.verdict), label: live.label };
  }
  const overdue = linked.reduce((n, o) => n + o.rollup.overdue_count, 0);
  const open = linked.reduce((n, o) => n + o.rollup.open_count, 0);
  if (overdue > 0) return { tone: "overdue", label: `${overdue} overdue` };
  if (open > 0) return { tone: "open", label: `${open} open` };
  if (linked.length > 0) return { tone: "met", label: "Tracked" };
  if (item.hive_href) return { tone: "hive", label: "In HIVE" };
  return { tone: "gap", label: "Not a tracked duty yet" };
}

const TONE_CLASS = {
  na: "text-muted-foreground",
  overdue: "text-destructive",
  open: "text-warning-foreground",
  met: "text-success",
  hive: "text-emerald-800 dark:text-emerald-300",
  gap: "text-muted-foreground",
};

export function AuditPartPanel({
  part,
  footprint,
  includeNa,
  obligations,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  search = "",
  evidence = EMPTY_AUDIT_EVIDENCE,
  selectedPersonId = null,
  onSelectPerson,
}: {
  part: AuditPart;
  footprint: OrgFootprint;
  includeNa: boolean;
  obligations: ObligationListItem[];
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  search?: string;
  evidence?: AuditEvidenceSnapshot;
  selectedPersonId?: string | null;
  onSelectPerson?: (id: string | null) => void;
}) {
  const person = useMemo(
    () => evidence.people.find((p) => p.client_id === selectedPersonId) ?? null,
    [evidence.people, selectedPersonId],
  );

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DSPD_AUDIT_ITEMS.filter((i) => i.part === part).filter((i) => {
      const applies = person ? itemAppliesToPerson(i, person) : itemApplies(i, footprint);
      if (!includeNa && !applies) return false;
      if (!q) return true;
      return (
        i.prompt.toLowerCase().includes(q) ||
        i.citation.toLowerCase().includes(q) ||
        i.number.toLowerCase().includes(q) ||
        i.note.toLowerCase().includes(q) ||
        i.applies_to_codes.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [part, footprint, includeNa, search, person]);

  const linkedFor = (item: AuditItem) =>
    obligations.filter((o) =>
      item.obligation_titles.some((t) => obligationTitleMatches(o.title, t)),
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{AUDIT_PART_HINT[part]}</p>
      {part === "II" && onSelectPerson && (
        <PersonPacketPicker
          people={evidence.people}
          selectedPersonId={selectedPersonId}
          onSelectPerson={onSelectPerson}
        />
      )}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "No review-tool rows in this part match your search."
            : person
              ? "No review-tool rows in this part apply to this Person's services."
              : "No review-tool rows in this part apply to the services this program provides. Use Show N/A to see the hidden rows."}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const applies = person
              ? itemAppliesToPerson(item, person)
              : itemApplies(item, footprint);
            const linked = linkedFor(item);
            const live = person
              ? personVerdictForItem(item, person)
              : (evidence.items[item.id] ?? null);
            return (
              <AuditItemRow
                key={item.id}
                item={item}
                applies={applies}
                linked={linked}
                live={live}
                orgId={orgId}
                groupNamesById={groupNamesById}
                userNamesById={userNamesById}
                publishedFormIds={publishedFormIds}
                onEdit={onEdit}
                footprint={
                  person
                    ? { codes: person.service_codes, hasAbiClients: person.has_abi }
                    : footprint
                }
                homes={
                  item.id === "I-2-HHS"
                    ? evidence.homes.filter((h) => h.service_code === "HHS")
                    : item.id.startsWith("I-") && item.applies_to_codes.includes("RHS")
                      ? evidence.homes.filter((h) => h.service_code === "RHS")
                      : []
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonPacketPicker({
  people,
  selectedPersonId,
  onSelectPerson,
}: {
  people: PersonAuditEvidence[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Person packet</p>
        <p className="text-xs text-muted-foreground">
          The paper tool is one packet per Person. Agency view scores everyone; pick a Person to see
          their file.
        </p>
      </div>
      <Select
        value={selectedPersonId ?? "agency"}
        onValueChange={(v) => onSelectPerson(v === "agency" ? null : v)}
      >
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="All people (agency view)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="agency">All people (agency view)</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.client_id} value={p.client_id}>
              {p.full_name}
              {p.service_codes.length ? ` · ${p.service_codes.join(", ")}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AuditItemRow({
  item,
  applies,
  linked,
  live,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  footprint,
  homes,
}: {
  item: AuditItem;
  applies: boolean;
  linked: ObligationListItem[];
  live: AuditEvidenceItem | null;
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  footprint: OrgFootprint;
  homes: AuditEvidenceSnapshot["homes"];
}) {
  const [open, setOpen] = useState(false);
  const status = itemStatus(item, applies, linked, live);
  const Icon =
    status.tone === "overdue"
      ? AlertTriangle
      : status.tone === "met" || status.tone === "hive"
        ? CheckCircle2
        : status.tone === "na"
          ? MinusCircle
          : Circle;

  return (
    <div
      className={`rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] ${applies ? "border-border" : "border-dashed border-border/70 opacity-80"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">#{item.number}</span>
            <FulfillmentBadge channel={item.fulfillment} />
            {item.applies_to_codes.length > 0 && applies && (
              <Badge variant="outline">{item.applies_to_codes.join(", ")}</Badge>
            )}
          </div>
          <p className="mt-1.5 font-medium leading-snug">{item.prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.citation}</p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${TONE_CLASS[status.tone]}`}
        >
          <Icon className="h-4 w-4" />
          {status.label}
        </div>
      </div>

      {!applies && (
        <p className="mt-2 text-xs text-muted-foreground">{naReason(item, footprint)}</p>
      )}

      {applies && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
          {live?.detail && <p className="mt-1 text-xs text-muted-foreground">{live.detail}</p>}
          {homes.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {homes.map((h) => (
                <li key={`${h.team_id}-${h.service_code}`} className="flex items-center gap-1.5">
                  <Home className="h-3 w-3" />
                  {h.team_name}
                  <span>
                    ({h.client_count} Person{h.client_count === 1 ? "" : "s"})
                  </span>
                </li>
              ))}
            </ul>
          )}
          {linked.map((o) => (
            <div key={o.id} className="mt-2">
              <RollupStatus
                rollup={o.rollup}
                reminderOnly={catalogFor(o)?.calendar_is_reminder_only}
              />
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {(live?.href || item.hive_href) && (
              <Button size="sm" variant="outline" asChild>
                <a href={live?.href || item.hive_href}>
                  {item.hive_label ?? "Open in HIVE"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {linked.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? "Hide tracked duty" : `Show tracked duty (${linked.length})`}
              </Button>
            )}
          </div>
          {open && (
            <div className="mt-3 grid gap-3">
              {linked.map((o) => (
                <ObligationCard
                  key={o.id}
                  orgId={orgId}
                  obligation={o}
                  groupNamesById={groupNamesById}
                  userNamesById={userNamesById}
                  publishedFormIds={publishedFormIds}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function UnmappedDuties({
  obligations,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
}: {
  obligations: ObligationListItem[];
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
}) {
  const extra = obligations.filter(
    (o) =>
      !DSPD_AUDIT_ITEMS.some((i) =>
        i.obligation_titles.some((t) => obligationTitleMatches(o.title, t)),
      ),
  );
  if (!extra.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Every tracked duty is already mapped to a numbered row on the in-depth review tool.
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Other tracked duties
        <span className="ml-2 font-normal">({extra.length})</span>
      </h3>
      <p className="text-xs text-muted-foreground">
        Provider-defined obligations, or SOW duties that are not a numbered row on the in-depth
        review tool (for example SEI UPI employment-data attestations).
      </p>
      <div className="grid gap-3">
        {extra.map((o) => (
          <ObligationCard
            key={o.id}
            orgId={orgId}
            obligation={o}
            groupNamesById={groupNamesById}
            userNamesById={userNamesById}
            publishedFormIds={publishedFormIds}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
