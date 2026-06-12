/**
 * Gmail OAuth callback. PUBLIC route — must validate the signed `state`
 * before doing anything with `code`.
 *
 *  1. verify state HMAC + expiry → recover { org_id, user_id }
 *  2. exchange code for tokens against Google
 *  3. fetch userinfo to capture connected email + sub
 *  4. upsert gmail_connections (service_role; tokens never go to client)
 *  5. audit row, then redirect back to /dashboard/settings/gmail
 */
import { createFileRoute } from "@tanstack/react-router";

function htmlError(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Gmail connect</title>` +
      `<body style="font:14px system-ui;padding:32px;max-width:560px;margin:auto">` +
      `<h2>Gmail couldn't be connected</h2>` +
      `<p>${message.replace(/[<>]/g, "")}</p>` +
      `<p><a href="/dashboard/settings/gmail">Back to Gmail settings</a></p>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateRaw = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err) return htmlError(`Google returned an error: ${err}`);
        if (!code || !stateRaw) return htmlError("Missing code or state in callback URL.");

        let state;
        try {
          const { verifyOAuthState } = await import("@/lib/gmail-oauth.server");
          state = verifyOAuthState(stateRaw);
        } catch (e) {
          return htmlError((e as Error).message);
        }

        const redirectUri = `${url.origin}/api/public/oauth/gmail/callback`;
        let tokens;
        let userinfo;
        try {
          const { exchangeCodeForTokens, getGoogleUserinfo } = await import("@/lib/gmail-oauth.server");
          tokens = await exchangeCodeForTokens(code, redirectUri);
          userinfo = await getGoogleUserinfo(tokens.access_token);
        } catch (e) {
          return htmlError((e as Error).message);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
        const scopesArr = tokens.scope ? tokens.scope.split(/\s+/) : [];

        const { error: upsertErr } = await supabaseAdmin
          .from("gmail_connections")
          .upsert(
            {
              organization_id: state.org,
              google_email: userinfo.email,
              google_sub: userinfo.sub,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? null,
              token_expires_at: expiresAt,
              scopes: scopesArr,
              status: "active",
              last_error: null,
              disconnected_at: null,
              connected_by: state.uid,
              connected_at: new Date().toISOString(),
            },
            { onConflict: "organization_id" },
          );
        if (upsertErr) return htmlError(`Could not save connection: ${upsertErr.message}`);

        await supabaseAdmin.from("gmail_ingestion_audit").insert({
          organization_id: state.org,
          actor_kind: "oauth_callback",
          actor_user_id: state.uid,
          action: "connect",
          detail: { google_email: userinfo.email, scopes: scopesArr },
        });

        return new Response(null, {
          status: 302,
          headers: { Location: "/dashboard/settings/gmail?connected=1" },
        });
      },
    },
  },
});
