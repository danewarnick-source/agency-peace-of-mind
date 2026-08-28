/**
 * httpOnly session cookie so server routes can authenticate without the
 * browser Authorization header (SSR / first paint). Bearer tokens still
 * attach via attachSupabaseAuth for server functions.
 */

import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

export const AWS_SESSION_COOKIE = "hive.aws_session";

export type AwsSessionCookie = {
  access_token: string;
  refresh_token: string;
  app_user_id: string;
  email?: string;
  expires_at?: number;
};

export function readAwsSessionCookie(): AwsSessionCookie | null {
  try {
    const raw = getCookie(AWS_SESSION_COOKIE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AwsSessionCookie;
    if (!parsed?.access_token || !parsed?.app_user_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAwsSessionCookie(session: AwsSessionCookie): void {
  setCookie(AWS_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAwsSessionCookie(): void {
  deleteCookie(AWS_SESSION_COOKIE, { path: "/" });
}
