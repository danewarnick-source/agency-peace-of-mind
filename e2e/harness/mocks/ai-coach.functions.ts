export const draftShiftNote = async () => ({
  draft: "Mocked NECTAR draft — punch pad writes staff notes.",
  wordCount: 8,
});

export const evaluateShiftNote = async () => ({
  status: "Verified" as const,
  feedback: "NECTAR completeness check passed: 30 words, client referenced, support documented, client response documented.",
  checks: [
    { key: "word_count" as const, passed: true, message: "Word count met." },
    { key: "client_referenced" as const, passed: true, message: "Client is referenced." },
    { key: "support_provided" as const, passed: true, message: "Support is documented." },
    { key: "client_response" as const, passed: true, message: "Client response is documented." },
  ],
});
