/**
 * Shared cron / public-hook authentication.
 * Prefer NECTAR_CRON_SECRET (or CRON_SHARED_SECRET) over the publishable anon key.
 */
import { timingSafeEqual } from "node:crypto";

export function verifyCronSecret(request: Request): boolean {
  const expected =
    process.env.NECTAR_CRON_SECRET?.trim() ||
    process.env.CRON_SHARED_SECRET?.trim() ||
    "";
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** CloudFront → ALB shared secret (optional; fail-open when unset for local/dev). */
export function verifyAlbOriginSecret(request: Request): boolean {
  const expected = process.env.ALB_ORIGIN_VERIFY_SECRET?.trim() || "";
  if (!expected) return true; // not configured — skip (local / Vercel)
  const provided = (
    request.headers.get("x-origin-verify") ??
    request.headers.get("x-cloudfront-secret") ??
    ""
  ).trim();
  if (!provided) return false; // secret configured — missing header is forbidden
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
