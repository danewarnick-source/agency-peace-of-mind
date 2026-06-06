import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { LoanFeatureGate } from "@/components/loans/loan-feature-gate";
import { LoanEditor } from "@/components/loans/loan-editor";
import { listOrgLoans } from "@/lib/client-loans.functions";

export const Route = createFileRoute("/dashboard/client-loans")({
  head: () => ({ meta: [{ title: "Client Loan Ledger — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "super_admin"]}>
      <ClientLoansPage />
    </RequireRole>
  ),
});

function ClientLoansPage() {
  const { data: org } = useCurrentOrg();
  if (!org?.organization_id) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Client Loan Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only recordkeeping. Document and track client loan agreements kept on file. Not visible to staff.
        </p>
      </header>
      <LoanFeatureGate organizationId={org.organization_id}>
        <LoanArea organizationId={org.organization_id} lenderName={org.organization_name ?? "Provider"} />
      </LoanFeatureGate>
    </div>
  );
}

function LoanArea({ organizationId, lenderName }: { organizationId: string; lenderName: string }) {
  const fetchList = useServerFn(listOrgLoans);
  const [editing, setEditing] = useState<{ loanId?: string; clientId: string; borrower: string } | null>(null);
  const [newClientId, setNewClientId] = useState<string>("");

  const loans = useQuery({
    queryKey: ["loans", organizationId],
    queryFn: () => fetchList({ data: { organization_id: organizationId } }),
  });

  // Admin can pick from all org clients
  const clients = useQuery({
    queryKey: ["loans-clients", organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", organizationId)
        .order("last_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const clientLabel = useMemo(() => {
    const map = new Map<string, string>();
    (clients.data ?? []).forEach((c: any) => map.set(c.id, `${c.first_name} ${c.last_name}`));
    return map;
  }, [clients.data]);

  if (editing) {
    return (
      <LoanEditor
        organizationId={organizationId}
        clientId={editing.clientId}
        loanId={editing.loanId}
        defaultBorrower={editing.borrower}
        defaultLender={lenderName}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Create a loan for a client</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={newClientId} onValueChange={setNewClientId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Select client…" /></SelectTrigger>
            <SelectContent>
              {(clients.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!newClientId}
            onClick={() => {
              const c = (clients.data ?? []).find((x: any) => x.id === newClientId);
              if (!c) return;
              setEditing({ clientId: c.id, borrower: `${c.first_name} ${c.last_name}` });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New loan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Existing loans</CardTitle></CardHeader>
        <CardContent>
          {loans.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Borrower (on agreement)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(loans.data ?? []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{clientLabel.get(l.client_id) ?? l.client_id}</TableCell>
                    <TableCell>{l.borrower_name}</TableCell>
                    <TableCell>{l.agreement_date}</TableCell>
                    <TableCell className="capitalize">{l.status}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing({ loanId: l.id, clientId: l.client_id, borrower: l.borrower_name })}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!(loans.data ?? []).length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No loans yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
