// US phone number validation/formatting shared by signup and settings.
//
// Accepts common user input ("(801) 555-0123", "801-555-0123", "8015550123",
// "+18015550123") and normalizes to E.164 (+1XXXXXXXXXX). Strict 10-digit
// US numbers only — we send SMS via Twilio and need a deliverable format.

export function digitsOnly(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

export function normalizeUSPhoneToE164(input: string): string | null {
  const d = digitsOnly(input);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function isValidUSPhone(input: string): boolean {
  return normalizeUSPhoneToE164(input) !== null;
}

export function formatUSPhonePretty(input: string): string {
  const e164 = normalizeUSPhoneToE164(input);
  if (!e164) return input;
  const d = e164.slice(2); // strip +1
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
