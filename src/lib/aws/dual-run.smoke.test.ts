import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  getAuthProvider,
  isAwsDatabaseEnabled,
  isCognitoAuth,
  isS3StorageEnabled,
  resolveSupabaseClientEnv,
  shouldProxyClientData,
} from "./env.ts";
import { createCognitoAuthAdapter } from "./auth-adapter.ts";
import {
  quoteIdent,
  filterToSql,
  parseSelectList,
  orExprToSql,
  selectColumnSql,
  parseSelectAlias,
} from "./query-builder.ts";

const SAVED = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in SAVED)) delete process.env[key];
  }
  Object.assign(process.env, SAVED);
  delete process.env.AUTH_PROVIDER;
  delete process.env.VITE_AUTH_PROVIDER;
  delete process.env.DATABASE_URL;
  delete process.env.AWS_DATABASE_URL;
  delete process.env.S3_BUCKET;
  delete process.env.COGNITO_USER_POOL_ID;
  delete process.env.COGNITO_CLIENT_ID;
}

afterEach(() => {
  restoreEnv();
});

describe("AWS dual-run default (no AWS env)", () => {
  it("defaults auth to supabase and leaves data/storage on the current path", () => {
    restoreEnv();
    assert.equal(getAuthProvider(), "supabase");
    assert.equal(isCognitoAuth(), false);
    assert.equal(isAwsDatabaseEnabled(), false);
    assert.equal(isS3StorageEnabled(), false);
    assert.equal(shouldProxyClientData(), false);
  });

  it("still constructs the supabase client when AWS env vars are missing", () => {
    restoreEnv();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "anon-key";
    const env = resolveSupabaseClientEnv();
    assert.equal(env.SUPABASE_URL, "https://example.supabase.co");
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    assert.equal(typeof client.auth.signInWithPassword, "function");
    assert.equal(typeof client.from, "function");
  });
});

describe("AWS dual-run Cognito adapter", () => {
  it("selects Cognito and does not call supabase.auth.signIn", async () => {
    process.env.AUTH_PROVIDER = "cognito";
    process.env.COGNITO_USER_POOL_ID = "us-east-1_test";
    process.env.COGNITO_CLIENT_ID = "clientid";
    process.env.COGNITO_REGION = "us-east-1";
    assert.equal(getAuthProvider(), "cognito");

    let supabaseCalled = 0;
    let cognitoCalled = 0;
    const adapter = createCognitoAuthAdapter({
      cognitoSignIn: async (email, password) => {
        cognitoCalled += 1;
        assert.equal(email, "dane@example.com");
        assert.equal(password, "same-as-supabase");
        return {
          access_token: fakeIdToken("11111111-1111-4111-8111-111111111111", "dane@example.com"),
          refresh_token: "refresh",
          expires_in: 3600,
          user: { id: "11111111-1111-4111-8111-111111111111", email: "dane@example.com" },
        };
      },
      supabaseSignIn: async () => {
        supabaseCalled += 1;
        throw new Error("supabase.auth.signInWithPassword must not run on the Cognito path");
      },
    });

    const { data, error } = await adapter.signInWithPassword({
      email: "dane@example.com",
      password: "same-as-supabase",
    });
    assert.equal(error, null);
    assert.equal(data.user?.id, "11111111-1111-4111-8111-111111111111");
    assert.equal(cognitoCalled, 1);
    assert.equal(supabaseCalled, 0);
  });

  it("does not treat Cognito sub as the app user id", async () => {
    process.env.AUTH_PROVIDER = "cognito";
    const adapter = createCognitoAuthAdapter({
      cognitoSignIn: async () => ({
        access_token: fakeIdToken(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "a@b.c",
          "cognito-sub-NOT-app-id",
        ),
        refresh_token: "r",
        user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@b.c" },
      }),
    });
    const { data } = await adapter.signInWithPassword({ email: "a@b.c", password: "x" });
    assert.equal(data.user?.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.notEqual(data.user?.id, "cognito-sub-NOT-app-id");
  });
});

describe("query builder SQL safety", () => {
  it("quotes identifiers and rejects injection in table/column names", () => {
    assert.equal(quoteIdent("profiles"), '"profiles"');
    assert.throws(() => quoteIdent("profiles; drop table"));
    assert.throws(() => quoteIdent("a b"));
  });

  it("parameterizes eq filters", () => {
    const params: unknown[] = [];
    const sql = filterToSql({ op: "eq", column: "user_id", value: "abc" }, params);
    assert.equal(sql, '"user_id" = $1');
    assert.deepEqual(params, ["abc"]);
  });

  it("parses nested select embeds used by org + punch pad", () => {
    const parsed = parseSelectList(
      "id, role, organization_id, organizations(name, is_demo), clients:client_id(first_name, last_name)",
    );
    assert.ok(parsed.columns.includes("id"));
    assert.equal(parsed.embeds.length, 2);
    assert.equal(parsed.embeds[0].alias, "organizations");
    assert.equal(parsed.embeds[1].alias, "clients");
    assert.equal(parsed.embeds[1].hint, "client_id");
  });

  it("turns PostgREST or() into parameterized SQL", () => {
    const params: unknown[] = [];
    const sql = orExprToSql("first_name.ilike.%ann%,last_name.ilike.%ann%", params);
    assert.match(sql, /ILIKE/);
    assert.equal(params.length, 2);
  });

  it("treats PostgREST select aliases as renames, not invalid identifiers", () => {
    const live = "upi_submitted_at:state_submitted_at";
    assert.doesNotThrow(() => quoteIdent("state_submitted_at"));
    assert.throws(() => quoteIdent(live));
    const parsed = parseSelectAlias(live);
    assert.deepEqual(parsed, { alias: "upi_submitted_at", column: "state_submitted_at" });
    assert.equal(
      selectColumnSql(
        "id, report_number, client_id, discovered_at, upi_submitted_at:state_submitted_at, status",
      ),
      '"id", "report_number", "client_id", "discovered_at", "state_submitted_at" AS "upi_submitted_at", "status"',
    );
  });

  it("parses every alias:column used by home/admin bootstrap", () => {
    const aliases = [
      "upi_submitted_at:state_submitted_at",
      "record_date:log_date",
      "uploaded_at:created_at",
      "provider_id:user_id",
    ];
    for (const token of aliases) {
      const renamed = parseSelectAlias(token);
      assert.ok(renamed, `expected alias parse for ${token}`);
      assert.equal(
        selectColumnSql(token),
        `${quoteIdent(renamed!.column)} AS ${quoteIdent(renamed!.alias)}`,
      );
    }
    const deadlines = readFileSync(
      new URL("../../hooks/use-deadlines.tsx", import.meta.url),
      "utf8",
    );
    assert.match(deadlines, /upi_submitted_at:state_submitted_at/);
    const pay = readFileSync(
      new URL("../../hooks/use-nectar-pay-period.tsx", import.meta.url),
      "utf8",
    );
    assert.match(pay, /record_date:log_date/);
    const util = readFileSync(
      new URL("../../hooks/use-client-utilization.tsx", import.meta.url),
      "utf8",
    );
    assert.match(util, /record_date:log_date/);
    const docs = readFileSync(new URL("../nectar-documents.functions.ts", import.meta.url), "utf8");
    assert.match(docs, /uploaded_at:created_at/);
    const audit = readFileSync(new URL("../internal-audit.functions.ts", import.meta.url), "utf8");
    assert.match(audit, /record_date:log_date/);
    assert.match(audit, /provider_id:user_id/);
  });

  it("does not treat embed syntax as a column alias", () => {
    const parsed = parseSelectList(
      "id, clients:client_id(first_name, last_name), upi_submitted_at:state_submitted_at",
    );
    assert.equal(parsed.embeds.length, 1);
    assert.equal(parsed.embeds[0].alias, "clients");
    assert.ok(parsed.columns.includes("upi_submitted_at:state_submitted_at"));
    assert.ok(parsed.columns.includes("id"));
    assert.equal(parseSelectAlias("clients:client_id(first_name)"), null);
  });
});

describe("RDS TLS for /api/aws/db", () => {
  it("trusts the Amazon RDS CA and still verifies the server certificate", async () => {
    const { pgPoolConnectionOptions, rdsTlsOptions } = await import("./rds-ssl.ts");
    const ssl = rdsTlsOptions();
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(typeof ssl.ca, "string");
    const ca = String(ssl.ca);
    assert.match(ca, /BEGIN CERTIFICATE/);
    assert.ok((ca.match(/BEGIN CERTIFICATE/g) || []).length >= 50);
    const firstPem = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    assert.ok(firstPem);
    const { X509Certificate } = await import("node:crypto");
    const cert = new X509Certificate(firstPem[0]);
    assert.match(cert.subject, /Amazon RDS/);

    const url =
      "postgres://hive:secret@hive-postgres.cw34wm80sxx7.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require";
    const opts = pgPoolConnectionOptions(url);
    assert.equal(opts.ssl.rejectUnauthorized, true);
    assert.equal(opts.ssl.ca, ssl.ca);
    assert.doesNotMatch(opts.connectionString, /sslmode/i);
    assert.doesNotMatch(opts.connectionString, /sslrootcert/i);
    assert.match(opts.connectionString, /hive-postgres\.cw34wm80sxx7/);
  });

  it("does not disable TLS verification in the Postgres client", () => {
    const pgSrc = readFileSync(new URL("./pg.server.ts", import.meta.url), "utf8");
    const sslSrc = readFileSync(new URL("./rds-ssl.ts", import.meta.url), "utf8");
    for (const src of [pgSrc, sslSrc]) {
      assert.doesNotMatch(src, /process\.env\.NODE_TLS_REJECT_UNAUTHORIZED/);
      assert.doesNotMatch(src, /rejectUnauthorized:\s*false/);
    }
  });
});

describe("Nitro AWS entry plugin", () => {
  it("does not use defineNitroPlugin (auto-import is missing in node-server index.mjs)", () => {
    const src = readFileSync(
      new URL("../../nitro-plugins/alb-origin-verify.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /export default function/);
    assert.doesNotMatch(src, /export default defineNitroPlugin/);
    assert.doesNotMatch(src, /declare function defineNitroPlugin/);
  });
});

describe("missing org_member_directory does not 500", () => {
  it("degrades SELECT to empty rows", async () => {
    const { shouldDegradeMissingSelect, emptySelectResult, isUndefinedTableError } =
      await import("./missing-relation.ts");
    const err = Object.assign(new Error('relation "org_member_directory" does not exist'), {
      code: "42P01",
    });
    assert.equal(isUndefinedTableError(err, "org_member_directory"), true);
    assert.equal(
      shouldDegradeMissingSelect({ op: "select", table: "org_member_directory" }, err),
      true,
    );
    assert.equal(shouldDegradeMissingSelect({ op: "select", table: "profiles" }, err), false);
    const empty = emptySelectResult({ want: "many", head: false });
    assert.deepEqual(empty.data, []);
    assert.equal(empty.error, null);
    assert.equal(empty.status, 200);
  });
});

describe("optional client_progress_summaries upsert", () => {
  it("no-ops FK violations instead of 500", async () => {
    const { shouldNoopOptionalUpsert, emptyMutationResult } = await import("./missing-relation.ts");
    const err = Object.assign(
      new Error(
        'insert or update on table "client_progress_summaries" violates foreign key constraint "client_progress_summaries_client_id_fkey"',
      ),
      { code: "23503", constraint: "client_progress_summaries_client_id_fkey" },
    );
    assert.equal(
      shouldNoopOptionalUpsert({ op: "upsert", table: "client_progress_summaries" }, err),
      true,
    );
    assert.equal(
      shouldNoopOptionalUpsert({ op: "select", table: "client_progress_summaries" }, err),
      false,
    );
    assert.equal(shouldNoopOptionalUpsert({ op: "upsert", table: "profiles" }, err), false);
    const empty = emptyMutationResult();
    assert.deepEqual(empty.data, []);
    assert.equal(empty.error, null);
    assert.equal(empty.status, 200);
  });

  it("ensureCurrentSummaryPeriods skips unknown client_id and does not throw on FK", () => {
    const src = readFileSync(
      new URL("../progress-summaries.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /if \(!clientMeta\.has\(clientId\)\) continue/);
    assert.match(src, /client_progress_summaries_client_id_fkey/);
    assert.match(src, /toIsoDateDay/);
  });
});

describe("/api/aws/db never emits HTTP 500", () => {
  it("maps executePlan 500 to HTTP 200 with JSON error body", async () => {
    const { httpStatusForAwsDbResult, awsDbUnhandledBody, isAwsDbLogical5xx } =
      await import("./exec-http.ts");
    assert.equal(httpStatusForAwsDbResult(500), 200);
    assert.equal(httpStatusForAwsDbResult(400), 200);
    assert.equal(httpStatusForAwsDbResult(401), 401);
    assert.equal(httpStatusForAwsDbResult(200), 200);
    const body = awsDbUnhandledBody("HTTPError");
    assert.equal(body.status, 500);
    assert.equal(body.error?.message, "HTTPError");
    assert.equal(isAwsDbLogical5xx({ status: 500, error: { message: "x" } }), true);
    assert.equal(isAwsDbLogical5xx({ unhandled: true, error: { message: "HTTPError" } }), true);
    assert.equal(isAwsDbLogical5xx({ status: 200, error: null }), false);
    const routeSrc = readFileSync(new URL("../../routes/api/aws/db.ts", import.meta.url), "utf8");
    assert.match(routeSrc, /httpStatusForAwsDbResult/);
    assert.match(routeSrc, /status: 200/);
    assert.doesNotMatch(routeSrc, /result\.status >= 400 \? result\.status : 200/);
  });
});

describe("Cognito login / dashboard hang guards", () => {
  it("login skips leftover-session auto-enter on Cognito", () => {
    const src = readFileSync(new URL("../../routes/login.tsx", import.meta.url), "utf8");
    assert.match(src, /shouldSkipLoginAutoRedirect/);
    assert.match(src, /justSignedIn/);
  });

  it("leaves the Cognito Loading overlay on aws-db 5xx, org error, or timeout", async () => {
    const { shouldLeaveCognitoLoadingOverlay } = await import("../cognito-login-gate.ts");
    assert.equal(
      shouldLeaveCognitoLoadingOverlay({
        isCognito: true,
        hasSession: true,
        awsDb5xx: true,
        orgError: false,
        timedOut: false,
      }),
      true,
    );
    assert.equal(
      shouldLeaveCognitoLoadingOverlay({
        isCognito: true,
        hasSession: true,
        awsDb5xx: false,
        orgError: true,
        timedOut: false,
      }),
      true,
    );
    assert.equal(
      shouldLeaveCognitoLoadingOverlay({
        isCognito: true,
        hasSession: true,
        awsDb5xx: false,
        orgError: false,
        timedOut: true,
      }),
      true,
    );
    assert.equal(
      shouldLeaveCognitoLoadingOverlay({
        isCognito: true,
        hasSession: true,
        awsDb5xx: false,
        orgError: false,
        timedOut: false,
      }),
      false,
    );
    assert.equal(
      shouldLeaveCognitoLoadingOverlay({
        isCognito: false,
        hasSession: true,
        awsDb5xx: true,
        orgError: true,
        timedOut: true,
      }),
      false,
    );
    const src = readFileSync(new URL("../../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(src, /dashboard-spinner-sign-out/);
    assert.match(src, /shouldLeaveCognitoLoadingOverlay/);
    assert.match(src, /hive:aws-db-error|AWS_DB_ERROR_EVENT/);
    assert.match(src, /cognito-bootstrap-error/);
    assert.doesNotMatch(src, /if \(!orgError\) return;[\s\S]*signOut\(\)/);
  });

  it("fetchOrgGoLiveDate never calls slice on raw pg values", () => {
    const src = readFileSync(
      new URL("../company-obligations.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /toIsoDateDay/);
    assert.doesNotMatch(src, /raw\.slice/);
  });
});

function fakeIdToken(supabaseId: string, email: string, sub = "cognito-sub"): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      "custom:supabase_id": supabaseId,
      token_use: "id",
    }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}
