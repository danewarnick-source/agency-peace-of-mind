import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { EmployeeLoanEditor } from "./EmployeeLoanEditor";
import { listEmployeeLoans } from "@/lib/employee-loans.functions";

type StaffOption = { id: string; first_name: string | null; last_name: string | null; email: string | null };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-foreground",
  sent_for_signature: "bg-amber-500 text-white",
  signed: "bg-emerald-600 text-white",
  active: "bg-emerald-600 text-white",
  void: "bg-rose-600 text-white",
  closed: "bg-slate-600 text-white",
};

export function EmployeeLoansPanel({ organizationId, lenderName }: { organizationId: string; lenderName: string }) {
  const fetchList = useServerFn(listEmployeeLoans);
  const [editing, setEditing] = useState<{ loanId?: string; staffId: string; borrower: string; borrowerEmail: string | null } | null>(null);
  const [newStaffId, setNewStaffId] = useState<string>("");
  const [search, setSearch] = useState("");

  const loans = useQuery({
    queryKey: ["employee-loans", organizationId],
    queryFn: () => fetchList({ data: { organization_id: organizationId } }),
  });

  const staff = useQuery({
    queryKey: ["employee-loans-staff", organizationId],
    queryFn: async (): Promise<StaffOption[]> => {
      const { data: members, error: mErr } = await (supabase as any)
        .from("organization_members")
        .select("user_id, active")
        .eq("organization_id", organizationId)
        .eq("active", true);
      if (mErr) throw new Error(mErr.message);
      const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (!ids.length) return [];
      const { data: profiles, error: pErr } = await (supabase as any)
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids)
        .order("last_name");
      if (pErr) throw new Error(pErr.message);
      return (profiles ?? []) as StaffOption[];
    },
  });

  const staffLabel = useMemo(() => {
    const map = new Map<string, string>();
    (staff.data ?? []).forEach((s) => map.set(s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || s.id));
    return map;
  }, [staff.data]);

  const filteredStaff = useMemo(() => {
    const list = staff.data ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((p) => `${p.first_name ?? ""} ${p.last_name ?? ""} ${p.email ?? ""}`.toLowerCase().includes(s));
  }, [staff.data, search]);

  if (editing) {
    return (
      <EmployeeLoanEditor
        organizationId={organizationId}
        staffId={editing.staffId}
        loanId={editing.loanId}
        defaultBorrower={editing.borrower}
        defaultBorrowerEmail={editing.borrowerEmail}
        defaultLender={lenderName}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Employee Loan Ledger</h2>
        <p className="text-sm text-muted-foreground">
          Admin-only recordkeeping and e-signature for loan agreements between the organization and staff.
          Staff receive the agreement by email and sign electronically — the signed record is captured
          under the U.S. E-SIGN Act (name, IP, timestamp, and immutable agreement text).
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Start a new loan agreement</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            className="w-56"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={newStaffId} onValueChange={setNewStaffId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Select employee…" /></SelectTrigger>
            <SelectContent>
              {filteredStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {(s.first_name ?? "") + " " + (s.last_name ?? "")} {s.email ? `— ${s.email}` : ""}
                </SelectItem>
              ))}
              {filteredStaff.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>
              )}
            </SelectContent>
          </Select>
          <Button
            disabled={!newStaffId}
            onClick={() => {
              const s = (staff.data ?? []).find((x) => x.id === newStaffId);
              if (!s) return;
              const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || "";
              setEditing({ staffId: s.id, borrower: name, borrowerEmail: s.email ?? null });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New loan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Agreements on file</CardTitle></CardHeader>
        <CardContent>
          {loans.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Borrower (on agreement)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(loans.data ?? []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{staffLabel.get(l.staff_id) ?? l.staff_id}</TableCell>
                    <TableCell>{l.borrower_name}</TableCell>
                    <TableCell>{l.agreement_date}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[l.status] ?? "bg-muted text-foreground"}>
                        {String(l.status).replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            loanId: l.id,
                            staffId: l.staff_id,
                            borrower: l.borrower_name,
                            borrowerEmail: l.borrower_email ?? null,
                          })
                        }
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!(loans.data ?? []).length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No agreements on file yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
