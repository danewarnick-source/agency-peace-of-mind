/**
 * Certification labels — unified read across public.certifications and
 * public.external_certifications so callers can list every certificate on
 * file with a normalized origin label, without altering either table.
 *
 * Read-only. Purely additive.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UnifiedCertOrigin =
  | "internal_training"
  | "uploaded"
  | "manual"
  | "imported"
  | "external";

export type UnifiedCert = {
  id: string;
  source_table: "certifications" | "external_certifications";
  origin: UnifiedCertOrigin;
  organization_id: string;
  user_id: string;
  recipient_name: string | null;
  title: string | null;
  type_code: string | null;
  issued_at: string | null;
  expires_at: string | null;
  requirement_id: string | null;
  verification_code: string | null;
  file_url: string | null;
  status: string | null;
};

const inputSchema = z.object({
  orgId: z.string().uuid(),
});

export const listCertificatesUnified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => inputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [internalRes, externalRes] = await Promise.all([
      supabase
        .from("certifications")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(
          "id, organization_id, user_id, recipient_name, course_title, course_id, issued_at, expires_at, verification_code, origin, requirement_id, certification_type_code" as unknown as string,
        )
        .eq("organization_id", data.orgId),
      supabase
        .from("external_certifications")
        .select(
          "id, organization_id, user_id, cert_name, cert_type, issued_date, expires_at, status, file_url",
        )
        .eq("organization_id", data.orgId),
    ]);

    if (internalRes.error) throw new Error(internalRes.error.message);
    if (externalRes.error) throw new Error(externalRes.error.message);

    const internal: UnifiedCert[] = (
      (internalRes.data ?? []) as unknown as Array<{
        id: string;
        organization_id: string;
        user_id: string;
        recipient_name: string | null;
        course_title: string | null;
        course_id: string | null;
        issued_at: string | null;
        expires_at: string | null;
        verification_code: string | null;
        origin: string | null;
        requirement_id: string | null;
        certification_type_code: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      source_table: "certifications",
      origin: (r.origin as UnifiedCertOrigin) ?? "internal_training",
      organization_id: r.organization_id,
      user_id: r.user_id,
      recipient_name: r.recipient_name,
      title: r.course_title,
      type_code: r.certification_type_code,
      issued_at: r.issued_at,
      expires_at: r.expires_at,
      requirement_id: r.requirement_id,
      verification_code: r.verification_code,
      file_url: null,
      status: null,
    }));

    const external: UnifiedCert[] = (
      (externalRes.data ?? []) as Array<{
        id: string;
        organization_id: string;
        user_id: string;
        cert_name: string | null;
        cert_type: string;
        issued_date: string | null;
        expires_at: string | null;
        status: string;
        file_url: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      source_table: "external_certifications",
      origin: "external",
      organization_id: r.organization_id,
      user_id: r.user_id,
      recipient_name: null,
      title: r.cert_name,
      type_code: r.cert_type,
      issued_at: r.issued_date,
      expires_at: r.expires_at,
      requirement_id: null,
      verification_code: null,
      file_url: r.file_url,
      status: r.status,
    }));

    return { certificates: [...internal, ...external] };
  });
