import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRememberMeOnSuccess,
  clearRememberedLoginEmail,
  normalizeRememberedLoginIdentifier,
  persistRememberedLoginEmail,
  readRememberedLoginEmail,
  REMEMBERED_LOGIN_EMAIL_KEY,
} from "./remember-login.ts";

describe("remember-login — email prefill only", () => {
  it("trims and caps the identifier", () => {
    assert.equal(normalizeRememberedLoginIdentifier("  dane@example.com  "), "dane@example.com");
    assert.equal(normalizeRememberedLoginIdentifier("   "), "");
    assert.equal(normalizeRememberedLoginIdentifier("x".repeat(200)).length, 120);
  });

  it("stores email when Remember me is checked and forgets when unchecked", () => {
    const storage = {
      data: new Map<string, string>(),
      getItem(key: string) {
        return this.data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.data.set(key, value);
      },
      removeItem(key: string) {
        this.data.delete(key);
      },
    };
    applyRememberMeOnSuccess(true, "  dane@example.com ", storage);
    assert.equal(readRememberedLoginEmail(storage), "dane@example.com");
    assert.equal(storage.getItem(REMEMBERED_LOGIN_EMAIL_KEY), "dane@example.com");
    applyRememberMeOnSuccess(false, "dane@example.com", storage);
    assert.equal(readRememberedLoginEmail(storage), "");
    persistRememberedLoginEmail("keep@example.com", storage);
    clearRememberedLoginEmail(storage);
    assert.equal(readRememberedLoginEmail(storage), "");
  });
});
