// Server-only helpers for the background NECTAR draft-tick loop.
// Loaded lazily from server functions and the public API route so it never
// ends up in the client bundle.
import { getRequest } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const TICK_PATH = "/api/public/hooks/nectar-draft-tick";

function tickSecret(): string {
  const secret = process.env.NECTAR_DRAFT_TICK_SECRET;
  if (!secret) throw new Error("NECTAR_DRAFT_TICK_SECRET not configured");
  return secret;
}

export function signDraftTickBody(rawBody: string): string {
  return createHmac("sha256", tickSecret()).update(rawBody).digest("hex");
}

export function verifyDraftTickSignature(
  rawBody: string,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false;
  const expected = signDraftTickBody(rawBody);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function currentOrigin(): string {
  const req = getRequest();
  const forwardedHost = req?.headers?.get("x-forwarded-host");
  if (forwardedHost) return `https://${forwardedHost}`;
  const host = req?.headers?.get("host");
  if (host) {
    const proto = req?.headers?.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  try {
    return new URL(req?.url ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * POST the tick endpoint for a job. `wait: false` (the default) sends the
 * request with `keepalive` and does not await the response so the caller can
 * return quickly. `wait: true` awaits it — used when the tick handler itself
 * chains to the next tick and needs the nested subrequest to actually run.
 */
export async function fireDraftTick(
  jobId: string,
  opts: { wait?: boolean } = {},
): Promise<void> {
  const origin = currentOrigin();
  if (!origin) return;
  const body = JSON.stringify({ jobId });
  const signature = signDraftTickBody(body);
  const url = `${origin}${TICK_PATH}`;
  const promise = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nectar-draft-signature": signature,
    },
    body,
    // keepalive lets the outbound request survive if the parent handler
    // returns before it resolves. Cloudflare Workers still cancel unawaited
    // subrequests, but the wait:true path handles the in-tick chain.
    keepalive: true,
  }).catch(() => undefined);
  if (opts.wait) await promise;
}
