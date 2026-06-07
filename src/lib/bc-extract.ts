// Nectar BSP extraction — DEMO MODE.
// Strictly extractive: returns a fixed set of candidate behaviors with the
// BSP section each one is drawn from. No interpretation, no recommendations.
// In production this would be swapped for a real extraction pipeline driven
// off the uploaded BSP text. In demo mode we ignore the file payload and
// emit a seeded, citation-bearing slate so the behaviorist always has draft
// rows to review.

export type NectarDraftedBehavior = {
  name: string;
  operational_definition: string;
  data_method: "frequency" | "duration" | "intensity" | "abc";
  expected_cadence: "Every shift" | "Daily" | "Per occurrence" | "Weekly";
  bsp_citation: string;
};

export const DEMO_BSP_EXTRACTION: NectarDraftedBehavior[] = [
  {
    name: "Elopement",
    operational_definition:
      "Client leaves the assigned area or staff line of sight without permission for ≥10 seconds.",
    data_method: "frequency",
    expected_cadence: "Per occurrence",
    bsp_citation: "BSP §3.1 — Target Behavior: Elopement",
  },
  {
    name: "Property disruption",
    operational_definition:
      "Throwing, breaking, or forcefully displacing items not belonging to the client.",
    data_method: "frequency",
    expected_cadence: "Every shift",
    bsp_citation: "BSP §3.2 — Target Behavior: Property Disruption",
  },
  {
    name: "Verbal aggression",
    operational_definition:
      "Yelling, threats, or directed profanity toward another person.",
    data_method: "frequency",
    expected_cadence: "Every shift",
    bsp_citation: "BSP §3.3 — Target Behavior: Verbal Aggression",
  },
  {
    name: "Self-injury (minor)",
    operational_definition:
      "Any self-directed contact (hitting, biting, scratching) that does not break skin.",
    data_method: "intensity",
    expected_cadence: "Per occurrence",
    bsp_citation: "BSP §3.4 — Target Behavior: Self-Injurious Behavior",
  },
];
