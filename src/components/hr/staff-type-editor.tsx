import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listStaffTypeProposal,
  getStaffTypeAssignment,
  setStaffTypeKeys,
} from "@/lib/staff-types.functions";

/**
 * Admin/manager-only staff-type editor. UNION rule: a dual-type staffer is
 * applicable wherever a requirement applies to ANY of their assigned types.
 */
export function StaffTypeEditor({
  organizationId,
  staffId,
}: {
  organizationId: string;
  staffId: string;
}) {
  const fetchProposal = useServerFn(listStaffTypeProposal);
  const fetchAssignment = useServerFn(getStaffTypeAssignment);
  const save = useServerFn(setStaffTypeKeys);
  const qc = useQueryClient();

  const typesQ = useQuery({
    queryKey: ["staff-types-proposal", organizationId],
    queryFn: () => fetchProposal({ data: { organization_id: organizationId } }),
  });
  const assignQ = useQuery({
    queryKey: ["staff-type-assignment", organizationId, staffId],
    queryFn: () =>
      fetchAssignment({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (assignQ.data) setSelected(assignQ.data.staff_type_keys ?? []);
  }, [assignQ.data]);

  const m = useMutation({
    mutationFn: (keys: string[]) =>
      save({
        data: { organization_id: organizationId, staff_id: staffId, staff_type_keys: keys },
      }),
    onSuccess: () => {
      toast.success("Staff type updated");
      qc.invalidateQueries({ queryKey: ["staff-type-assignment", organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ["staff-checklist", organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ["hr-matrix", organizationId] });
      qc.invalidateQueries({ queryKey: ["hr-admin-rollup", organizationId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const allTypes = typesQ.data?.staff_types ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Staff type</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {allTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No staff types defined yet. Configure them in HR Settings.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {allTypes.map((t) => {
                const on = selected.includes(t.key);
                return (
                  <Button
                    key={t.key}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => {
                      const next = on
                        ? selected.filter((k) => k !== t.key)
                        : [...selected, t.key];
                      setSelected(next);
                      m.mutate(next);
                    }}
                  >
                    {t.label}
                  </Button>
                );
              })}
            </div>
            {selected.length === 0 && (
              <Badge variant="outline" className="text-[10px]">
                Untyped — all requirements treated as applicable
              </Badge>
            )}
            <p className="text-[11px] text-muted-foreground">
              UNION rule: the staffer is required for any requirement that applies to at least
              one of their selected types.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
