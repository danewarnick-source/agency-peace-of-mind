import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ASK_ADMIN_MANUAL,
  inviteFailureMessage,
  isValidExistingJoinPassword,
  isValidJoinPassword,
  isValidJoinUsername,
  joinSetsAuthPassword,
  type InviteFailureReason,
} from "@/lib/join-invite";

const TokenInput = z.object({
  token: z.string().trim().min(1).max(200),
});

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  organization_id: string;
};

export type InvitePreviewOk = {
  ok: true;
  email: string;
  role: string;
  org_name: string;
  expires_at: string;
  needs_name: boolean;
  has_username: boolean;
  account_exists: boolean;
};

export type InvitePreviewErr = {
  ok: false;
  reason: InviteFailureReason;
  message: string;
};

export type InvitePreview = InvitePreviewOk | InvitePreviewErr;

function fail(reason: InviteFailureReason): InvitePreviewErr {
  return { ok: false, reason, message: inviteFailureMessage(reason) };
}

type LoadedInvite = { ok: true; invite: InviteRow; orgName: string };

async function loadInvite(token: string): Promise<LoadedInvite | InvitePreviewErr> {
  const { data: invite, error } = await supabaseAdmin
    .from("invitations")
    .select("id, email, role, status, expires_at, organization_id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invite) return fail("not_found");

  const row = invite as InviteRow;
  if (row.status === "accepted") return fail("used");
  if (row.status === "revoked") return fail("revoked");
  if (row.status !== "pending") return fail("used");
  if (new Date(row.expires_at).getTime() < Date.now()) return fail("expired");

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", row.organization_id)
    .maybeSingle();
  const orgName = String(org?.name || "").trim() || "your organization";
  return { ok: true, invite: row, orgName };
}

async function loadProfileByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, username, email")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    full_name: string | null;
    username: string | null;
    email: string | null;
  } | null;
}

export const previewInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenInput.parse(d))
  .handler(async ({ data }): Promise<InvitePreview> => {
    const loaded = await loadInvite(data.token);
    if (!loaded.ok) return loaded;

    const { invite, orgName } = loaded;
    const profile = await loadProfileByEmail(invite.email);
    return {
      ok: true,
      email: invite.email,
      role: invite.role,
      org_name: orgName,
      expires_at: invite.expires_at,
      needs_name: !String(profile?.full_name || "").trim(),
      has_username: !!String(profile?.username || "").trim(),
      account_exists: !!profile,
    };
  });

const PrepareInput = z.object({
  token: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  username: z.string().trim().max(32).optional().or(z.literal("")),
  full_name: z.string().trim().max(120).optional().or(z.literal("")),
});

export const prepareInviteAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PrepareInput.parse(d))
  .handler(async ({ data }) => {
    const loaded = await loadInvite(data.token);
    if (!loaded.ok) {
      throw new Error(loaded.message);
    }
    const { invite, orgName } = loaded;
    const email = invite.email.trim().toLowerCase();
    const existing = await loadProfileByEmail(email);

    if (joinSetsAuthPassword(!!existing)) {
      if (!isValidJoinPassword(data.password)) {
        throw new Error("Password must be at least 8 characters and include a number.");
      }
    } else if (!isValidExistingJoinPassword(data.password)) {
      throw new Error("Enter the password you already use to sign in.");
    }

    const usernameRaw = String(data.username || "").trim();
    const fullNameRaw = String(data.full_name || "").trim();

    if (!existing || !String(existing.username || "").trim()) {
      if (!isValidJoinUsername(usernameRaw)) {
        throw new Error(
          "Username must start with a letter and be 3–32 letters, numbers, or underscores.",
        );
      }
    }
    const username = usernameRaw || String(existing?.username || "").trim();

    if (username) {
      const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (taken && taken.id !== existing?.id) {
        throw new Error("That username is already taken. Choose a different one.");
      }
    }

    const fullName = fullNameRaw || String(existing?.full_name || "").trim() || email.split("@")[0];
    const space = fullName.indexOf(" ");
    const firstName = space > 0 ? fullName.slice(0, space).trim() : fullName;
    const lastName = space > 0 ? fullName.slice(space + 1).trim() : "";

    let userId = existing?.id ?? "";

    if (!existing) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          username,
          created_via: "invitation",
        },
      });
      if (createErr || !created.user) {
        const msg = createErr?.message || "Could not create the account.";
        if (/already/i.test(msg)) {
          throw new Error(
            `An account with this email already exists. Sign in from the join page, or ${ASK_ADMIN_MANUAL.toLowerCase()}`,
          );
        }
        throw new Error(msg);
      }
      userId = created.user.id;

      // handle_new_user() may still create a personal workspace until the
      // skip-on-invitation SQL is applied. Same cleanup as Add manually.
      await supabaseAdmin
        .from("organization_members")
        .update({ active: false })
        .eq("user_id", userId)
        .neq("organization_id", invite.organization_id);
    } else {
      // Existing login: verify the password they already use. Never overwrite it.
      const { data: verified, error: pwErr } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (pwErr || !verified?.user) {
        throw new Error(
          "That password doesn't match this account. Use the password you already sign in with, or tap Forgot on the login page.",
        );
      }
      if (verified.session?.access_token) {
        await supabaseAdmin.auth.admin.signOut(verified.session.access_token).catch(() => {});
      }
    }

    const profilePatch: Record<string, unknown> = {
      id: userId,
      email,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName || null,
      username: username || null,
      is_active: true,
    };
    if (joinSetsAuthPassword(!!existing)) {
      profilePatch.must_change_password = false;
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePatch as never, { onConflict: "id" });
    if (profErr) throw new Error(profErr.message);

    return {
      ok: true as const,
      email,
      role: invite.role,
      org_name: orgName,
    };
  });
