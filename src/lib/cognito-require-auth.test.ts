import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AWS_SESSION_COOKIE_NAME,
  cognitoUnresolvedUserAction,
  cookieHeaderHasAwsSession,
  emptySsrAuthContext,
} from "./cognito-require-auth.ts";

describe("Cognito requireSupabaseAuth missing user does not throw", () => {
  it("returns empty isSSR context instead of Unauthorized", () => {
    assert.equal(cognitoUnresolvedUserAction(), "empty-ssr-context");
    assert.doesNotThrow(() => cognitoUnresolvedUserAction());
    const ctx = emptySsrAuthContext();
    assert.equal(ctx.supabase, null);
    assert.equal(ctx.userId, null);
    assert.equal(ctx.isSSR, true);
  });

  it("detects hive.aws_session on the Cookie header", () => {
    assert.equal(AWS_SESSION_COOKIE_NAME, "hive.aws_session");
    assert.equal(cookieHeaderHasAwsSession("hive.aws_session=abc; Path=/"), true);
    assert.equal(cookieHeaderHasAwsSession("other=1"), false);
  });

  it("cognito branch in auth-middleware does not throw Unauthorized", () => {
    const src = readFileSync(
      new URL("../integrations/supabase/auth-middleware.ts", import.meta.url),
      "utf8",
    );
    const cognitoStart = src.indexOf("if (isCognitoAuth())");
    const supabaseEnv = src.indexOf("Missing Supabase environment variables");
    assert.ok(cognitoStart >= 0);
    assert.ok(supabaseEnv > cognitoStart);
    const cognitoBlock = src.slice(cognitoStart, supabaseEnv);
    assert.match(cognitoBlock, /emptySsrAuthContext/);
    assert.match(cognitoBlock, /logCognitoRequireAuth/);
    assert.doesNotMatch(cognitoBlock, /throw new Error\("Unauthorized"\)/);
    assert.doesNotMatch(cognitoBlock, /Cognito token rejected/);
  });
});
