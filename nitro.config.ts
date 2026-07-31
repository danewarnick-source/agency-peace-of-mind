import { defineNitroConfig } from "nitro/config";

// Only affects the AWS parallel-deploy build (see vite.config.ts and
// docs/AWS_DEPLOY.md) — this file is otherwise a no-op for the default
// Lovable/Cloudflare build.
//
// nitro's "node-server" preset defaults serveStatic to true and builds an
// asset manifest expecting the client build to sit alongside the server
// output. On this deploy target, static assets are served from S3/
// CloudFront instead — the Lambda zip only ever contains dist-aws/server —
// so leaving serveStatic on would 500 (ENOENT) on any asset request that
// somehow reaches Lambda instead of being caught by a CloudFront behavior.
export default defineNitroConfig(
  process.env.BUILD_TARGET === "aws"
    ? {
        serveStatic: false,
        // TEMPORARY: replace the default error handler with one that logs the
        // full cause chain as a single line so CloudWatch doesn't collapse it.
        // Remove once the server function 500s are root-caused.
        errorHandler: "./src/nitro-plugins/error-handler",
      }
    : {},
);
