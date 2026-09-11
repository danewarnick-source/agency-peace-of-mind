import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, FileDown, Loader2, Printer, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  listOrgClientFileMatrix,
  listOrgClientFilePack,
  type ClientFileMatrixRow,
} from "@/lib/client-file.functions";
import { missingClientFileCsv } from "@/lib/client-file";
import { personnelPackHtml } from "@/lib/staff-obligation-files";

async function signedEvidenceUrl(
  bucket: "client-documents" | "client-photos",
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open file");
  return data.signedUrl;
}

export function OrgClientFileMatrix({
  organizationId,
  hiddenCardKeys = [],
}: {
  organizationId: string;
  hiddenCardKeys?: string[];
}) {
  const navigate = useNavigate();
  const listFn = useServerFn(listOrgClientFileMatrix);
  const packFn = useServerFn(listOrgClientFilePack);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packBusy, setPackBusy] = useState(false);

  const q = useQuery({
    queryKey: ["org-client-file", organizationId],
    enabled: !!organizationId,
    queryFn: () => listFn({ data: { organizationId } }),
  });

  const rows = useMemo(() => {
    const hideHousemate = hiddenCardKeys.includes("housemate");
    const all = (q.data ?? []).map((r) => {
      if (!hideHousemate) return r;
      const missing_items = r.missing_items.filter((i) => !/housemate/i.test(i.title));
      const removed = r.missing_items.length - missing_items.length;
      if (!removed) return r;
      return { ...r, missing_items, missing: Math.max(0, r.missing - removed) };
    });
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((r) => {
      const codes = r.service_codes.join(" ").toLowerCase();
      return r.full_name.toLowerCase().includes(term) || codes.includes(term);
    });
  }, [q.data, search, hiddenCardKeys]);

  const selectedRows = rows.filter((r) => selected.has(r.client_id));
  const exportRows = selectedRows.length ? selectedRows : rows;

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(rows.map((r) => r.client_id)) : new Set());
  };

  const practiceAudit = () => {
    const ids = selectedRows.length ? selectedRows.map((r) => r.client_id) : [];
    void navigate({
      to: "/dashboard/internal-audit",
      search: {
        ...(ids.length ? { clientIds: ids.join(",") } : {}),
        area: "documentation",
      },
    });
  };

  const exportMissing = () => {
    const missing = exportRows.filter((r) => r.missing > 0);
    if (!missing.length) {
      toast.error("No missing items in the current selection.");
      return;
    }
    const csv = missingClientFileCsv(missing);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `client-file-missing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Missing-item CSV downloaded");
  };

  const exportPack = async () => {
    if (!selectedRows.length) {
      toast.error("Select clients to export a pack.");
      return;
    }
    setPackBusy(true);
    try {
      const items = await packFn({
        data: {
          organizationId,
          clientIds: selectedRows.map((r) => r.client_id),
        },
      });
      if (!items.length) {
        toast.error("Selected clients have no files on record.");
        return;
      }
      const files = await Promise.all(
        items.map(async (item) => ({
          staffName: item.client_name,
          title: item.title,
          filename: item.filename,
          url: await signedEvidenceUrl(item.bucket, item.path),
        })),
      );
      const win = window.open("", "_blank");
      if (!win) throw new Error("Pop-up blocked — allow pop-ups to print the pack.");
      win.document.write(personnelPackHtml(files));
      win.document.close();
      win.focus();
      win.print();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the print pack");
    } finally {
      setPackBusy(false);
    }
  };

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading client file…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-6 text-sm text-rose-700">
        {q.error instanceof Error ? q.error.message : "Could not load the client file."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:max-w-xs md:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients or codes…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={practiceAudit}>
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
            Practice audit
          </Button>
          <Button variant="outline" size="sm" onClick={exportMissing}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export missing CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPack()} disabled={packBusy}>
            {packBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export pack for selected
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {rows.length} of {q.data?.length ?? 0}. Practice audit opens Internal Audit
        {selectedRows.length ? ` for ${selectedRows.length} selected` : " for the org"}. Missing CSV
        uses the current selection, or everyone visible if none are selected.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {q.data?.length === 0
            ? "No clients in this organization yet."
            : "No clients match the current search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <Checkbox
                    checked={rows.length > 0 && selectedRows.length === rows.length}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all clients"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-left font-medium">Codes</th>
                <th className="px-3 py-2 text-left font-medium">Missing</th>
                <th className="px-3 py-2 text-left font-medium">Due soon</th>
                <th className="px-3 py-2 text-left font-medium">On file</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <MatrixRow
                  key={r.client_id}
                  row={r}
                  checked={selected.has(r.client_id)}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MatrixRow({
  row,
  checked,
  onToggle,
}: {
  row: ClientFileMatrixRow;
  checked: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const navigate = useNavigate();
  const codes = row.service_codes.slice(0, 6);
  const extra = row.service_codes.length - codes.length;
  return (
    <tr
      className="cursor-pointer border-t border-border hover:bg-muted/30"
      onClick={() =>
        void navigate({
          to: "/dashboard/clients/$clientId",
          params: { clientId: row.client_id },
          search: { tab: "client-file" },
        })
      }
    >
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggle(row.client_id, !!v)}
          aria-label={`Select ${row.full_name}`}
        />
      </td>
      <td className="px-3 py-2">
        <Link
          to="/dashboard/clients/$clientId"
          params={{ clientId: row.client_id }}
          search={{ tab: "client-file" }}
          className="font-medium text-[var(--hive-ink)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.full_name}
        </Link>
        {!row.active && <span className="ml-2 text-[11px] text-muted-foreground">Deactivated</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {codes.map((c) => (
            <Badge key={c} variant="secondary" className="font-mono text-[10px]">
              {c}
            </Badge>
          ))}
          {extra > 0 && <span className="text-[11px] text-muted-foreground">+{extra}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusCount count={row.missing} tone="missing" />
      </td>
      <td className="px-3 py-2">
        <StatusCount count={row.due_soon} tone="due_soon" />
      </td>
      <td className="px-3 py-2">
        <StatusCount count={row.on_file} tone="on_file" />
      </td>
    </tr>
  );
}

function StatusCount({ count, tone }: { count: number; tone: "missing" | "due_soon" | "on_file" }) {
  const cls =
    tone === "on_file"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "due_soon"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : count > 0
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {count}
    </span>
  );
}
