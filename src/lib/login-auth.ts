/** Client-side login helpers. Password checks stay on Auth — these only map errors. */

export const GENERIC_LOGIN_ERROR = "Invalid username or password";

export function isEmailIdentifier(identifier: string): boolean {
  return identifier.trim().includes("@");
}

/** True when this is the normal sign-in page, not an invite join. */
export function loginSearchHasInviteToken(search: { invite?: unknown; token?: unknown }): boolean {
  const raw = search.invite ?? search.token;
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Map Auth / server-fn failures to a toast. Wrong password stays generic so we
 * do not leak whether the account exists. Rate-limit and unconfirmed email are
 * distinct so they are not mistaken for a bad password.
 */
export function publicLoginErrorMessage(raw: unknown): string {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "message" in raw
          ? String((raw as { message: unknown }).message ?? "")
          : "";
  const lower = text.toLowerCase();

  if (/account suspended/.test(lower)) {
    return "Account suspended. Contact your administrator.";
  }
  if (/too many|rate limit|over_request_rate|429/.test(lower)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (/email not confirmed|not confirmed/.test(lower)) {
    return "Confirm your email, then try again.";
  }
  if (/failed to fetch|networkerror|load failed|missing supabase/.test(lower)) {
    return "Can't reach the sign-in service. Try again in a moment.";
  }
  return GENERIC_LOGIN_ERROR;
}

export type PasswordSignInDeps = {
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: { message: string } | null; user: { id: string } | null }>;
  signInWithUsername: (
    identifier: string,
    password: string,
  ) => Promise<{ access_token: string; refresh_token: string }>;
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: { message: string } | null }>;
  getAccountStatus: (userId: string) => Promise<string | null | undefined>;
  signOut: () => Promise<void>;
};

/**
 * Email or username + password. Callers supply Auth adapters so tests can mock
 * a valid password (accept) and a wrong one (reject) without hitting live Auth.
 */
export async function completePasswordSignIn(
  identifier: string,
  password: string,
  deps: PasswordSignInDeps,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = identifier.trim();
  if (!id || !password) return { ok: false, message: GENERIC_LOGIN_ERROR };

  try {
    if (isEmailIdentifier(id)) {
      const { error, user } = await deps.signInWithEmail(id, password);
      if (error) return { ok: false, message: publicLoginErrorMessage(error) };
      if (user) {
        const status = await deps.getAccountStatus(user.id);
        if (status === "archived") {
          await deps.signOut();
          return { ok: false, message: "Account suspended. Contact your administrator." };
        }
      }
      return { ok: true };
    }

    const tokens = await deps.signInWithUsername(id, password);
    const { error } = await deps.setSession(tokens);
    if (error) return { ok: false, message: publicLoginErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: publicLoginErrorMessage(err) };
  }
}
