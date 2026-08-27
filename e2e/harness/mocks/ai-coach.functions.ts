export const draftShiftNote = async () => ({
  draft: "Mocked NECTAR draft — punch pad writes staff notes.",
  wordCount: 8,
});

export const evaluateShiftNote = async () => ({
  status: "Verified" as const,
  feedback: "Mocked NECTAR coach — not a live review.",
});
