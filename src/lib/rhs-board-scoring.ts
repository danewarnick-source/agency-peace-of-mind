/**
 * Client-side scoring for the RHS planning board (B2).
 *
 * Pure functions; no IO. Scores a destination home's composition GIVEN a
 * proposed roster of RhsClient (i.e. after the planned move). Honest:
 * we only score on signals we actually have stored. Anything else is
 * surfaced as a manual-review note, never as a confident colour.
 */
import type { RhsClient, RhsHome } from "./rhs-board.functions";

export type MoveLight = "green" | "yellow" | "red" | "gray";

export type MoveScore = {
  light: MoveLight;
  /** Hard rules that make the move physically invalid (over capacity). */
  hard_blocks: string[];
  /** Composition considerations worth flagging — never blocking. */
  risks: string[];
  /** Positive context (e.g. capacity headroom, no medical clustering). */
  notes: string[];
  /** Honest list of signals we cannot evaluate. */
  unscored: string[];
};

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function scoreComposition(
  home: RhsHome,
  roster: RhsClient[],
  unscoredSignals: string[],
): MoveScore {
  const hard_blocks: string[] = [];
  const risks: string[] = [];
  const notes: string[] = [];

  // --- Hard rule: capacity ---
  if (home.capacity != null) {
    if (roster.length > home.capacity) {
      hard_blocks.push(
        `Over capacity (${roster.length} planned vs capacity ${home.capacity})`,
      );
    } else if (roster.length === home.capacity) {
      notes.push(`At capacity (${roster.length}/${home.capacity})`);
    } else {
      notes.push(
        `Headroom: ${roster.length}/${home.capacity} (${home.capacity - roster.length} open)`,
      );
    }
  } else {
    notes.push("Capacity not set on this home");
  }

  // --- Soft signals ---
  const ages = roster
    .map((c) => ageFromDob(c.date_of_birth))
    .filter((a): a is number => a != null);
  if (ages.length >= 2) {
    const spread = Math.max(...ages) - Math.min(...ages);
    if (spread >= 40) {
      risks.push(`Age spread of ${spread} years — review fit`);
    } else if (spread >= 25) {
      risks.push(`Wider age range (${spread} years)`);
    }
  }

  const chokingCount = roster.filter((c) => c.choking_risk).length;
  if (chokingCount >= 2) {
    risks.push(
      `${chokingCount} clients with choking-risk medications — mealtime supervision load`,
    );
  }

  const controlledCount = roster.filter((c) => c.controlled_med).length;
  if (controlledCount >= 2) {
    risks.push(
      `${controlledCount} clients with controlled medications — double-storage / count workload`,
    );
  }

  const totalMeds = roster.reduce((a, c) => a + c.med_count, 0);
  if (totalMeds >= 25) {
    risks.push(`High total medication count in home (${totalMeds} active)`);
  }

  const specialCount = roster.filter((c) => c.has_special_directions).length;
  if (specialCount >= 2) {
    notes.push(`${specialCount} clients have special-directions notes`);
  }

  // --- Light ---
  let light: MoveLight;
  if (hard_blocks.length > 0) light = "red";
  else if (risks.length >= 2) light = "yellow";
  else if (risks.length === 1) light = "yellow";
  else if (roster.length === 0) light = "gray";
  else light = "green";

  return {
    light,
    hard_blocks,
    risks,
    notes,
    unscored: unscoredSignals,
  };
}
