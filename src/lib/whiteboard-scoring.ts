/**
 * NECTAR fit-scoring for whiteboard containers (RHS homes, HHS host homes,
 * Direct-Support cards/slots).
 *
 * Pure functions; no IO. Given the placement inputs for a single container
 * plus board-wide reference data, produce a ContainerScore: a color, an
 * intensity (0..1 for glow strength), a list of driving factors (visible
 * beneath the container), and an honest "unscored" list of signals we
 * lacked data to evaluate.
 *
 * NO FABRICATION: we do not invent signals we don't have. Missing PCSP,
 * missing notes, missing credentials all surface as unscored — the admin
 * sees insufficient-signal rather than a false-confident green.
 *
 * Extends (does NOT replace) `scoreComposition` from rhs-board-scoring.ts.
 * That scorer's stored-signal output (capacity, age spread, medication
 * load) is merged into the RHS ContainerScore.
 */
import type { RhsClient, RhsHome } from "./rhs-board.functions";
import type { WhiteboardClient, WhiteboardHost } from "./whiteboard.functions";
import type { BoardStaff } from "./whiteboard-board.functions";
import type {
  PcspRow,
  BillingCodeRow,
  StaffCredentialSummary,
  NoteRow,
} from "./whiteboard-scoring.functions";
import { scoreComposition, type MoveLight } from "./rhs-board-scoring";

export type ContainerLight = MoveLight; // "green" | "yellow" | "red" | "gray"

export type ScoreFactorKind = "positive" | "risk" | "block";
export type ScoreFactorSource =
  | "stored"
  | "notes"
  | "pcsp"
  | "staff-qual"
  | "coverage"
  | "code-match";

export type ScoreFactor = {
  kind: ScoreFactorKind;
  source: ScoreFactorSource;
  text: string;
};

export type ContainerScore = {
  light: ContainerLight;
  /** 0..1 glow strength for CSS gradient (higher = more saturated). */
  intensity: number;
  factors: ScoreFactor[];
  unscored: string[];
};

export type ContainerKind = "rhs" | "hhs" | "ds";

type AnyClient = RhsClient | WhiteboardClient;

function clientName(c: AnyClient): string {
  const last = "last_name" in c ? c.last_name : "";
  return `${c.first_name} ${last ?? ""}`.trim() || "Client";
}
function firstTokens(c: AnyClient): string[] {
  const last = ("last_name" in c ? c.last_name : "") ?? "";
  return [c.first_name, last]
    .map((s) => (s || "").toLowerCase())
    .filter((s) => s.length >= 3);
}

// ---------- Sub-scorers ---------------------------------------------------

/**
 * Parse whiteboard notes for interpersonal signals between placed subjects.
 * Heuristic and intentionally conservative: only surface factors when the
 * text contains an explicit conflict/friction/preference marker AND names
 * another placed subject. Every flagged factor quotes the note so the
 * admin sees WHY.
 */
function scoreNotes(
  notesBySubject: Map<string, NoteRow[]>,
  clients: AnyClient[],
  staff: BoardStaff[],
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  const unscored: string[] = [];

  const conflictPatterns = [
    /doesn['’]?t\s+work\s+with/i,
    /conflict(?:s)?\s+with/i,
    /avoid(?:s|ed)?\b/i,
    /don['’]?t\s+(?:place|pair)/i,
    /separate\s+from/i,
    /tension\s+with/i,
    /fight(?:s|ing)?\s+with/i,
  ];
  const positivePatterns = [
    /gets\s+along\s+with/i,
    /prefers\b/i,
    /responds\s+well\s+to/i,
    /pairs?\s+well\s+with/i,
    /(?:good|great)\s+fit\s+with/i,
  ];
  const dislikePattern = /dislike[sd]?\b|hate[sd]?\b|bother(?:s|ed)?\s+by|sensitive\s+to|triggered\s+by/i;

  // Subjects on the board that names in notes might refer to.
  const namedSubjects = [
    ...clients.map((c) => ({ label: clientName(c), tokens: firstTokens(c) })),
    ...staff.map((s) => ({
      label: s.full_name,
      tokens: [s.first_name, s.last_name]
        .map((n) => (n || "").toLowerCase())
        .filter((s) => s.length >= 3),
    })),
  ];

  const hasSignalFor = new Set<string>(); // subjectId with any note read
  const scan = (
    subjectLabel: string,
    subjectId: string,
    kind: "client" | "staff",
  ) => {
    const notes = notesBySubject.get(`${kind}:${subjectId}`) ?? [];
    if (notes.length === 0) {
      unscored.push(`No notes for ${subjectLabel}`);
      return;
    }
    hasSignalFor.add(subjectId);
    for (const n of notes) {
      const t = n.note_text;
      const lower = t.toLowerCase();
      const trimmed = t.length > 80 ? `${t.slice(0, 77)}…` : t;

      // Conflict-with-named-placed-peer
      const conflictHit = conflictPatterns.some((p) => p.test(t));
      if (conflictHit) {
        const peerHit = namedSubjects.find(
          (s) =>
            s.label !== subjectLabel &&
            s.tokens.some((tok) => tok && lower.includes(tok)),
        );
        if (peerHit) {
          factors.push({
            kind: "risk",
            source: "notes",
            text: `${subjectLabel} ↔ ${peerHit.label}: "${trimmed}"`,
          });
          continue;
        }
        // Generic conflict marker without a named peer — still surface.
        factors.push({
          kind: "risk",
          source: "notes",
          text: `${subjectLabel} — flagged compatibility note: "${trimmed}"`,
        });
        continue;
      }

      // Client-staff friction: dislike-marker on subject; scan OTHER subject notes for the same keyword.
      if (dislikePattern.test(t)) {
        // Extract keywords after "dislikes"/"sensitive to"/etc. — take the next ~3 words.
        const m = t.match(/(?:dislike[sd]?|hate[sd]?|bother(?:ed|s)?\s+by|sensitive\s+to|triggered\s+by)\s+([\w\s-]{3,40})/i);
        const trigger = (m?.[1] ?? "").trim().toLowerCase().split(/[.,;\n]/)[0];
        if (trigger) {
          // Find any other placed subject whose notes mention the trigger.
          for (const other of namedSubjects) {
            if (other.label === subjectLabel) continue;
            // We need to look at their notes.
            for (const [key, ns] of notesBySubject) {
              const [otherKind, otherId] = key.split(":");
              const otherLabel = namedSubjects.find(
                (s2) =>
                  (otherKind === "client" ? clients : staff).some(
                    (x) => x.id === otherId,
                  ) && s2.label === other.label,
              );
              if (!otherLabel) continue;
              if (otherLabel.label !== other.label) continue;
              for (const nn of ns) {
                if (nn.note_text.toLowerCase().includes(trigger)) {
                  factors.push({
                    kind: "risk",
                    source: "notes",
                    text: `${subjectLabel} sensitive to "${trigger}" — ${other.label}'s note mentions it: "${nn.note_text.slice(0, 60)}${nn.note_text.length > 60 ? "…" : ""}"`,
                  });
                  break;
                }
              }
            }
          }
        }
        // Still record the sensitivity even if no cross-match.
        factors.push({
          kind: "risk",
          source: "notes",
          text: `${subjectLabel} sensitivity: "${trimmed}"`,
        });
      }

      // Positive
      if (positivePatterns.some((p) => p.test(t))) {
        factors.push({
          kind: "positive",
          source: "notes",
          text: `${subjectLabel}: "${trimmed}"`,
        });
      }
    }
  };

  for (const c of clients) scan(clientName(c), c.id, "client");
  for (const s of staff) scan(s.full_name, s.id, "staff");

  // Dedupe factors by text.
  const seen = new Set<string>();
  const out: ScoreFactor[] = [];
  for (const f of factors) {
    if (seen.has(f.text)) continue;
    seen.add(f.text);
    out.push(f);
  }

  return { factors: out, unscored };
}

/**
 * PCSP fit — check preferred_living against container kind; surface presence
 * of special_directions / pertinent_health_notes as context; honest unscored
 * when the client has no PCSP data at all.
 */
function scorePcsp(
  clients: AnyClient[],
  pcspById: Map<string, PcspRow>,
  containerKind: ContainerKind,
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  const unscored: string[] = [];
  for (const c of clients) {
    const p = pcspById.get(c.id);
    const name = clientName(c);
    if (!p) {
      unscored.push(`No PCSP on file for ${name}`);
      continue;
    }
    const hasAny =
      (p.pcsp_goals && p.pcsp_goals.length > 0) ||
      p.special_directions ||
      p.pertinent_health_notes ||
      p.preferred_living ||
      (p.preferred_activities && p.preferred_activities.length > 0);
    if (!hasAny) {
      unscored.push(`Empty PCSP for ${name}`);
      continue;
    }

    // Preferred living vs container kind.
    if (p.preferred_living) {
      const pl = p.preferred_living.toLowerCase();
      const wantsHost = /host\s*home|family\s*setting/.test(pl);
      const wantsOwn = /own\s*home|independent|apartment/.test(pl);
      const wantsGroup = /group\s*home|residential|rhs|staffed/.test(pl);
      if (containerKind === "rhs" && (wantsHost || wantsOwn)) {
        factors.push({
          kind: "risk",
          source: "pcsp",
          text: `${name} PCSP prefers "${p.preferred_living}" — not staffed residential`,
        });
      } else if (containerKind === "hhs" && (wantsOwn || wantsGroup)) {
        factors.push({
          kind: "risk",
          source: "pcsp",
          text: `${name} PCSP prefers "${p.preferred_living}" — not host home`,
        });
      } else if (
        (containerKind === "rhs" && wantsGroup) ||
        (containerKind === "hhs" && wantsHost)
      ) {
        factors.push({
          kind: "positive",
          source: "pcsp",
          text: `${name} PCSP alignment: prefers "${p.preferred_living}"`,
        });
      }
    } else {
      unscored.push(`${name}: no preferred_living stated`);
    }

    // Surface pertinent health notes as a risk-worthy context, not a block.
    if (p.pertinent_health_notes && p.pertinent_health_notes.trim().length > 0) {
      const snip = p.pertinent_health_notes.trim();
      factors.push({
        kind: "risk",
        source: "pcsp",
        text: `${name} health note: "${snip.length > 70 ? snip.slice(0, 67) + "…" : snip}"`,
      });
    }
    if (p.special_directions && p.special_directions.trim().length > 0) {
      const snip = p.special_directions.trim();
      factors.push({
        kind: "risk",
        source: "pcsp",
        text: `${name} special direction: "${snip.length > 70 ? snip.slice(0, 67) + "…" : snip}"`,
      });
    }
  }
  return { factors, unscored };
}

/**
 * Staff qualifications — without a formal DSPD-code → required-cert
 * registry we cannot deterministically say a staffer is qualified for a
 * given code. We DO flag staff with zero active credentials on file
 * (concrete risk) and surface a count as positive context. The registry
 * gap itself is honestly unscored.
 */
function scoreStaffQuals(
  clients: AnyClient[],
  staff: BoardStaff[],
  credsByStaff: Map<string, StaffCredentialSummary>,
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  const unscored: string[] = [];

  if (staff.length === 0 && clients.length > 0) {
    factors.push({
      kind: "risk",
      source: "staff-qual",
      text: `No staff placed — ${clients.length} client${clients.length === 1 ? "" : "s"} unsupported`,
    });
  }

  for (const s of staff) {
    const c = credsByStaff.get(s.id);
    if (!c) {
      unscored.push(`No credential record for ${s.full_name}`);
      continue;
    }
    if (c.active_count === 0) {
      factors.push({
        kind: "risk",
        source: "staff-qual",
        text: `${s.full_name} has no active credentials on file`,
      });
    } else {
      factors.push({
        kind: "positive",
        source: "staff-qual",
        text: `${s.full_name}: ${c.active_count} active credential${c.active_count === 1 ? "" : "s"}`,
      });
    }
  }
  if (clients.some((c) => (("authorized_dspd_codes" in c) ? c.authorized_dspd_codes.length : 0) > 0)) {
    unscored.push(
      "DSPD code → required-credential mapping not registered — cannot verify code-specific qualification",
    );
  }

  return { factors, unscored };
}

/**
 * Coverage — for HHS/DS: at minimum verify each placed client with active
 * authorized codes has ≥1 staff. The full weekly-hours vs staff-availability
 * math is out of sandbox scope and surfaced as unscored.
 */
function scoreCoverage(
  clients: AnyClient[],
  staff: BoardStaff[],
  codesByClient: Map<string, BillingCodeRow[]>,
  containerKind: ContainerKind,
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  const unscored: string[] = [];
  if (containerKind === "rhs") return { factors, unscored }; // RHS coverage is via existing scorer.

  for (const c of clients) {
    const codes = codesByClient.get(c.id) ?? [];
    if (codes.length === 0) {
      unscored.push(`${clientName(c)}: no active authorized codes on file`);
      continue;
    }
    const weekly = codes.reduce((a, r) => a + (r.weekly_cap_units ?? 0), 0);
    if (staff.length === 0) {
      factors.push({
        kind: "risk",
        source: "coverage",
        text: `${clientName(c)}: ${codes.length} code${codes.length === 1 ? "" : "s"} (${weekly || "—"} weekly units) with no assigned staff`,
      });
    } else {
      factors.push({
        kind: "positive",
        source: "coverage",
        text: `${clientName(c)}: ${staff.length} staff assigned for ${codes.map((r) => r.service_code.toUpperCase()).join("/")}`,
      });
    }
  }
  unscored.push(
    "Weekly-hour vs staff-availability math not modeled in sandbox",
  );
  return { factors, unscored };
}

/**
 * Out-of-code placement risk (drop-anywhere policy: flag, never block).
 */
function scoreCodeMatch(
  clients: AnyClient[],
  containerKind: ContainerKind,
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  for (const c of clients) {
    if (!("inferred_category" in c)) continue;
    const cat = c.inferred_category;
    if (containerKind === "rhs" && cat !== "rhs") {
      factors.push({
        kind: "risk",
        source: "code-match",
        text: `${clientName(c)} is not currently authorized for RHS (${cat.toUpperCase()}) — planning only.`,
      });
    } else if (containerKind === "hhs" && cat !== "hhs") {
      factors.push({
        kind: "risk",
        source: "code-match",
        text: `${clientName(c)} is not currently authorized for HHS (${cat.toUpperCase()}) — planning only.`,
      });
    } else if (containerKind === "ds" && cat !== "direct_support") {
      factors.push({
        kind: "risk",
        source: "code-match",
        text: `${clientName(c)} is not currently authorized for Direct Support (${cat.toUpperCase()}) — planning only.`,
      });
    }
  }
  return { factors, unscored: [] };
}

// ---------- Light + intensity derivation --------------------------------

function deriveLight(
  factors: ScoreFactor[],
): { light: ContainerLight; intensity: number } {
  const blocks = factors.filter((f) => f.kind === "block").length;
  const risks = factors.filter((f) => f.kind === "risk").length;
  const positives = factors.filter((f) => f.kind === "positive").length;

  if (blocks > 0) return { light: "red", intensity: 1 };
  if (factors.length === 0) return { light: "gray", intensity: 0 };

  const weight = risks * 0.35 - positives * 0.2;
  const intensity = Math.min(1, Math.abs(weight) * 0.6 + 0.25);
  if (weight >= 0.35) return { light: "red", intensity };
  if (weight >= 0) return { light: "yellow", intensity };
  return { light: "green", intensity };
}

function merge(
  parts: Array<{ factors: ScoreFactor[]; unscored: string[] }>,
): { factors: ScoreFactor[]; unscored: string[] } {
  const factors: ScoreFactor[] = [];
  const unscored: string[] = [];
  for (const p of parts) {
    factors.push(...p.factors);
    unscored.push(...p.unscored);
  }
  return { factors, unscored };
}

// ---------- Public entry points -----------------------------------------

export type BoardReference = {
  pcspById: Map<string, PcspRow>;
  codesByClient: Map<string, BillingCodeRow[]>;
  credsByStaff: Map<string, StaffCredentialSummary>;
  notesBySubject: Map<string, NoteRow[]>;
};

export function buildBoardReference(inputs: {
  pcsp: PcspRow[];
  billing_codes: BillingCodeRow[];
  staff_credentials: StaffCredentialSummary[];
  notes: NoteRow[];
}): BoardReference {
  const pcspById = new Map<string, PcspRow>();
  for (const r of inputs.pcsp) pcspById.set(r.client_id, r);
  const codesByClient = new Map<string, BillingCodeRow[]>();
  for (const r of inputs.billing_codes) {
    const arr = codesByClient.get(r.client_id) ?? [];
    arr.push(r);
    codesByClient.set(r.client_id, arr);
  }
  const credsByStaff = new Map<string, StaffCredentialSummary>();
  for (const r of inputs.staff_credentials) credsByStaff.set(r.staff_id, r);
  const notesBySubject = new Map<string, NoteRow[]>();
  for (const n of inputs.notes) {
    const key = `${n.subject_type}:${n.subject_id}`;
    const arr = notesBySubject.get(key) ?? [];
    arr.push(n);
    notesBySubject.set(key, arr);
  }
  return { pcspById, codesByClient, credsByStaff, notesBySubject };
}

export function scoreRhsContainer(args: {
  home: RhsHome;
  clients: AnyClient[];
  staff: BoardStaff[];
  ref: BoardReference;
  storedUnscored: string[];
}): ContainerScore {
  const { home, clients, staff, ref, storedUnscored } = args;
  // Stored composition (capacity/age/med) — only RHS-native clients contribute
  // to those calculations honestly. Non-RHS clients are surfaced via code-match.
  const rhsRoster = clients.filter((c): c is RhsClient => "med_count" in c);
  const stored = scoreComposition(home, rhsRoster, storedUnscored);
  const storedFactors: ScoreFactor[] = [
    ...stored.hard_blocks.map<ScoreFactor>((t) => ({ kind: "block", source: "stored", text: t })),
    ...stored.risks.map<ScoreFactor>((t) => ({ kind: "risk", source: "stored", text: t })),
    ...stored.notes.map<ScoreFactor>((t) => ({ kind: "positive", source: "stored", text: t })),
  ];

  const merged = merge([
    { factors: storedFactors, unscored: stored.unscored },
    scoreCodeMatch(clients, "rhs"),
    scoreNotes(ref.notesBySubject, clients, staff),
    scorePcsp(clients, ref.pcspById, "rhs"),
    scoreStaffQuals(clients, staff, ref.credsByStaff),
  ]);
  const { light, intensity } = deriveLight(merged.factors);
  return {
    light,
    intensity,
    factors: sortFactors(merged.factors),
    unscored: dedupe(merged.unscored),
  };
}

export function scoreHhsContainer(args: {
  host: WhiteboardHost;
  clients: AnyClient[];
  staff: BoardStaff[];
  ref: BoardReference;
}): ContainerScore {
  const { clients, staff, ref } = args;
  const merged = merge([
    scoreCodeMatch(clients, "hhs"),
    scoreNotes(ref.notesBySubject, clients, staff),
    scorePcsp(clients, ref.pcspById, "hhs"),
    scoreStaffQuals(clients, staff, ref.credsByStaff),
    scoreCoverage(clients, staff, ref.codesByClient, "hhs"),
  ]);
  const { light, intensity } = deriveLight(merged.factors);
  return {
    light,
    intensity,
    factors: sortFactors(merged.factors),
    unscored: dedupe(merged.unscored),
  };
}

export function scoreDsContainer(args: {
  clients: AnyClient[];
  staff: BoardStaff[];
  ref: BoardReference;
}): ContainerScore {
  const { clients, staff, ref } = args;
  const merged = merge([
    scoreCodeMatch(clients, "ds"),
    scoreNotes(ref.notesBySubject, clients, staff),
    scorePcsp(clients, ref.pcspById, "ds"),
    scoreStaffQuals(clients, staff, ref.credsByStaff),
    scoreCoverage(clients, staff, ref.codesByClient, "ds"),
  ]);
  const { light, intensity } = deriveLight(merged.factors);
  return {
    light,
    intensity,
    factors: sortFactors(merged.factors),
    unscored: dedupe(merged.unscored),
  };
}

function sortFactors(fs: ScoreFactor[]): ScoreFactor[] {
  const order: Record<ScoreFactorKind, number> = { block: 0, risk: 1, positive: 2 };
  return [...fs].sort((a, b) => order[a.kind] - order[b.kind]);
}
function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
