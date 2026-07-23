// Attestation template for the combined §1.27 "Submit to UPI" close action.
// One attestation now covers: UPI entry (initiation + detailed report) and
// the guardian-notification duty. Do not split these back into per-duty
// templates — the workflow performs them as a single signed action.

export type UpiSubmittedAttestationVars = {
  when: string; // human-formatted timestamp
  guardianContacted: boolean;
  method?: string;
};

export function renderUpiSubmittedAttestation(v: UpiSubmittedAttestationVars): string {
  const guardianClause = v.guardianContacted
    ? `notified the Person's guardian via ${v.method ?? "—"}`
    : "confirmed this Person is their own guardian, or that guardian notification does not otherwise apply";
  return (
    `I attest that on ${v.when} I submitted this incident to UPI — initiating entry and ` +
    `completing the detailed report — and that I ${guardianClause}. All information ` +
    `provided is true and accurate to the best of my knowledge.`
  );
}
