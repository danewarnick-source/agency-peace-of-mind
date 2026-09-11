import { denverYmd } from "../admin-home-data.ts";
import { PACK_STATE_CODE, PACK_VERSION } from "../sow-obligation-catalog-pack.ts";
import type { Decision, ThisWeekItem } from "./this-week.ts";

export type PackChangeRow = {
  change_kind: string;
  obligation_key: string;
  note: string | null;
  pack_version: string;
  state_code: string;
  created_at: string;
};

export type ReviewPack = {
  draft: true;
  generatedAt: string;
  packVersion: string;
  stateCode: string;
  appliedPackVersion: string | null;
  decisions: number;
  quiet: number;
  changes: PackChangeRow[];
  text: string;
};

export type ReviewDayMeta = {
  period: string | null;
  sites: number | null;
  samplePeople: number | null;
  sampleStaff: number | null;
};

const SNAKE_KEY_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const KIND_KEY_RE = /^(added|retired|changed|removed):\s*[a-z0-9_]+$/i;

export function isHumanPackNote(note: string | null | undefined): boolean {
  if (!note) return false;
  const t = note.trim();
  if (!t) return false;
  if (SNAKE_KEY_RE.test(t)) return false;
  if (KIND_KEY_RE.test(t)) return false;
  return true;
}

export function humanPackChanges<T extends { note: string | null }>(changes: T[]): T[] {
  return changes.filter((c) => isHumanPackNote(c.note));
}

export function showWhatChangedTab(
  changes: Array<{ note: string | null }>,
  appliedPackVersion: string | null,
  packVersion: string = PACK_VERSION,
): boolean {
  if (appliedPackVersion === packVersion) return false;
  return humanPackChanges(changes).length > 0;
}

export function whatChangedTitle(packVersion: string = PACK_VERSION): string {
  return `What changed — pack ${packVersion}`;
}

export function reviewPeriodLabel(now: Date = new Date()): string {
  const ymd = denverYmd(now);
  const parts = /^(\d{4})-(\d{2})/.exec(ymd);
  const year = Number(parts?.[1]);
  const month = Number(parts?.[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "This week";
  const quarter = Math.ceil(month / 3);
  return `Q${quarter} ${year}`;
}

export function formatReviewDayMeta(meta: ReviewDayMeta): string | null {
  const parts: string[] = [];
  if (meta.period) parts.push(meta.period);
  if (meta.sites != null && meta.sites > 0) {
    parts.push(`${meta.sites} site${meta.sites === 1 ? "" : "s"}`);
  }
  const peopleBits: string[] = [];
  if (meta.samplePeople != null && meta.samplePeople > 0) {
    peopleBits.push(`${meta.samplePeople} people`);
  }
  if (meta.sampleStaff != null && meta.sampleStaff > 0) {
    peopleBits.push(`${meta.sampleStaff} staff`);
  }
  if (peopleBits.length) parts.push(peopleBits.join(", "));
  return parts.length ? parts.join(" · ") : null;
}

function tableMissing(message: string | undefined): boolean {
  return (
    !!message && /does not exist|schema cache|relation|could not find the table/i.test(message)
  );
}

export function generateReviewText(
  items: ThisWeekItem[],
  changes: PackChangeRow[],
  packVersion: string,
  generatedAt: string,
): string {
  const decisions = items.filter((i): i is Decision => i.kind === "decision");
  const quiet = items.filter((i) => i.kind === "quiet_summary");
  const lines: string[] = [
    "This week review (draft)",
    `Generated ${generatedAt}. Not a published record. A human must attest.`,
    `Pack ${packVersion}.`,
    "",
    "Decisions",
  ];
  if (decisions.length === 0) {
    lines.push("None.");
  } else {
    for (const d of decisions) {
      const owner = d.ownerText || d.ownerLabel || "unassigned";
      const due = d.dueText || "no due date";
      const title = d.headline || d.title;
      lines.push(`- ${title} (${d.urgency}; owner ${owner}; ${due}).`);
    }
  }
  lines.push("", "Quiet");
  if (quiet.length === 0) {
    lines.push("None.");
  } else {
    for (const q of quiet) {
      if (q.kind !== "quiet_summary") continue;
      lines.push(`- ${q.title}: ${q.body}`);
    }
  }
  lines.push("", "What changed");
  const notes = humanPackChanges(changes);
  if (notes.length === 0) {
    lines.push("No pack changelog notes for this version.");
  } else {
    for (const c of notes) {
      lines.push(`- ${c.note!.trim()}`);
    }
  }
  return lines.join("\n");
}

export function assembleReviewPack(
  items: ThisWeekItem[],
  changes: PackChangeRow[],
  appliedPackVersion: string | null,
  generatedAt: string = new Date().toISOString(),
): ReviewPack {
  const packVersion = appliedPackVersion || PACK_VERSION;
  const notes = humanPackChanges(changes);
  return {
    draft: true,
    generatedAt,
    packVersion,
    stateCode: PACK_STATE_CODE,
    appliedPackVersion,
    decisions: items.filter((i) => i.kind === "decision").length,
    quiet: items.filter((i) => i.kind === "quiet_summary").length,
    changes: notes,
    text: generateReviewText(items, notes, packVersion, generatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPackChangelog(
  supabase: any,
  organizationId: string,
): Promise<{ appliedPackVersion: string | null; changes: PackChangeRow[] }> {
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("applied_pack_version, state_code")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgErr && !tableMissing(orgErr.message)) throw new Error(orgErr.message);

  const applied = (org?.applied_pack_version as string | null) ?? null;
  const state = (org?.state_code as string | null) || PACK_STATE_CODE;
  const packVersion = applied || PACK_VERSION;

  const { data, error } = await supabase
    .from("pack_changelog")
    .select("change_kind, obligation_key, note, pack_version, state_code, created_at")
    .eq("pack_version", packVersion)
    .eq("state_code", state)
    .order("obligation_key");
  if (error) {
    if (tableMissing(error.message)) return { appliedPackVersion: applied, changes: [] };
    throw new Error(error.message);
  }
  return {
    appliedPackVersion: applied,
    changes: humanPackChanges((data ?? []) as PackChangeRow[]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReviewDayMeta(
  supabase: any,
  organizationId: string,
  now: Date = new Date(),
): Promise<ReviewDayMeta> {
  const empty: ReviewDayMeta = {
    period: reviewPeriodLabel(now),
    sites: null,
    samplePeople: null,
    sampleStaff: null,
  };
  if (!supabase) return empty;

  const [teamsRes, peopleRes, staffRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("account_status", "active"),
    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("active", true),
  ]);

  return {
    period: empty.period,
    sites: teamsRes.error ? null : (teamsRes.count ?? 0),
    samplePeople: peopleRes.error ? null : (peopleRes.count ?? 0),
    sampleStaff: staffRes.error ? null : (staffRes.count ?? 0),
  };
}
