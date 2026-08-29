import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { NITRO_AWS_LAMBDA_PRESET } from "./nitro-lambda-preset.ts";

describe("Lambda build path does not collide with Vercel or build:aws", () => {
  it("uses a Nitro aws-lambda preset alias this repo can switch in one file", () => {
    assert.match(NITRO_AWS_LAMBDA_PRESET, /^aws[-_]lambda$/);
  });

  it("package.json keeps build / build:aws and adds build:lambda", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts.build, "NODE_OPTIONS=--max-old-space-size=8192 vite build");
    assert.match(pkg.scripts["build:aws"], /BUILD_TARGET=aws vite build/);
    assert.doesNotMatch(pkg.scripts["build:aws"], /BUILD_TARGET=lambda/);
    assert.match(pkg.scripts["build:lambda"], /BUILD_TARGET=lambda vite build/);
    assert.doesNotMatch(pkg.scripts.build, /BUILD_TARGET/);
    assert.match(pkg.scripts["test:unit"], /auth-session-boot\.test\.ts/);
    assert.match(pkg.scripts["test:unit"], /catastrophic-ssr\.test\.ts/);
  });

  it("vite.config only switches nitro when BUILD_TARGET is aws or lambda", () => {
    const src = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
    assert.match(src, /BUILD_TARGET === "aws"/);
    assert.match(src, /BUILD_TARGET === "lambda"/);
    assert.match(src, /NITRO_AWS_LAMBDA_PRESET/);
    assert.match(src, /preset: "node-server"/);
    assert.match(src, /dir: "dist-aws"/);
    assert.doesNotMatch(src, /BUILD_TARGET === "aws".*aws-lambda/s);
  });

  it("nitro.config applies serveStatic false + plugins for aws and lambda only", () => {
    const src = readFileSync(new URL("../../nitro.config.ts", import.meta.url), "utf8");
    assert.match(src, /BUILD_TARGET === "aws"/);
    assert.match(src, /BUILD_TARGET === "lambda"/);
    assert.match(src, /serveStatic: false/);
    assert.match(src, /alb-origin-verify/);
    assert.match(src, /error-handler/);
    assert.doesNotMatch(src, /Content-Security-Policy/);
  });

  it("verify-lambda-output script looks for index.handler and .output/public", () => {
    const src = readFileSync(new URL("../../scripts/verify-lambda-output.mjs", import.meta.url), "utf8");
    assert.match(src, /\.output\/server/);
    assert.match(src, /index\.handler|exports\.handler|export[\s\S]*handler/);
    assert.match(src, /\.output\/public/);
  });

  it("docs and Tony script reuse hive-app-server / hive-app-static / E1BPLMZE2XLSKD only", () => {
    const docs = readFileSync(new URL("../../docs/AWS_LAMBDA.md", import.meta.url), "utf8");
    assert.match(docs, /hive-app-server/);
    assert.match(docs, /hive-app-static/);
    assert.match(docs, /E1BPLMZE2XLSKD/);
    assert.match(docs, /d2j3kgagxghm5i\.cloudfront\.net/);
    assert.match(docs, /4wadoqttka47octom5yvlwk5lq0xtbnl\.lambda-url\.us-east-1\.on\.aws/);
    assert.match(docs, /AllViewerExceptHostHeader/);
    assert.match(docs, /hive\/ecs\/supabase-service-role/);
    assert.match(docs, /index\.handler/);
    assert.doesNotMatch(docs, /Create a Node\.js/);
    assert.match(docs, /Do not use\s+`hive-platform-storage`/);
    assert.doesNotMatch(docs, /Content-Security-Policy/);
    assert.match(docs, /No API Gateway/);

    const tony = readFileSync(new URL("../../scripts/tony-hive-app-server-cutover.sh", import.meta.url), "utf8");
    assert.match(tony, /CONFIRM=I_AM_TONY/);
    assert.match(tony, /function-name hive-app-server|fn="hive-app-server"/);
    assert.match(tony, /hive-app-static/);
    assert.match(tony, /index\.handler/);
    assert.match(tony, /E1BPLMZE2XLSKD/);
    assert.doesNotMatch(tony, /update-distribution/);
    assert.doesNotMatch(tony, /aws ecs/);
    assert.doesNotMatch(tony, /function-name hive-cognito/);
    assert.doesNotMatch(tony, /create-function/);
    assert.doesNotMatch(tony, /create-bucket/);
  });

  it("deploy-aws.yml updates matching Lambda before S3 --delete, then CloudFront", () => {
    const yml = readFileSync(new URL("../../.github/workflows/deploy-aws.yml", import.meta.url), "utf8");
    assert.match(yml, /npm run build:lambda/);
    assert.doesNotMatch(yml, /npm run build:aws/);
    assert.match(yml, /verify-lambda-output/);
    assert.match(yml, /package-lambda\.sh/);
    assert.match(yml, /update-function-code/);
    assert.match(yml, /function-name hive-app-server/);
    assert.match(yml, /wait function-updated/);
    assert.match(yml, /\.output\/public/);
    assert.match(yml, /s3 sync/);
    assert.match(yml, /--delete/);
    assert.match(yml, /create-invalidation/);
    assert.match(yml, /contents:\s*read/);
    assert.doesNotMatch(yml, /amazon-ecr-login/);
    assert.doesNotMatch(yml, /docker build/);
    assert.doesNotMatch(yml, /aws ecs/);
    assert.doesNotMatch(yml, /dist-aws/);
    assert.doesNotMatch(yml, /AWS_ACCESS_KEY_ID:\s*AKIA/);
    const lambdaIdx = yml.indexOf("update-function-code");
    const s3Idx = yml.indexOf("s3 sync");
    const cfIdx = yml.indexOf("create-invalidation");
    assert.ok(lambdaIdx > 0, "missing update-function-code");
    assert.ok(s3Idx > lambdaIdx, "S3 sync must run after Lambda update");
    assert.ok(cfIdx > s3Idx, "CloudFront invalidation must run after S3 sync");
  });
});

