/**
 * Password sign-in against the publishable-key Auth API (not service role).
 * Used by login.server.ts so CloudFront/ECS can sign in with
 * SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY only.
 */

export const GENERIC_PASSWORD_ERROR = "Invalid username or password";

export type PasswordSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
};

type SignInResult = {
  data: {
    session: {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    } | null;
    user: { id: string } | null;
  };
  error: { message?: string } | null;
};

export type PublishableAuthClient = {
  auth: {
    signInWithPassword: (creds: { email: string; password: string }) => Promise<SignInResult>;
    signOut: () => Promise<unknown>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => { maybeSingle: () => Promise<{ data: unknown; error?: unknown }> };
      ilike: (
        col: string,
        val: unknown,
      ) => { maybeSingle: () => Promise<{ data: unknown; error?: unknown }> };
    };
  };
};

export type PasswordSignInServerDeps = {
  createPublishableClient: () => PublishableAuthClient;
  /** Optional privileged username→email lookup. Must not throw if service role is unset. */
  lookupUsernameEmailWithServiceRole?: (username: string) => Promise<string | null>;
};

export function readPublishableAuthEnv(
  env: Record<string, string | undefined> = process.env,
): { url: string; key: string } | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

async function resolveEmail(
  identifier: string,
  client: PublishableAuthClient,
  deps: PasswordSignInServerDeps,
): Promise<string> {
  if (isEmailIdentifier(identifier)) return identifier;

  try {
    const { data, error } = await client
      .from("profiles")
      .select("email")
      .ilike("username", identifier)
      .maybeSingle();
    if (!error) {
      const email = (data as { email?: string } | null)?.email;
      if (email) return email;
    }
  } catch {
    /* publishable RLS may hide emails — try optional service-role fallback */
  }

  if (deps.lookupUsernameEmailWithServiceRole) {
    try {
      const email = await deps.lookupUsernameEmailWithServiceRole(identifier);
      if (email) return email;
    } catch {
      throw new Error(GENERIC_PASSWORD_ERROR);
    }
  }

  throw new Error(GENERIC_PASSWORD_ERROR);
}

/**
 * Email+password never touches a service-role client. Username may try a
 * publishable profiles read, then an optional fallback that must return null
 * (not throw missing SERVICE_ROLE_KEY) when the key is absent.
 */
export async function performPasswordSignInWithClient(
  identifier: string,
  password: string,
  deps: PasswordSignInServerDeps,
): Promise<PasswordSession> {
  const client = deps.createPublishableClient();
  const email = await resolveEmail(identifier, client, deps);

  const { data: signIn, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !signIn?.session || !signIn.user) {
    throw new Error(GENERIC_PASSWORD_ERROR);
  }

  const userId = signIn.user.id;
  try {
    const { data: prof } = await client
      .from("profiles")
      .select("account_status")
      .eq("id", userId)
      .maybeSingle();
    if ((prof as { account_status?: string } | null)?.account_status === "archived") {
      await client.auth.signOut().catch(() => {});
      throw new Error("Account suspended. Contact your administrator.");
    }
  } catch (err) {
    if (err instanceof Error && /account suspended/i.test(err.message)) throw err;
    /* missing table / RLS — do not fail login with a service-role error */
  }

  return {
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
    expires_in: signIn.session.expires_in ?? 3600,
    user: { id: userId, email },
  };
}
