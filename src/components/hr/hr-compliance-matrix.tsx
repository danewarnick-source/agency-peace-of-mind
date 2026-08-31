import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHrComplianceMatrix, type HrMatrix, type HrMatrixStaff } from "@/lib/hr-staff.functions";

type GroupMode = "manager" | "house" | "flat";

function formatHireDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Org-wide staff roster (formerly the HR Compliance Matrix). Compliance
 * status now lives entirely in Company Obligations — this view is just
 * "who's on staff and when they were hired," with a link out per staffer
 * to their obligations.
 */
export function HrComplianceMatrix({
  organizationId,
}: {
  organizationId: string;
}) {
  const fetchMatrix = useServerFn(getHrComplianceMatrix);
  const [group, setGroup] = useState<GroupMode>("manager");

  const q = useQuery({
    queryKey: ["hr-matrix", organizationId],
    queryFn: () => fetchMatrix({ data: { organization_id: organizationId } }),
  });

  const bands = useMemo(() => {
    const data = q.data;
    if (!data) return [] as Array<{ key: string; label: string; staff: HrMatrixStaff[] }>;
    if (group === "flat") {
      return [{ key: "all", label: "All staff", staff: data.staff }];
    }
    const map = new Map<string, { label: string; staff: HrMatrixStaff[] }>();
    for (const s of data.staff) {
      let key: string;
      let label: string;
      if (group === "manager") {
        if (!s.team_id) {
          key = "__unassigned__";
          label = "Unassigned";
        } else {
          key = `t:${s.team_id}`;
          const mgr = s.manager_name ?? "No manager assigned";
          label = `${mgr} — ${s.team_name ?? "Team"}`;
        }
      } else {
        // house = team
        key = s.team_id ?? "__unassigned__";
        label = s.team_id ? (s.team_name ?? "Team") : "Unassigned";
      }
      if (!map.has(key)) map.set(key, { label, staff: [] });
      map.get(key)!.staff.push(s);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [q.data, group]);

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading staff roster…
        </CardContent>
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }
  const data = q.data as HrMatrix;
  if (data.staff.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No staff visible in your HR scope.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Staff Roster</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Compliance status now lives in Company Obligations — use the link per staffer to review it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={group} onValueChange={(v) => setGroup(v as GroupMode)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="house">House / Team</SelectItem>
              <SelectItem value="flat">All staff flat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background border-b border-r border-border px-3 py-2 text-left font-medium">
                  Staff
                </th>
                <th className="border-b border-border px-3 py-2 text-left font-medium">Hire date</th>
                <th className="border-b border-border px-3 py-2 text-left font-medium">Obligations</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band) => (
                <BandRows key={band.key} band={band} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BandRows({ band }: { band: { key: string; label: string; staff: HrMatrixStaff[] } }) {
  return (
    <>
      <tr>
        <td
          colSpan={3}
          className="sticky left-0 z-10 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        >
          {band.label}
        </td>
      </tr>
      {band.staff.map((s) => (
        <tr key={s.staff_id} className="hover:bg-muted/30">
          <td className="sticky left-0 z-10 bg-background border-b border-r border-border px-3 py-1.5 font-medium">
            <div className="truncate max-w-[220px]">{s.full_name}</div>
            {s.team_name && (
              <div className="text-[10px] text-muted-foreground truncate">{s.team_name}</div>
            )}
          </td>
          <td className="border-b border-border px-3 py-1.5 text-muted-foreground">
            {formatHireDate(s.hire_date)}
          </td>
          <td className="border-b border-border px-3 py-1.5">
            <a
              href={`/dashboard/my-obligations?staff=${s.staff_id}`}
              className="text-sm font-medium text-[var(--hive-ink)] hover:underline"
            >
              View obligations →
            </a>
          </td>
        </tr>
      ))}
    </>
  );
}
