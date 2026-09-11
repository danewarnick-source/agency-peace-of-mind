import { PACK_STATE_CODE, PACK_VERSION } from "../sow-obligation-catalog-pack.ts";
import type { ThisWeekItem } from "./this-week.functions.ts";

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
  const decisions = items.filter((i) => i.kind === "decision");
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
      if (d.kind !== "decision") continue;
      const owner = d.ownerLabel || "unassigned";
      const due = d.dueAt ? d.dueAt.slice(0, 10) : "no due date";
      lines.push(`- ${d.title} (${d.urgency}; owner ${owner}; ${due}). ${d.consequence}`);
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
  if (changes.length === 0) {
    lines.push("No pack changelog rows for this version.");
  } else {
    for (const c of changes) {
      const note = c.note ? ` — ${c.note}` : "";
      lines.push(`- ${c.change_kind}: ${c.obligation_key}${note}`);
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
  return {
    draft: true,
    generatedAt,
    packVersion,
    stateCode: PACK_STATE_CODE,
    appliedPackVersion,
    decisions: items.filter((i) => i.kind === "decision").length,
    quiet: items.filter((i) => i.kind === "quiet_summary").length,
    changes,
    text: generateReviewText(items, changes, packVersion, generatedAt),
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
    changes: (data ?? []) as PackChangeRow[],
  };
}
