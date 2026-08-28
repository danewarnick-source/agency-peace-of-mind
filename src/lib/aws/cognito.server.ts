/**
 * Server-only Cognito helpers. Used when AUTH_PROVIDER=cognito.
 * Does not force a password reset — USER_PASSWORD_AUTH verifies the same
 * password the User Migration Lambda already accepted (bcrypt from auth.users).
 * App user id is custom:supabase_id, never Cognito `sub`.
 */

import { createHmac } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AuthFlowType,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getCognitoConfig } from "./env";

const GENERIC = "Invalid username or password";

let _client: CognitoIdentityProviderClient | null = null;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function client(): CognitoIdentityProviderClient {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured (COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID).");
  if (!_client) {
    _client = new CognitoIdentityProviderClient({ region: cfg.region });
  }
  return _client;
}

function secretHash(username: string): string | undefined {
  const cfg = getCognitoConfig();
  if (!cfg?.clientSecret) return undefined;
  return createHmac("sha256", cfg.clientSecret)
    .update(username + cfg.clientId)
    .digest("base64");
}

function authParams(username: string, extra: Record<string, string>): Record<string, string> {
  const params = { USERNAME: username, ...extra };
  const hash = secretHash(username);
  if (hash) params.SECRET_HASH = hash;
  return params;
}

export type CognitoTokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
  cognitoSub: string;
  supabaseId: string | null;
};

function tokensFromAuthResult(
  result: {
    IdToken?: string;
    AccessToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
  },
  fallbackRefresh?: string,
): CognitoTokens {
  const idToken = result.IdToken || "";
  const accessToken = result.AccessToken || "";
  if (!idToken && !accessToken) throw new Error(GENERIC);
  const payload = decodePayload(idToken || accessToken);
  const supabaseId =
    typeof payload["custom:supabase_id"] === "string" ? payload["custom:supabase_id"] : null;
  return {
    idToken: idToken || accessToken,
    accessToken: accessToken || idToken,
    refreshToken: result.RefreshToken || fallbackRefresh || "",
    expiresIn: result.ExpiresIn ?? 3600,
    email: typeof payload.email === "string" ? payload.email : "",
    cognitoSub: typeof payload.sub === "string" ? payload.sub : "",
    supabaseId,
  };
}

function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function cognitoInitiatePasswordAuth(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  try {
    const out = await client().send(
      new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: cfg.clientId,
        AuthParameters: authParams(email, { PASSWORD: password }),
      }),
    );
    if (out.ChallengeName) {
      // Do not force a password reset. Migration should have stored the
      // original hash; a challenge here is an infra/config problem.
      console.error("[cognito] unexpected challenge", out.ChallengeName);
      throw new Error(GENERIC);
    }
    if (!out.AuthenticationResult) throw new Error(GENERIC);
    return tokensFromAuthResult(out.AuthenticationResult);
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
    if (
      name === "NotAuthorizedException" ||
      name === "UserNotFoundException" ||
      name === "UserNotConfirmedException"
    ) {
      throw new Error(GENERIC);
    }
    if (name === "PasswordResetRequiredException" || name === "UserLambdaValidationException") {
      throw new Error(GENERIC);
    }
    throw err instanceof Error ? err : new Error(GENERIC);
  }
}

export async function cognitoRefresh(refreshToken: string, username?: string): Promise<CognitoTokens> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  const extra: Record<string, string> = { REFRESH_TOKEN: refreshToken };
  const out = await client().send(
    new InitiateAuthCommand({
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: cfg.clientId,
      AuthParameters: username ? authParams(username, extra) : extra,
    }),
  );
  if (!out.AuthenticationResult) throw new Error("Session expired. Sign in again.");
  return tokensFromAuthResult(out.AuthenticationResult, refreshToken);
}

export async function cognitoGetUser(accessToken: string): Promise<{
  email: string;
  supabaseId: string | null;
  username: string;
}> {
  const out = await client().send(new GetUserCommand({ AccessToken: accessToken }));
  const attrs = Object.fromEntries((out.UserAttributes ?? []).map((a) => [a.Name ?? "", a.Value ?? ""]));
  return {
    email: attrs.email || "",
    supabaseId: attrs["custom:supabase_id"] || null,
    username: out.Username || "",
  };
}

export async function cognitoGlobalSignOut(accessToken: string): Promise<void> {
  try {
    await client().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch {
    /* already invalid is fine */
  }
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  await client().send(
    new ForgotPasswordCommand({
      ClientId: cfg.clientId,
      Username: email,
      SecretHash: secretHash(email),
    }),
  );
}

export async function cognitoAdminSetPassword(email: string, password: string): Promise<void> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  await client().send(
    new AdminSetUserPasswordCommand({
      UserPoolId: cfg.userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );
}

export async function cognitoAdminCreateUser(opts: {
  email: string;
  password: string;
  supabaseId: string;
  fullName?: string;
}): Promise<void> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  await client().send(
    new AdminCreateUserCommand({
      UserPoolId: cfg.userPoolId,
      Username: opts.email,
      MessageAction: MessageActionType.SUPPRESS,
      UserAttributes: [
        { Name: "email", Value: opts.email },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:supabase_id", Value: opts.supabaseId },
        ...(opts.fullName ? [{ Name: "name", Value: opts.fullName }] : []),
      ],
    }),
  );
  await cognitoAdminSetPassword(opts.email, opts.password);
}

export async function cognitoAdminDeleteUser(email: string): Promise<void> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  await client().send(
    new AdminDeleteUserCommand({
      UserPoolId: cfg.userPoolId,
      Username: email,
    }),
  );
}

export async function cognitoAdminUpdateSupabaseId(email: string, supabaseId: string): Promise<void> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured.");
  await client().send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: cfg.userPoolId,
      Username: email,
      UserAttributes: [{ Name: "custom:supabase_id", Value: supabaseId }],
    }),
  );
}

function jwksFor(cfg: NonNullable<ReturnType<typeof getCognitoConfig>>) {
  const url = `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}/.well-known/jwks.json`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export type VerifiedCognitoUser = {
  supabaseId: string | null;
  email: string;
  cognitoSub: string;
  tokenUse: string;
  raw: Record<string, unknown>;
};

export async function verifyCognitoJwt(token: string): Promise<VerifiedCognitoUser> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Unauthorized");
  const issuer = `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`;
  const { payload } = await jwtVerify(token, jwksFor(cfg), {
    issuer,
    audience: undefined,
  });
  const tokenUse = String(payload.token_use ?? "");
  if (tokenUse === "id" && payload.aud && payload.aud !== cfg.clientId) {
    throw new Error("Unauthorized");
  }
  if (tokenUse === "access" && payload.client_id && payload.client_id !== cfg.clientId) {
    throw new Error("Unauthorized");
  }
  const supabaseId =
    typeof payload["custom:supabase_id"] === "string" ? payload["custom:supabase_id"] : null;
  return {
    supabaseId,
    email: typeof payload.email === "string" ? payload.email : "",
    cognitoSub: typeof payload.sub === "string" ? payload.sub : "",
    tokenUse,
    raw: payload as Record<string, unknown>,
  };
}

/**
 * Resolve the app user id (profiles.id). Cognito sub is never used as an FK.
 */
export async function resolveAppUserId(opts: {
  supabaseId: string | null;
  email: string;
  accessToken?: string;
  lookupEmail: (email: string) => Promise<string | null>;
}): Promise<string> {
  if (opts.supabaseId && isUuid(opts.supabaseId)) return opts.supabaseId;
  if (opts.accessToken) {
    try {
      const u = await cognitoGetUser(opts.accessToken);
      if (u.supabaseId && isUuid(u.supabaseId)) return u.supabaseId;
      if (!opts.email && u.email) opts = { ...opts, email: u.email };
    } catch {
      /* fall through to email lookup */
    }
  }
  if (opts.email) {
    const id = await opts.lookupEmail(opts.email);
    if (id && isUuid(id)) return id;
  }
  throw new Error("Unauthorized");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
