import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AUTH_AND_ORG_PREF_KEYS,
  SIGN_OUT_SENTINEL_KEY,
  clearAuthAndOrgClientState,
  clearExplicitSignOut,
  completeClientSignOut,
  hasExplicitSignOut,
  isSupabaseAuthStorageKey,
  markExplicitSignOut,
  shouldClearClientKeyOnSignOut,
} from "./client-sign-out.ts";
import { REMEMBERED_LOGIN_EMAIL_KEY } from "./remember-login.ts";
import { shouldSkipLoginAutoRedirect } from "./cognito-login-gate.ts";

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("client sign-out wipes auth + last-org, not remembered email", () => {
  it("recognizes Supabase auth token keys", () => {
    assert.equal(isSupabaseAuthStorageKey("sb-mmknqtdrefbzwfdtykza-auth-token"), true);
    assert.equal(isSupabaseAuthStorageKey("sb-abc-auth-token-code-verifier"), true);
    assert.equal(isSupabaseAuthStorageKey("supabase.auth.token"), true);
    assert.equal(isSupabaseAuthStorageKey(REMEMBERED_LOGIN_EMAIL_KEY), false);
    assert.equal(shouldClearClientKeyOnSignOut("hive.activeOrgId"), true);
    assert.equal(shouldClearClientKeyOnSignOut("portal-view"), true);
    assert.equal(shouldClearClientKeyOnSignOut(REMEMBERED_LOGIN_EMAIL_KEY), false);
    assert.ok(AUTH_AND_ORG_PREF_KEYS.includes("hive.activeOrgId"));
  });

  it("clears leftover session + Test Agency org id and sets the sign-out sentinel", async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("hive.activeOrgId", "bbbbbbbb-test-agency");
    local.setItem("portal-view", "admin");
    local.setItem("sb-mmknqtdrefbzwfdtykza-auth-token", "{\"access_token\":\"stale\"}");
    local.setItem(REMEMBERED_LOGIN_EMAIL_KEY, "dane@example.com");
    session.setItem("hive.session-hint", "1");

    let signedOut = false;
    await completeClientSignOut(
      async () => {
        signedOut = true;
      },
      { local, session },
    );

    assert.equal(signedOut, true);
    assert.equal(local.getItem("hive.activeOrgId"), null);
    assert.equal(local.getItem("portal-view"), null);
    assert.equal(local.getItem("sb-mmknqtdrefbzwfdtykza-auth-token"), null);
    assert.equal(session.getItem("hive.session-hint"), null);
    assert.equal(local.getItem(REMEMBERED_LOGIN_EMAIL_KEY), "dane@example.com");
    assert.equal(hasExplicitSignOut(local), true);
    assert.equal(local.getItem(SIGN_OUT_SENTINEL_KEY), "1");
  });

  it("still wipes leftovers when GoTrue signOut throws", async () => {
    const local = new MemoryStorage();
    local.setItem("hive.activeOrgId", "bbbbbbbb-test-agency");
    await completeClientSignOut(
      async () => {
        throw new Error("network");
      },
      { local, session: new MemoryStorage() },
    );
    assert.equal(local.getItem("hive.activeOrgId"), null);
    assert.equal(hasExplicitSignOut(local), true);
  });

  it("account-switch sign-out does not mark the login sentinel", async () => {
    const local = new MemoryStorage();
    local.setItem("hive.activeOrgId", "bbbbbbbb-test-agency");
    await completeClientSignOut(async () => {}, { markSignedOut: false, local, session: new MemoryStorage() });
    assert.equal(local.getItem("hive.activeOrgId"), null);
    assert.equal(hasExplicitSignOut(local), false);
  });

  it("explicit sign-out blocks leftover-session auto-redirect until they submit Sign in", () => {
    assert.equal(
      shouldSkipLoginAutoRedirect({
        isCognito: false,
        hadSessionOnArrival: true,
        justSignedIn: false,
        explicitSignOut: true,
      }),
      true,
    );
    assert.equal(
      shouldSkipLoginAutoRedirect({
        isCognito: false,
        hadSessionOnArrival: true,
        justSignedIn: true,
        explicitSignOut: true,
      }),
      false,
    );
    assert.equal(
      shouldSkipLoginAutoRedirect({
        isCognito: false,
        hadSessionOnArrival: true,
        justSignedIn: false,
        explicitSignOut: false,
      }),
      false,
    );
  });

  it("login and sign-out surfaces use completeClientSignOut; Remember me is email-only", () => {
    const login = readFileSync(new URL("../routes/login.tsx", import.meta.url), "utf8");
    assert.match(login, /completeClientSignOut/);
    assert.match(login, /applyRememberMeOnSuccess/);
    assert.match(login, /remember-me/);
    assert.match(login, /autoComplete="current-password"/);
    assert.doesNotMatch(login, /localStorage\.setItem\([^)]*password/i);

    const dash = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(dash, /completeClientSignOut/);

    const lock = readFileSync(new URL("../routes/billing-locked.tsx", import.meta.url), "utf8");
    assert.match(lock, /completeClientSignOut/);

    const client = readFileSync(new URL("../integrations/supabase/client.ts", import.meta.url), "utf8");
    assert.match(client, /persistSession:\s*true/);
  });
});

describe("explicit sign-out flag helpers", () => {
  it("marks and clears the sentinel", () => {
    const local = new MemoryStorage();
    assert.equal(hasExplicitSignOut(local), false);
    markExplicitSignOut(local);
    assert.equal(hasExplicitSignOut(local), true);
    clearExplicitSignOut(local);
    assert.equal(hasExplicitSignOut(local), false);
    clearAuthAndOrgClientState({ local, session: new MemoryStorage() });
    assert.equal(hasExplicitSignOut(local), false);
  });
});
