/**
 * Nitro request hook: reject direct ALB hits when ALB_ORIGIN_VERIFY_SECRET is set.
 * CloudFront must inject header `x-origin-verify: <secret>`.
 * Fail-open when the env var is unset (local / Vercel); fail-closed when set.
 */
import { createError } from "h3";
import { verifyAlbOriginSecret } from "../lib/cron-auth";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    const req = event.node?.req;
    if (!req) return;
    // Build a Fetch Request-like headers map for the shared helper.
    const headers = new Headers();
    const raw = req.headers ?? {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v) && v[0]) headers.set(k, v[0]);
    }
    const fake = new Request("http://local", { headers });
    if (!verifyAlbOriginSecret(fake)) {
      throw createError({
        status: 403,
        statusMessage: "Forbidden",
        message: "forbidden",
      });
    }
  });
});

// Minimal typing so this file typechecks without pulling nitro types into client.
declare function defineNitroPlugin(fn: (nitroApp: { hooks: { hook: (name: string, fn: (event: { node?: { req?: { headers?: Record<string, string | string[] | undefined> }; res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void } } }) => void) => void } }) => void): unknown;
