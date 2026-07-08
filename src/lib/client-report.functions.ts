// NECTAR / assistant-callable server function that pulls any registered
// client-document report (Client Budget, Meal Plan Weekly Menu, Meal Plan
// vs. Actual, Chore Chart) as a PDF, and optionally ships a point-in-time
// snapshot to the client file(s).
//
// One shared surface for every report type — the individual PDF generators
// under src/lib/*-report.ts are the single source of truth for both the
// manual "Preview / Download / Ship to file" buttons AND this NECTAR path.
// Nothing here duplicates PDF layout or data fetching.
//
// Access: manager+ (org-scoped). The server function verifies the caller
// belongs to the target organization at manager tier before generating.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REPORT_META,
  REPORT_TYPES,
  generateClientReport,
  shipClientReport,
  type ReportType,
} from "@/lib/client-report-registry";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface PullClientReportInput {
  reportType: ReportType;
  /** Any recognized param — the target generator ignores the rest. */
  params: {
    clientId?: string;
    spaceId?: string;
    staffId?: string;
    periodMonth?: string;
    weekStart?: string; // ISO date
    weeksCount?: number;
  };
  /** When true, ship a point-in-time snapshot to client_documents (or
   *  employee_documents for staff-scoped reports) in addition to
   *  returning the bytes. Defaults to false (preview only). */
  ship?: boolean;
}

export interface PullClientReportOutput {
  reportType: ReportType;
  reportLabel: string;
  filename: string;
  mimeType: "application/pdf";
  /** Base64-encoded PDF bytes so this crosses the fn boundary cleanly. */
  pdfBase64: string;
  periodLabel: string;
  organizationId: string;
  orgName: string;
  clientId: string | null;
  clientName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  attachClientIds: string[];
  snapshots: Array<{ clientId: string; documentId: string; storagePath: string }>;
  shipped: boolean;
}

// ── List available report types (metadata for NECTAR / UI menus) ────────────

export const listClientReportTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return REPORT_TYPES.map((k) => REPORT_META[k]);
  });

// ── Pull a single report ────────────────────────────────────────────────────

function validate(input: unknown): PullClientReportInput {
  const i = (input ?? {}) as Partial<PullClientReportInput>;
  const rt = i.reportType;
  if (!rt || !REPORT_TYPES.includes(rt)) {
    throw new Error(`Unknown reportType: ${String(rt)}`);
  }
  const p = (i.params ?? {}) as PullClientReportInput["params"];
  if (p.clientId && !UUID_RE.test(p.clientId)) throw new Error("Invalid clientId");
  if (p.spaceId && !UUID_RE.test(p.spaceId)) throw new Error("Invalid spaceId");
  if (p.weeksCount !== undefined) {
    const n = Number(p.weeksCount);
    if (!Number.isFinite(n) || n < 1 || n > 12) throw new Error("weeksCount must be 1..12");
  }
  return { reportType: rt, params: p, ship: !!i.ship };
}

/** Resolve the org that scopes the request from the target report params. */
async function resolveScopeOrg(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  input: PullClientReportInput,
): Promise<string> {
  const { clientId, spaceId } = input.params;
  if (clientId) {
    const { data, error } = await supabase
      .from("clients")
      .select("organization_id")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw error;
    const orgId = (data as { organization_id: string } | null)?.organization_id;
    if (!orgId) throw new Error("Client not found or not accessible");
    return orgId;
  }
  if (spaceId) {
    const { data, error } = await supabase
      .from("chore_spaces")
      .select("organization_id")
      .eq("id", spaceId)
      .maybeSingle();
    if (error) throw error;
    const orgId = (data as { organization_id: string } | null)?.organization_id;
    if (!orgId) throw new Error("Chore space not found or not accessible");
    return orgId;
  }
  throw new Error("Report requires either clientId or spaceId");
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid stack overflow on very large PDFs.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in the Worker runtime.
  return btoa(binary);
}

export const pullClientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<PullClientReportOutput> => {
    const { supabase, userId } = context;

    // Authorization: caller must be a manager+ in the org that owns the
    // target client or chore space. PHI-seam: no cross-org access.
    const orgId = await resolveScopeOrg(supabase, data);
    const { requireOrgMembership } = await import("@/integrations/supabase/require-org");
    await requireOrgMembership(supabase, userId, orgId, "manager");

    // Reuse each tool's existing generator — pass the request's authenticated
    // Supabase client so RLS applies as the caller.
    const out = data.ship
      ? await shipClientReport(data.reportType, {
          ...data.params,
          supabaseClient: supabase,
        })
      : await generateClientReport(data.reportType, {
          ...data.params,
          supabaseClient: supabase,
        });

    return {
      reportType: data.reportType,
      reportLabel: REPORT_META[data.reportType].label,
      filename: out.filename,
      mimeType: "application/pdf",
      pdfBase64: bytesToBase64(out.bytes),
      periodLabel: out.periodLabel,
      organizationId: out.organizationId,
      orgName: out.orgName,
      clientId: out.clientId,
      clientName: out.clientName,
      spaceId: out.spaceId,
      spaceName: out.spaceName,
      attachClientIds: out.attachClientIds,
      snapshots: "snapshots" in out ? (out.snapshots as PullClientReportOutput["snapshots"]) : [],
      shipped: !!data.ship,
    };
  });
