import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  headersFromNitroRequestEvent,
  nitroEventHasReadableHeaders,
  requestFromNitroEvent,
} from "./nitro-origin-headers.ts";

describe("nitro origin headers — node-server and Lambda Function URL", () => {
  it("reads Node IncomingMessage headers (ALB / node-server)", () => {
    const headers = headersFromNitroRequestEvent({
      node: {
        req: {
          headers: {
            "x-origin-verify": "secret-from-alb",
            authorization: "Bearer test",
          },
        },
      },
    });
    assert.equal(headers.get("x-origin-verify"), "secret-from-alb");
    assert.equal(headers.get("authorization"), "Bearer test");
    assert.equal(nitroEventHasReadableHeaders({ node: { req: { headers: { host: "alb" } } } }), true);
  });

  it("reads Fetch Request headers (Nitro aws-lambda Function URL)", () => {
    const headers = headersFromNitroRequestEvent({
      req: new Request("https://fn.lambda-url.us-east-1.on.aws/_serverFn", {
        headers: {
          "x-origin-verify": "secret-from-cf",
          authorization: "Bearer fn",
        },
      }),
    });
    assert.equal(headers.get("x-origin-verify"), "secret-from-cf");
    assert.equal(headers.get("authorization"), "Bearer fn");
  });

  it("reads a raw header map when node.req is missing (Lambda event leftover)", () => {
    const headers = headersFromNitroRequestEvent({
      headers: {
        "x-origin-verify": "from-map",
        "x-amzn-trace-id": "Root=1-test",
      },
    });
    assert.equal(headers.get("x-origin-verify"), "from-map");
  });

  it("builds a Request the origin-verify helper can consume", () => {
    const request = requestFromNitroEvent({
      req: new Request("https://example.test/", {
        headers: { "x-origin-verify": "abc" },
      }),
    });
    assert.equal(request.headers.get("x-origin-verify"), "abc");
  });

  it("plugin is a plain export (no defineNitroPlugin) and uses the shared header helper", () => {
    const src = readFileSync(new URL("../nitro-plugins/alb-origin-verify.ts", import.meta.url), "utf8");
    assert.match(src, /export default function albOriginVerifyPlugin/);
    assert.match(src, /requestFromNitroEvent/);
    assert.doesNotMatch(src, /defineNitroPlugin\s*\(/);
    assert.doesNotMatch(src, /if \(!req\) return/);
  });
});
