// Shared helpers used by every client-tool report generator
// (budget, meal menu, plan-vs-actual, chore chart). Keeps org-logo fetch,
// org name lookup, and org membership types in one place.
//
// PDFs never fabricate — empty fields render as "—".

import type { SupabaseClient } from "@supabase/supabase-js";

export type LogoBytes = { bytes: Uint8Array; mime: string };

export async function fetchOrgLogo(
  sb: SupabaseClient,
  organizationId: string,
): Promise<LogoBytes | null> {
  try {
    const { data } = await sb
      .from("organization_branding")
      .select("logo_path")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const path = (data as { logo_path: string | null } | null)?.logo_path;
    if (!path) return null;
    const { data: signed } = await sb.storage
      .from("org-branding")
      .createSignedUrl(path, 60 * 10);
    if (!signed?.signedUrl) return null;
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) return null;
    const mime =
      resp.headers.get("content-type") ||
      (path.endsWith(".png") ? "image/png" : "image/jpeg");
    return { bytes: new Uint8Array(await resp.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

export async function fetchOrgName(
  sb: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data } = await sb
    .from("organizations")
    .select("organization_name")
    .eq("id", organizationId)
    .maybeSingle();
  return (data as { organization_name: string | null } | null)?.organization_name ?? "";
}

export async function fetchClientIdentity(
  sb: SupabaseClient,
  clientId: string,
): Promise<{ clientName: string; organizationId: string }> {
  const { data, error } = await sb
    .from("clients")
    .select("first_name, last_name, organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  const c = data as
    | { first_name: string | null; last_name: string | null; organization_id: string }
    | null;
  if (!c) throw new Error("Client not found");
  return {
    clientName:
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client",
    organizationId: c.organization_id,
  };
}
