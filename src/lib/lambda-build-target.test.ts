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
});
