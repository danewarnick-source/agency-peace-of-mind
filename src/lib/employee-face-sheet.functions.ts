/**
 * Server function facade for the Employee Face Sheet. UI callable path
 * mirroring `generateClientFaceSheet`. Preview / Download / Print all use
 * the `ship=false` path; the Ship-to-file menu item uses `ship=true`.
 *
 * All work happens under `requireSupabaseAuth`, so RLS enforces org scope
 * — a manager can only generate face sheets for their own employees.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateEmployeeFaceSheet,
  shipEmployeeFaceSheet,
} from "@/lib/employee-face-sheet";

const Input = z.object({
  staffId: z.string().uuid(),
  organizationId: z.string().uuid(),
  ship: z.boolean().optional(),
});

export type EmployeeFaceSheetFnOutput = {
  pdfBase64: string;
  filename: string;
  shipped:
    | {
        documentId: string;
        storagePath: string;
      }
    | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const generateEmployeeFaceSheetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<EmployeeFaceSheetFnOutput> => {
    const { supabase } = context;
    if (data.ship) {
      const r = await shipEmployeeFaceSheet({
        staffId: data.staffId,
        organizationId: data.organizationId,
        supabaseClient: supabase,
      });
      return {
        pdfBase64: bytesToBase64(r.bytes),
        filename: r.filename,
        shipped: { documentId: r.documentId, storagePath: r.storagePath },
      };
    }
    const r = await generateEmployeeFaceSheet({
      staffId: data.staffId,
      organizationId: data.organizationId,
      supabaseClient: supabase,
    });
    return {
      pdfBase64: bytesToBase64(r.bytes),
      filename: r.filename,
      shipped: null,
    };
  });
