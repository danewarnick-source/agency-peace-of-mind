import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, AlertTriangle, Info, Plus, Trash2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  listStaffTypeProposal,
  proposeStaffTypesAndMapping,
  upsertStaffType,
  deleteStaffType,
  updateRequirementApplicability,
  confirmAllApplicability,
} from "@/lib/staff-types.functions";
import { toast } from "sonner";

/**
 * Editable staff-types + per-requirement applies-to editor.
 * Admin/manager confirm narrows the mapping; until confirmed, nothing renders
 * as N/A. NECTAR's proposal pre-fills; user can widen back to "all" or narrow.
 */
export function StaffTypesProposal({ organizationId }: { organizationId: string }) {
  const fetchProposal = useServerFn(listStaffTypeProposal);
  const propose = useServerFn(proposeStaffTypesAndMapping);
  const upsertType = useServerFn(upsertStaffType);
  const delType = useServerFn(deleteStaffType);
  const updateApp = useServerFn(updateRequirementApplicability);
  const confirmAll = useServerFn(confirmAllApplicability);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [newType, setNewType] = useState({ key: "", label: "" });

  const q = useQuery({
    queryKey: ["staff-types-proposal", organizationId],
    queryFn: () => fetchProposal({ data: { organization_id: organizationId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["staff-types-proposal", organizationId] });

  const m = useMutation({
    mutationFn: async () => {
      setRunning(true);
      try {
        return await propose({ data: { organization_id: organizationId } });
      } finally { setRunning(false); }
    },
    onSuccess: (r) => {
      toast.success(`NECTAR proposed ${r.proposed_types} type(s), mapped ${r.mapped}.`);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const data = q.data;
  const hasProposal =
    !!data && (data.staff_types.length > 0 || data.requirements.some((r) => r.applies_to_proposed_at));

  return (
    <Card className="border-indigo-200/60 bg-indigo-50/30 dark:bg-indigo-900/10">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-base">
            <Sparkles className="mr-2 inline h-4 w-4 text-indigo-600" />
            Staff types & applicability (HR Settings)
          </CardTitle>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Define your staff types and narrow which requirements apply to which. Until you confirm,
            nothing renders as N/A. Anything left "all" stays applicable to everyone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => m.mutate()}
            disabled={running || m.isPending}
            size="sm"
            variant="outline"
          >
            {running || m.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…</>
            ) : hasProposal ? "Re-run NECTAR proposal" : "Run NECTAR proposal"}
          </Button>
          {hasProposal && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await confirmAll({ data: { organization_id: organizationId } });
                  toast.success("Mapping confirmed. N/A rendering is now active.");
                  invalidate();
                } catch (e) { toast.error((e as Error).message); }
              }}
            >
              <Check className="mr-1 h-4 w-4" /> Confirm all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !hasProposal ? (
          <div className="rounded-md border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
            No proposal yet. Click <em>Run NECTAR proposal</em> to derive staff types and a
            per-requirement applies-to mapping from your authoritative sources.
          </div>
        ) : (
          <>
            {data!.any_unconfirmed && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <strong>Not confirmed yet.</strong> Until you click <em>Confirm all</em>, every
                  requirement is treated as applicable to every staffer (nothing is hidden).
                </div>
              </div>
            )}

            {/* Staff types editor */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Staff types ({data!.staff_types.length})
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data!.staff_types.map((t) => (
                  <StaffTypeRow
                    key={t.id}
                    organizationId={organizationId}
                    typeRow={t}
                    onChanged={invalidate}
                    upsert={upsertType}
                    del={delType}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="key (e.g. host_home)"
                    value={newType.key}
                    onChange={(e) =>
                      setNewType({ ...newType, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Label (e.g. Host Home Provider)"
                    value={newType.label}
                    onChange={(e) => setNewType({ ...newType, label: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newType.key || !newType.label}
                  onClick={async () => {
                    try {
                      await upsertType({
                        data: {
                          organization_id: organizationId,
                          key: newType.key,
                          label: newType.label,
                        },
                      });
                      setNewType({ key: "", label: "" });
                      toast.success("Type added");
                      invalidate();
                    } catch (e) { toast.error((e as Error).message); }
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add type
                </Button>
              </div>
            </div>

            {/* Mapping editor */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Requirement → applies-to ({data!.requirements.length})
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-background">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Requirement</th>
                      <th className="px-3 py-2 text-left">Applies to</th>
                      <th className="px-3 py-2 text-left">Source basis</th>
                      <th className="px-3 py-2 text-left">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.requirements.map((r) => (
                      <MappingRow
                        key={r.requirement_id}
                        organizationId={organizationId}
                        row={r}
                        allTypes={data!.staff_types}
                        onChanged={invalidate}
                        update={updateApp}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anything ambiguous or unstated stays <em>all staff</em> unless you narrow it. UNION rule:
              a dual-type staffer gets a requirement if it applies to <em>any</em> of their types.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StaffTypeRow({
  organizationId,
  typeRow,
  onChanged,
  upsert,
  del,
}: {
  organizationId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeRow: any;
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  del: any;
}) {
  const [label, setLabel] = useState(typeRow.label);
  useEffect(() => setLabel(typeRow.label), [typeRow.label]);
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{typeRow.key}</Badge>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={async () => {
            if (label === typeRow.label) return;
            try {
              await upsert({
                data: { organization_id: organizationId, id: typeRow.id, key: typeRow.key, label },
              });
              toast.success("Renamed");
              onChanged();
            } catch (e) { toast.error((e as Error).message); }
          }}
          className="h-7 flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!confirm(`Remove "${typeRow.label}"?`)) return;
            try {
              await del({ data: { organization_id: organizationId, id: typeRow.id } });
              toast.success("Removed");
              onChanged();
            } catch (e) { toast.error((e as Error).message); }
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {typeRow.source_basis && (
        <div className="mt-1 text-[11px] italic text-muted-foreground">Source: {typeRow.source_basis}</div>
      )}
    </div>
  );
}

function MappingRow({
  organizationId,
  row,
  allTypes,
  onChanged,
  update,
}: {
  organizationId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allTypes: any[];
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
}) {
  const at = row.applies_to_staff_types;
  const isAll = at === "all";
  const selected: string[] = isAll ? [] : (at as string[]);

  const save = async (val: string[] | "all") => {
    try {
      await update({
        data: {
          organization_id: organizationId,
          requirement_id: row.requirement_id,
          applies_to: val,
        },
      });
      toast.success("Updated");
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{row.title}</div>
        {row.source_citation && (
          <div className="text-[10px] text-muted-foreground">{row.source_citation}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={isAll ? "default" : "outline"}
            className="h-6 text-[10px]"
            onClick={() => save("all")}
          >
            All staff
          </Button>
          {allTypes.map((t) => {
            const on = !isAll && selected.includes(t.key);
            return (
              <Button
                key={t.key}
                size="sm"
                variant={on ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => {
                  const next = on
                    ? selected.filter((k) => k !== t.key)
                    : [...selected, t.key];
                  save(next.length === 0 ? "all" : next);
                }}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.applies_to_source_basis ?? <span className="italic">—</span>}
      </td>
      <td className="px-3 py-2">
        {row.applies_to_confirmed_at ? (
          <span className="text-emerald-700">Confirmed</span>
        ) : row.applies_to_ambiguous ? (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertTriangle className="h-3 w-3" /> Ambiguous → all
          </span>
        ) : !row.applies_to_proposed_at ? (
          <span className="italic text-muted-foreground">Not yet proposed</span>
        ) : (
          <span className="text-muted-foreground">Proposed</span>
        )}
      </td>
    </tr>
  );
}
