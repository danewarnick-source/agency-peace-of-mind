
/* ======================================================================
 * Staff Shifts panel — read-only evv_timesheets scoped to this staff.
 * Mirrors the EVV archive query shape; no new storage, no billing math.
 * ====================================================================*/
function StaffShiftsPanel({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["staff-profile-shifts", organizationId, staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, billed_units")
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r) => r.client_id).filter(Boolean))) as string[];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .in("id", ids);
        for (const c of cs ?? []) {
          nameById.set(c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—");
        }
      }
      return (data ?? []).map((r) => ({ ...r, client_name: nameById.get(r.client_id) ?? "—" }));
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent shifts (last 200)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No shifts recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.clock_in_timestamp ? new Date(r.clock_in_timestamp).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.client_id ? (
                        <Link
                          to="/dashboard/clients/$clientId"
                          params={{ clientId: r.client_id }}
                          className="hover:underline"
                        >
                          {r.client_name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2"><code className="font-mono text-xs">{r.service_type_code ?? "—"}</code></td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.status ?? "—"}</Badge></td>
                    <td className="px-3 py-2 text-right">{r.billed_units ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Staff HR documents — read-only list. Storage URLs not surfaced here;
 * keeps PII access flow gated through the existing HR checklist card.
 * ====================================================================*/
function StaffHrDocsPanel({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["staff-profile-hrdocs", organizationId, staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documents")
        .select("id, document_kind, file_name, created_at, size_bytes")
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">HR documents on file</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/employees">Manage in HR checklist →</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No HR documents on file.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">File name</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th className="px-3 py-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2"><Badge variant="outline">{r.document_kind ?? "—"}</Badge></td>
                    <td className="px-3 py-2">{r.file_name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {r.size_bytes != null ? `${Math.round(Number(r.size_bytes) / 1024)} KB` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
