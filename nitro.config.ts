import { defineNitroConfig } from "nitro/config";

// Only affects AWS parallel-deploy builds (see vite.config.ts,
// docs/AWS_LAMBDA.md, docs/AWS_DEPLOY.md). No-op for Vercel / Lovable
// when BUILD_TARGET is unset.
//
// Static assets are served from S3 / CloudFront on both AWS targets —
// leaving serveStatic on would 500 (ENOENT) on any asset request that
// reaches the Node server or Lambda instead of the /assets/* behavior.
const isAwsNodeServer = process.env.BUILD_TARGET === "aws";
const isAwsLambda = process.env.BUILD_TARGET === "lambda";

export default defineNitroConfig(
  isAwsNodeServer || isAwsLambda
    ? {
        serveStatic: false,
        // TEMPORARY: replace the default error handler with one that logs the
        // full cause chain as a single line so CloudWatch doesn't collapse it.
        // Remove once the server function 500s are root-caused.
        errorHandler: "./src/nitro-plugins/error-handler",
        // Reject direct Function URL / ALB access when ALB_ORIGIN_VERIFY_SECRET
        // is configured (CloudFront must inject x-origin-verify).
        plugins: ["./src/nitro-plugins/alb-origin-verify"],
      }
    : {},
);
