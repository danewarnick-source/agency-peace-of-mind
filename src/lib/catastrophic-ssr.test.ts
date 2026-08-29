import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isCatastrophicSsrErrorBody,
  shouldHtmlRewriteCatastrophic500,
} from "./catastrophic-ssr.ts";

describe("catastrophic SSR JSON 500 must not become HTML for POSTs", () => {
  const unhandled = JSON.stringify({ status: 500, unhandled: true, message: "HTTPError" });

  it("recognizes the live h3 body", () => {
    assert.equal(isCatastrophicSsrErrorBody(unhandled, 500), true);
    assert.equal(isCatastrophicSsrErrorBody("<html>500</html>", 500), false);
  });

  it("does not HTML-rewrite a JSON 500 with unhandled HTTPError on a POST", () => {
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "POST",
        acceptHeader: "application/json",
      }),
      false,
    );
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "POST",
        acceptHeader: "text/html,application/json",
      }),
      false,
    );
  });

  it("keeps JSON for fetch-default Accept on GET/HEAD (serverFn RPCs)", () => {
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "GET",
        acceptHeader: "*/*",
      }),
      false,
    );
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "GET",
        acceptHeader: "",
      }),
      false,
    );
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "HEAD",
        acceptHeader: "application/json",
      }),
      false,
    );
  });

  it("still HTML-rewrites a GET document navigation", () => {
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "GET",
        acceptHeader: "text/html,application/xhtml+xml",
      }),
      true,
    );
  });

  it("keeps JSON when Accept prefers application/json", () => {
    assert.equal(
      shouldHtmlRewriteCatastrophic500({
        method: "GET",
        acceptHeader: "application/json,text/html",
      }),
      false,
    );
  });

  it("wires the rewrite guard into server.ts, start.ts, and the Nitro error handler", () => {
    const serverSrc = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(serverSrc, /shouldHtmlRewriteCatastrophic500/);
    assert.match(serverSrc, /method=\$\{method\} url=\$\{url\} accept=\$\{accept\}/);
    assert.match(serverSrc, /if \(!rewrite\) return response/);
    assert.match(serverSrc, /stripped HTML 500/);
    const startSrc = readFileSync(new URL("../start.ts", import.meta.url), "utf8");
    assert.match(startSrc, /shouldHtmlRewriteCatastrophic500/);
    assert.match(startSrc, /Response\.json\(\{ status: 500, unhandled: true, message \}/);
    const nitroSrc = readFileSync(new URL("../nitro-plugins/error-handler.ts", import.meta.url), "utf8");
    assert.match(nitroSrc, /captureError\(error\)/);
    assert.match(nitroSrc, /method=\$\{method\} url=\$\{url\} accept=\$\{accept\}/);
    assert.match(nitroSrc, /from "h3"/);
    assert.doesNotMatch(nitroSrc, /renderErrorPage/);
  });
});
