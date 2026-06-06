import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listStaffTypeProposal,
  proposeStaffTypesAndMapping,
} from "@/lib/staff-types.functions";
import { toast } from "sonner";

/**
 * Part 1 UI: shows NECTAR's proposed staff types + per-requirement
 * applies-to mapping, derived from this org's authoritative sources.
 *
 * Pauses for admin confirmation before Part 2 (N/A rendering) ships.
 * Nothing in the matrix / staff HR tab changes from this card.
 */
export function StaffTypesProposal({ organizationId }: { organizationId: string }) {
  const fetchProposal = useServerFn(listStaffTypeProposal);
  const propose = useServerFn(proposeStaffTypesAndMapping);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const q = useQuery({
    queryKey: ["staff-types-proposal", organizationId],
    queryFn: () => fetchProposal({ data: { organization_id: organizationId } }),
  });

  const m = useMutation({
    mutationFn: async () => {
      setRunning(true);
      try {
        return await propose({ data: { organization_id: organizationId } });
      } finally {
        setRunning(false);
      }
    },
    onSuccess: (r) => {
      toast.success(
        `NECTAR proposed ${r.proposed_types} staff type(s) and mapped ${r.mapped} requirement(s). Review below.`,
      );
      qc.invalidateQueries({ queryKey: ["staff-types-proposal", organizationId] });
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
            Staff types & applicability — NECTAR proposal
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            NECTAR reads this org's authoritative sources (SOW + contract) and
            proposes the staff types your sources actually distinguish, plus
            which requirements apply to which type. <strong>Nothing renders as
            N/A yet</strong> — review the proposal here, then we'll turn on N/A
            rendering after you confirm (Part 2).
          </p>
        </div>
        <Button
          onClick={() => m.mutate()}
          disabled={running || m.isPending}
          size="sm"
        >
          {running || m.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
            </>
          ) : hasProposal ? (
            "Re-run NECTAR proposal"
          ) : (
            "Run NECTAR proposal"
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !hasProposal ? (
          <div className="rounded-md border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
            No proposal yet. Click <em>Run NECTAR proposal</em> to derive staff
            types and a per-requirement applies-to mapping from your uploaded
            authoritative sources.
          </div>
        ) : (
          <>
            {data!.any_unconfirmed && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <strong>Awaiting your confirmation.</strong> Review the
                  proposed types and the mapping below. The matrix and staff HR
                  tab still treat every requirement as applicable to every
                  staffer (nothing is hidden) until Part 2 ships and you confirm
                  this mapping.
                </div>
              </div>
            )}

            {/* Staff types */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proposed staff types ({data!.staff_types.length})
              </div>
              {data!.staff_types.length === 0 ? (
                <p className="text-xs text-muted-foreground">None proposed.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {data!.staff_types.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm">{t.label}</div>
                        <Badge variant="outline" className="text-[10px]">
                          {t.key}
                        </Badge>
                      </div>
                      {t.description && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      )}
                      {t.source_basis && (
                        <div className="mt-1 text-[11px] italic text-muted-foreground">
                          Source: {t.source_basis}
                        </div>
                      )}
                      {!t.confirmed_at && (
                        <Badge
                          variant="secondary"
                          className="mt-2 text-[10px]"
                        >
                          Awaiting confirmation
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mapping table */}
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
                    {data!.requirements.map((r) => {
                      const at = r.applies_to_staff_types;
                      return (
                        <tr
                          key={r.requirement_id}
                          className="border-b border-border last:border-0 align-top"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.title}</div>
                            {r.source_citation && (
                              <div className="text-[10px] text-muted-foreground">
                                {r.source_citation}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {at === "all" ? (
                              <Badge variant="secondary">All staff</Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {(at as string[]).map((k) => {
                                  const t = data!.staff_types.find(
                                    (s) => s.key === k,
                                  );
                                  return (
                                    <Badge
                                      key={k}
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {t?.label ?? k}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.applies_to_source_basis ?? (
                              <span className="italic">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.applies_to_ambiguous ? (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertTriangle className="h-3 w-3" /> Ambiguous —
                                defaulted to all
                              </span>
                            ) : !r.applies_to_proposed_at ? (
                              <span className="text-muted-foreground italic">
                                Not yet proposed
                              </span>
                            ) : (
                              <span className="text-emerald-700">
                                Clear basis
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">
                Anything ambiguous or unstated defaults to <em>all staff</em> so
                a real requirement is never hidden. Edit &amp; confirm becomes
                active in Part 2.
              </p>
              <Button size="sm" variant="outline" disabled>
                Edit &amp; confirm (Part 2)
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
