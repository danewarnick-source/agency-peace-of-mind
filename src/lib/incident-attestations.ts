// Per-action attestation templates for §1.27 Incident Report compliance.
// Each action records DISTINCT legal language. Do not collapse — they are
// separate duties (guardian notification, UPI entry, SC update).

export type AttestationVars = {
  guardian_name?: string;
  method?: string;
  when?: string; // human-formatted timestamp
};

function fill(template: string, vars: AttestationVars): string {
  return template
    .replace("{guardian_name}", vars.guardian_name ?? "—")
    .replace("{method}", vars.method ?? "—")
    .replace("{when}", vars.when ?? new Date().toLocaleString());
}

export const GUARDIAN_ATTESTATION_TEMPLATE =
  "I attest that I notified the Person's guardian, {guardian_name}, of this incident on {when} via {method}, and that the information provided was accurate.";

export const UPI_INITIATED_ATTESTATION_TEMPLATE =
  "I attest that I initiated entry of this incident report into the UPI system on {when} and that the information submitted is true and accurate to the best of my knowledge.";

export const UPI_COMPLETED_ATTESTATION_TEMPLATE =
  "I attest that I completed and submitted the detailed incident report in the UPI system on {when} and that the information submitted is true and accurate to the best of my knowledge.";

export const SC_UPDATE_ATTESTATION_TEMPLATE =
  "I attest that I provided this incident information to the Person's Support Coordinator on {when}.";

export const renderGuardianAttestation = (v: AttestationVars) =>
  fill(GUARDIAN_ATTESTATION_TEMPLATE, v);
export const renderUpiInitiatedAttestation = (v: AttestationVars) =>
  fill(UPI_INITIATED_ATTESTATION_TEMPLATE, v);
export const renderUpiCompletedAttestation = (v: AttestationVars) =>
  fill(UPI_COMPLETED_ATTESTATION_TEMPLATE, v);
export const renderScUpdateAttestation = (v: AttestationVars) =>
  fill(SC_UPDATE_ATTESTATION_TEMPLATE, v);
