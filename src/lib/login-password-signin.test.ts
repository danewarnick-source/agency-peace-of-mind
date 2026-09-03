import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GENERIC_PASSWORD_ERROR,
  performPasswordSignInWithClient,
  readPublishableAuthEnv,
  type PasswordSignInServerDeps,
  type PublishableAuthClient,
} from "./login-password-signin.ts";

function publishableClient(
  overrides: Partial<{
    signIn: PublishableAuthClient["auth"]["signInWithPassword"];
    usernameRow: { email: string } | null;
    status: string | null;
  }> = {},
): PublishableAuthClient & { signInCalls: Array<{ email: string; password: string }> } {
  const signInCalls: Array<{ email: string; password: string }> = [];
  const client: PublishableAuthClient & { signInCalls: typeof signInCalls } = {
    signInCalls,
    auth: {
      signInWithPassword: async (creds) => {
        signInCalls.push(creds);
        if (overrides.signIn) return overrides.signIn(creds);
        return {
          data: {
            session: {
              access_token: "access-token",
              refresh_token: "refresh-token",
              expires_in: 3600,
            },
            user: { id: "0a6df668-a1a4-4cad-86f2-815ba4d9e1c0" },
          },
          error: null,
        };
      },
      signOut: async () => ({}),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "profiles" ? { account_status: overrides.status ?? "active" } : null,
          }),
        }),
        ilike: () => ({
          maybeSingle: async () => ({ data: overrides.usernameRow ?? null }),
        }),
      }),
    }),
  };
  return client;
}

describe("readPublishableAuthEnv", () => {
  it("uses URL + publishable key and does not require SERVICE_ROLE_KEY", () => {
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "anon-publishable",
    };
    assert.deepEqual(readPublishableAuthEnv({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }), {
      url: "https://example.supabase.co",
      key: "anon-publishable",
    });
    assert.equal(
      readPublishableAuthEnv({ SUPABASE_SERVICE_ROLE_KEY: "secret-service-role" }),
      null,
    );
  });

  it("maps Vercel VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", () => {
    assert.deepEqual(
      readPublishableAuthEnv({
        VITE_SUPABASE_URL: "https://dhrrukdcigiiqksibdfb.supabase.co",
        VITE_SUPABASE_ANON_KEY: "vite-anon-key",
      }),
      {
        url: "https://dhrrukdcigiiqksibdfb.supabase.co",
        key: "vite-anon-key",
      },
    );
  });
});

describe("login.server publishable-key wiring", () => {
  it("does not call supabaseAdmin.auth.signInWithPassword", () => {
    const src = readFileSync(new URL("./login.server.ts", import.meta.url), "utf8");
    assert.match(src, /createPublishableAuthClient/);
    assert.match(src, /performPasswordSignInWithClient/);
    assert.doesNotMatch(src, /supabaseAdmin\.auth\.signInWithPassword/);
    assert.doesNotMatch(src, /console\.(log|error|info|debug|warn)\([^\n]*password/i);
  });
});

describe("performPasswordSignInWithClient", () => {
  it("email+password calls signInWithPassword on the publishable client when SERVICE_ROLE_KEY is unset", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = publishableClient();
    let serviceRoleLookups = 0;
    const deps: PasswordSignInServerDeps = {
      createPublishableClient: () => client,
      lookupUsernameEmailWithServiceRole: async () => {
        serviceRoleLookups += 1;
        throw new Error("Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY");
      },
    };

    const session = await performPasswordSignInWithClient(
      "dane@example.com",
      "correct-horse",
      deps,
    );

    assert.equal(serviceRoleLookups, 0);
    assert.equal(client.signInCalls.length, 1);
    assert.equal(client.signInCalls[0].email, "dane@example.com");
    assert.equal(client.signInCalls[0].password, "correct-horse");
    assert.equal(session.user.id, "0a6df668-a1a4-4cad-86f2-815ba4d9e1c0");
    assert.equal(session.access_token, "access-token");
  });

  it("does not throw missing service role when username lookup cannot see emails", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = publishableClient({ usernameRow: null });
    await assert.rejects(
      () =>
        performPasswordSignInWithClient("dane", "correct-horse", {
          createPublishableClient: () => client,
          lookupUsernameEmailWithServiceRole: async () => null,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, GENERIC_PASSWORD_ERROR);
        assert.doesNotMatch(err.message, /SERVICE_ROLE_KEY/);
        return true;
      },
    );
    assert.equal(client.signInCalls.length, 0);
  });
});
