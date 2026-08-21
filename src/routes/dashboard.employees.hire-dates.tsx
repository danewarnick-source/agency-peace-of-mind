import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Loader2, Save } from "lucide-react";

import { RequirePermission } from "@/components/rbac-guard";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  listStaffHireDates,
  bulkSetStaffHireDates,
  type StaffHireDateRow,
} from "@/lib/employees.functions";

export const Route = createFileRoute("/dashboard/employees/hire-dates")({
  head: () => ({
    meta: [
      { title: "Set staff hire dates — HIVE" },
      {
        name: "description",
        content: "Review and bulk-update staff hire dates so compliance due dates calculate correctly.",
      },
      { property: "og:title", content: "Set staff hire dates — HIVE" },
      {
        property: "og:description",
        content: "Review and bulk-update staff hire dates so compliance due dates calculate correctly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequirePermission perm="view_staff_records">
      <HireDatesPage />
    </RequirePermission>
  ),
});

function HireDatesPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const listFn = useServerFn(listStaffHireDates);
  const saveFn = useServerFn(bulkSetStaffHireDates);

  const [onlyMissing, setOnlyMissing] = useState(true);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["staff-hire-dates", org?.organization_id],
    queryFn: () => listFn({ data: { organizationId: org!.organization_id } }) as Promise<StaffHireDateRow[]>,
  });

  const missingCount = (rows ?? []).filter((r) => !r.hireDate).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (onlyMissing && r.hireDate) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q);
    });
  }, [rows, onlyMissing, search]);

  const pending = Object.entries(drafts).filter(([userId, value]) => {
    if (!value) return false;
    const row = (rows ?? []).find((r) => r.userId === userId);
    return row ? row.hireDate !== value : false;
  });

  const save = useMutation({
    mutationFn: async () => {
      return saveFn({
        data: {
          organizationId: org!.organization_id,
          updates: pending.map(([userId, hireDate]) => ({ userId, hireDate })),
        },
      });
    },
    onSuccess: (res) => {
      const n = (res as { updated: number }).updated;
      toast.success(`${n} hire date${n === 1 ? "" : "s"} saved`);
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["staff-hire-dates"] });
      qc.invalidateQueries({ queryKey: ["company-obligations"] });
      qc.invalidateQueries({ queryKey: ["obligation-instances"] });
      qc.invalidateQueries({ queryKey: ["obligation-missing-hire-dates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save hire dates"),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/dashboard/company-obligations">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Compliance
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Set staff hire dates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All compliance due dates are calculated from a staff member's hire date. Update as many as you
            like, then save them all at once.
          </p>
        </div>
        <Button
          className="min-h-11"
          disabled={!pending.length || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save all{pending.length ? ` (${pending.length})` : ""}
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          placeholder="Search staff…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch id="only-missing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
          <Label htmlFor="only-missing" className="text-sm">
            Missing hire date only
          </Label>
          <Badge variant={missingCount ? "destructive" : "secondary"}>{missingCount} missing</Badge>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Staff member</th>
              <th className="hidden px-4 py-3 md:table-cell">Role</th>
              <th className="px-4 py-3">Hire date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Loading staff…
                </td>
              </tr>
            )}
            {!isLoading && !visible.length && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  {onlyMissing ? "Every staff member has a hire date on file." : "No staff found."}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const value = drafts[r.userId] ?? r.hireDate ?? "";
              const changed = !!drafts[r.userId] && drafts[r.userId] !== (r.hireDate ?? "");
              return (
                <tr key={r.userId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                  </td>
                  <td className="hidden px-4 py-3 capitalize text-muted-foreground md:table-cell">
                    {r.role.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        className="min-h-11 w-[170px]"
                        value={value}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.userId]: e.target.value }))
                        }
                      />
                      {!r.hireDate && !changed && (
                        <Badge variant="destructive" className="whitespace-nowrap">
                          Missing
                        </Badge>
                      )}
                      {changed && (
                        <Badge variant="secondary" className="whitespace-nowrap">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
