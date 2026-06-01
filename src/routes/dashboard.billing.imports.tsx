import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/dashboard/billing/imports")({
  head: () => ({ meta: [{ title: "520 Imports — HIVE" }] }),
  component: ImportsPage,
});

/**
 * Bulk import of 520 authorizations exported from DSPD UPI / USTEPS.
 * Paste TSV/CSV with header row:
 *   consumer_pid, service_code, rate, unit_type, annual_units,
 *   monthly_max_units, service_start_date, service_end_date,
 *   sce, provider_approver_email
 */
function ImportsPage() {
  const { data: org } = useCurrentOrg();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["imports-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, medicaid_id" as any)
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; medicaid_id: string | null }>;
    },
  });

  const parse = (raw: string) => {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const sep = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(sep).map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
      return row;
    });
  };

  const onImport = async () => {
    if (!org?.organization_id) return;
    const rows = parse(text);
    if (!rows.length) return toast.error("No rows detected — include a header row.");
    const byPid = new Map<string, string>();
    for (const c of clientsQ.data ?? []) {
      if (c.medicaid_id) byPid.set(c.medicaid_id, c.id);
    }
    const payloads: Record<string, unknown>[] = [];
    const missing: string[] = [];
    for (const r of rows) {
      const pid = r.consumer_pid || r.medicaid_id || r.pid;
      const cid = pid ? byPid.get(pid) : undefined;
      if (!cid) { missing.push(pid || "(blank PID)"); continue; }
      payloads.push({
        organization_id: org.organization_id,
        client_id: cid,
        service_code: (r.service_code || "").toUpperCase(),
        unit_type: r.unit_type || "Q",
        rate_per_unit: Number(r.rate || 0),
        annual_unit_authorization: Number(r.annual_units || r.units || 0),
        monthly_max_units: r.monthly_max_units ? Number(r.monthly_max_units) : null,
        service_start_date: r.service_start_date || null,
        service_end_date: r.service_end_date || null,
        sce: r.sce || null,
        provider_approver_email: r.provider_approver_email || null,
      });
    }
    if (!payloads.length) return toast.error("No matching clients (by Medicaid ID).");
    setPending(true);
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("client_billing_codes" as any)
      .upsert(payloads, { onConflict: "organization_id,client_id,service_code" });
    setPending(false);
    if (error) return toast.error(error.message);
    toast.success(
      `Imported ${payloads.length} authorization${payloads.length === 1 ? "" : "s"}` +
        (missing.length ? ` · ${missing.length} skipped (no matching Medicaid ID)` : ""),
    );
    setText("");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Import 520 authorizations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a TSV or CSV from DSPD UPI / USTEPS. Required header columns:
        </p>
        <code className="mt-2 block overflow-x-auto rounded-md bg-muted p-2 text-xs">
          consumer_pid, service_code, rate, unit_type, annual_units, monthly_max_units, service_start_date, service_end_date, sce, provider_approver_email
        </code>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste rows here…"
          className="mt-3 font-mono text-xs"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={onImport} disabled={pending || !text.trim()}>
            <Upload className="mr-2 h-4 w-4" /> {pending ? "Importing…" : "Import authorizations"}
          </Button>
        </div>
      </section>
    </div>
  );
}
