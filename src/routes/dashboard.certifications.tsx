import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/dashboard/certifications")({ component: CertsPage });

const statusStyle = (s: string) =>
  s === "active"
    ? "bg-success/15 text-success ring-success/30"
    : s === "expiring"
    ? "bg-warning/20 text-warning-foreground ring-warning/40"
    : "bg-destructive/15 text-destructive ring-destructive/30";

function CertsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["staff_certifications"],
    queryFn: async () => {
      const { data } = await supabase.from("staff_certifications").select("*").order("expiration_date");
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border p-6">
        <h2 className="text-base font-semibold">Staff certifications</h2>
        <p className="text-sm text-muted-foreground">All current and upcoming certifications across your team.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Certification</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.staff_name}</TableCell>
                <TableCell className="text-muted-foreground">{c.role}</TableCell>
                <TableCell>{c.certification}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.expiration_date ? new Date(c.expiration_date).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle(c.status)}`}>
                    {c.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
