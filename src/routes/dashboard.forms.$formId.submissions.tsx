import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { getForm, listSubmissions } from "@/lib/forms.functions";
import type { FormField } from "@/lib/forms-utils";

export const Route = createFileRoute("/dashboard/forms/$formId/submissions")({
  head: () => ({ meta: [{ title: "Submissions — HIVE" }] }),
  component: SubmissionsView,
});

type SubRow = { id: string; submitted_by: string | null; submitted_at: string; period_key: string | null; answers: Record<string, unknown> };

function SubmissionsView() {
  const { formId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const fetchForm = useServerFn(getForm);
  const fetchSubs = useServerFn(listSubmissions);
  const { data: f } = useQuery({ queryKey: ["form-edit", formId], queryFn: () => fetchForm({ data: { formId } }) });
  const { data: s } = useQuery({ queryKey: ["form-subs", formId], queryFn: () => fetchSubs({ data: { formId } }) });

  const fields = useMemo<FormField[]>(() => {
    const arr = (f?.form?.fields ?? []) as FormField[];
    return arr.filter((x) => x.type !== "section");
  }, [f]);
  const profilesById = useMemo(() => Object.fromEntries((s?.profiles ?? []).map((p) => [p.id, p])), [s]);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const all = s?.submissions ?? [];
    return (all as SubRow[]).filter((r) => {
      if (from && new Date(r.submitted_at) < new Date(from)) return false;
      if (to && new Date(r.submitted_at) > new Date(to + "T23:59:59")) return false;
      if (q.trim()) {
        const name = profilesById[r.submitted_by ?? ""]?.full_name ?? "";
        const email = profilesById[r.submitted_by ?? ""]?.email ?? "";
        const blob = `${name} ${email} ${JSON.stringify(r.answers)}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [s, q, from, to, profilesById]);

  function exportCsv() {
    const headers = ["User", "Email", "Submitted at", "Period", ...fields.map((x) => x.label)];
    const escape = (v: unknown) => {
      const s = typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [headers.map(escape).join(",")];
    for (const r of rows) {
      const p = profilesById[r.submitted_by ?? ""];
      const ans = r.answers ?? {};
      lines.push([
        p?.full_name ?? "Anonymous",
        p?.email ?? "",
        new Date(r.submitted_at).toISOString(),
        r.period_key ?? "",
        ...fields.map((x) => ans[x.id]),
      ].map(escape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(f?.form?.name ?? "form").replace(/\W+/g, "-")}-submissions.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => window.history.length > 1 ? router.history.back() : navigate({ to: "/dashboard/forms" })}><ChevronLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{f?.form?.name ?? "Submissions"}</h1>
            <p className="text-xs text-muted-foreground">{rows.length} of {(s?.submissions ?? []).length} submissions</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
          <Button onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Submitted</th>
              <th className="text-left px-3 py-2 font-medium">Period</th>
              {fields.map((x) => <th key={x.id} className="text-left px-3 py-2 font-medium">{x.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r: SubRow) => {
              const p = profilesById[r.submitted_by ?? ""];
              const ans = (r.answers ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{p?.full_name ?? <span className="italic text-muted-foreground">Anonymous</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.period_key ?? "—"}</td>
                  {fields.map((x) => <td key={x.id} className="px-3 py-2 align-top max-w-[260px]">{renderCell(ans[x.id])}</td>)}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3 + fields.length} className="px-3 py-8 text-center text-sm text-muted-foreground">No submissions match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.dataUrl === "string") return <a href={o.dataUrl} target="_blank" rel="noreferrer" className="text-[#137182] underline">{(o.name as string) ?? "file"}</a>;
    if (typeof o.lat === "number" && typeof o.lng === "number") return `${(o.lat as number).toFixed(5)}, ${(o.lng as number).toFixed(5)}`;
    return <code className="text-xs">{JSON.stringify(v)}</code>;
  }
  return String(v);
}
