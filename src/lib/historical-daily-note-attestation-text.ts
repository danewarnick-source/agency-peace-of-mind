// Frozen legal attestation text for historical daily notes.
// Bumping the wording means bumping the VERSION so we can prove exactly
// what the staff member agreed to at sign time.
export const HISTORICAL_DAILY_NOTE_ATTESTATION_VERSION = "2026-07-17.v1";

export function historicalDailyNoteAttestationText(params: {
  clientName: string;
  serviceDate: string;
}): string {
  const { clientName, serviceDate } = params;
  return [
    `I attest that this daily note, as it now reads, is a true, accurate, and complete account of the services I personally provided and the events I personally observed for ${clientName} on ${serviceDate}.`,
    `I understand this note is being entered as a historical service record that supports billing to and oversight by the Utah Division of Services for People with Disabilities (DSPD) and other payors, and that it will become part of this individual's permanent service record.`,
    `I acknowledge that knowingly submitting a false, misleading, or incomplete service record may constitute Medicaid fraud under state and federal law — including 42 U.S.C. § 1320a-7b (federal anti-kickback / false claims), 31 U.S.C. §§ 3729–3733 (federal False Claims Act), and Utah Code Ann. § 26B-3-1101 et seq. (Utah Medicaid False Claims Act) — and may result in disciplinary action up to and including termination, civil liability, and/or criminal prosecution.`,
    `I confirm that I am the staff member who provided this service, that no one has instructed me to alter this record to be inaccurate, and that my electronic signature (this checked box together with the Sign action) has the same legal force and effect as a handwritten signature under the federal E-SIGN Act (15 U.S.C. § 7001) and the Utah Uniform Electronic Transactions Act (Utah Code Ann. § 46-4-101 et seq.).`,
  ].join("\n\n");
}
