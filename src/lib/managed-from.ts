/**
 * Platform-managed Resend From address.
 *
 * Prefer RESEND_FROM or EMAIL_FROM when set (ops may use either).
 * Fallback is the Provider Interface mailbox — never Resend sandbox
 * (onboarding@resend.dev) and never Hive Certify branding.
 */

export const DEFAULT_MANAGED_FROM_ADDRESS = "noreply@providerinterface.com";
export const DEFAULT_MANAGED_FROM_NAME = "Provider Interface";
export const DEFAULT_AUDIT_FROM_NAME = "Provider Interface Audit";
export const DEFAULT_TRAINING_FROM_NAME = "Provider Interface Training";

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readProcessEnv(name: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      return trimEnv(process.env[name]);
    }
  } catch {
    /* browser / edge without process */
  }
  return undefined;
}

/** Pull addr@domain out of "Name <addr@domain>" or a bare address. */
export function extractEmailAddress(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const angled = trimmed.match(/<([^>]+)>/);
  const candidate = (angled?.[1] ?? trimmed).trim();
  if (!candidate.includes("@") || candidate.includes(" ")) return undefined;
  if (candidate.toLowerCase().endsWith("@resend.dev")) return undefined;
  return candidate;
}

/**
 * Address only (no display name). Reads RESEND_FROM then EMAIL_FROM.
 * Either env may be a bare address or a full `Name <addr>` header.
 * Resend sandbox addresses are treated as unset.
 */
export function managedFromAddress(
  env?: Record<string, string | undefined>,
): string {
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  const raw =
    trimEnv(source.RESEND_FROM) ??
    trimEnv(source.EMAIL_FROM) ??
    (env ? undefined : readProcessEnv("RESEND_FROM")) ??
    (env ? undefined : readProcessEnv("EMAIL_FROM"));
  if (!raw) return DEFAULT_MANAGED_FROM_ADDRESS;
  return extractEmailAddress(raw) ?? DEFAULT_MANAGED_FROM_ADDRESS;
}

export function formatFromHeader(displayName: string, address = managedFromAddress()): string {
  const name = displayName.trim() || DEFAULT_MANAGED_FROM_NAME;
  return `${name} <${address}>`;
}

/** @deprecated Use managedFromAddress() so RESEND_FROM is honored at send time. */
export const HIVE_MANAGED_FROM_ADDRESS = DEFAULT_MANAGED_FROM_ADDRESS;
