/**
 * Nitro request hook: reject requests that skip CloudFront when
 * ALB_ORIGIN_VERIFY_SECRET is set. CloudFront must inject
 * `x-origin-verify: <secret>` on the Lambda Function URL (or ALB) origin.
 * Fail-open when the env var is unset (local / Vercel); fail-closed when set.
 *
 * Export a plain function. Do not use Nitro's `defineNitroPlugin` auto-import —
 * the node-server / aws-lambda bundles inline this file without injecting
 * that helper (`ReferenceError: defineNitroPlugin is not defined`).
 * `defineNitroPlugin` is an identity wrapper anyway.
 */
import { createError } from "h3";
import { verifyAlbOriginSecret } from "../lib/cron-auth";
import { requestFromNitroEvent } from "../lib/nitro-origin-headers";

type NitroPluginApp = {
  hooks: {
    hook: (name: string, fn: (event: unknown) => void) => void;
  };
};

export default function albOriginVerifyPlugin(nitroApp: NitroPluginApp) {
  nitroApp.hooks.hook("request", (event) => {
    const fake = requestFromNitroEvent(event);
    if (!verifyAlbOriginSecret(fake)) {
      throw createError({
        status: 403,
        statusMessage: "Forbidden",
        message: "forbidden",
      });
    }
  });
}
