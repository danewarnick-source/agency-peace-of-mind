import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Pill, Plus, Upload, X, Loader2, Sparkles, Pencil, AlertTriangle, ClipboardCheck, Check, ShieldAlert, Clock } from "lucide-react";
import { toast } from "sonner";
import { parseMedicationsAI } from "@/lib/medications.functions";
import { useCurrentOrg } from "@/hooks/use-org";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Medication = {
  id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  scheduled_times: string[];
  instructions: string | null;
  prescriber: string | null;
  is_active: boolean;
  discontinued_at: string | null;
  // Contract compliance fields
  purpose: string | null;
  adverse_effects: string | null;
  choking_risk: boolean;
  choking_risk_details: string | null;
  is_controlled: boolean;
  is_prn: boolean;
  prn_instructions: string | null;
  pharmacy: string | null;
  rx_number: string | null;
  // Self-administration support fields (DHHS SOW b/d)
  packaging: string | null;
  side_effects: string | null;
  contributes_to_swallowing_difficulty: boolean;
};

type FormVals = {
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  scheduled_times: string[];
  instructions: string;
  prescriber: string;
  // Contract compliance fields
  purpose: string;
  adverse_effects: string;
  choking_risk: boolean;
  choking_risk_details: string;
  is_controlled: boolean;
  is_prn: boolean;
  prn_instructions: string;
  pharmacy: string;
  rx_number: string;
  packaging: string;
  side_effects: string;
  contributes_to_swallowing_difficulty: boolean;
};

const EMPTY: FormVals = {
  medication_name: "", dosage: "", frequency: "", route: "PO",
  scheduled_times: [], instructions: "", prescriber: "",
  purpose: "", adverse_effects: "", choking_risk: false,
  choking_risk_details: "", is_controlled: false, is_prn: false,
  prn_instructions: "", pharmacy: "", rx_number: "",
  packaging: "Pharmacy blister pack", side_effects: "",
  contributes_to_swallowing_difficulty: false,
};

function medToForm(m: Medication): FormVals {
  return {
    medication_name:    m.medication_name,
    dosage:             m.dosage ?? "",
    frequency:          m.frequency ?? "",
    route:              m.route ?? "PO",
    scheduled_times:    m.scheduled_times ?? [],
    instructions:       m.instructions ?? "",
    prescriber:         m.prescriber ?? "",
    purpose:            m.purpose ?? "",
    adverse_effects:    m.adverse_effects ?? "",
    choking_risk:       m.choking_risk ?? false,
    choking_risk_details: m.choking_risk_details ?? "",
    is_controlled:      m.is_controlled ?? false,
    is_prn:             m.is_prn ?? false,
    prn_instructions:   m.prn_instructions ?? "",
    pharmacy:           m.pharmacy ?? "",
    rx_number:          m.rx_number ?? "",
    packaging:          m.packaging ?? "Pharmacy blister pack",
    side_effects:       m.side_effects ?? "",
    contributes_to_swallowing_difficulty: m.contributes_to_swallowing_difficulty ?? false,
  };
}

// Serialize a form into the proposal payload (matches columns the RPC reads).
function formToPayload(v: FormVals): Record<string, unknown> {
  return {
    medication_name: v.medication_name.trim(),
    dosage: v.dosage.trim(),
    frequency: v.frequency.trim(),
    route: v.route.trim(),
    scheduled_times: v.scheduled_times,
    instructions: v.instructions.trim(),
    prescriber: v.prescriber.trim(),
    purpose: v.purpose.trim(),
    adverse_effects: v.adverse_effects.trim(),
    choking_risk: v.choking_risk,
    choking_risk_details: v.choking_risk_details.trim(),
    is_controlled: v.is_controlled,
    is_prn: v.is_prn,
    prn_instructions: v.prn_instructions.trim(),
    pharmacy: v.pharmacy.trim(),
    rx_number: v.rx_number.trim(),
    packaging: v.packaging.trim(),
    side_effects: v.side_effects.trim(),
    contributes_to_swallowing_difficulty: v.contributes_to_swallowing_difficulty,
  };
}

type ProposalRow = {
  id: string;
  medication_id: string | null;
  change_type: "add" | "edit" | "discontinue";
  proposed_payload: Record<string, any>;
  status: "pending" | "approved" | "rejected";
  source: "manual" | "appointment_upload";
  proposed_by: string;
  proposed_at: string;
};


// ─── Main component ────────────────────────────────────────────────────────────


export function MedicationsManager({
  clientId, organizationId,
}: { clientId: string; organizationId?: string }) {
  const qc = useQueryClient();
  const parseAI = useServerFn(parseMedicationsAI);
  const { data: org } = useCurrentOrg();
  const role = org?.role ?? null;
  const canApprove = role === "admin" || role === "super_admin";
  const canPropose = role === "manager";
  const readOnly = !canApprove && !canPropose;
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);

  const { data: meds, isLoading } = useQuery({
    queryKey: ["client-medications", clientId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await (supabase as any)
        .from("client_medications")
        .select(`id, medication_name, dosage, frequency, route, scheduled_times,
          instructions, prescriber, is_active, discontinued_at,
          purpose, adverse_effects, choking_risk, choking_risk_details,
          is_controlled, is_prn, prn_instructions, pharmacy, rx_number,
          packaging, side_effects, contributes_to_swallowing_difficulty`)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Medication[];
    },
  });

  // Pending proposals (visible to all org members so they know a change is proposed)
  const { data: proposals } = useQuery({
    queryKey: ["med-proposals", clientId],
    queryFn: async (): Promise<ProposalRow[]> => {
      const { data, error } = await (supabase as any)
        .from("medication_change_proposals")
        .select("id, medication_id, change_type, proposed_payload, status, source, proposed_by, proposed_at")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("proposed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProposalRow[];
    },
  });
  const pendingCount = proposals?.length ?? 0;

  // Fetch proposer display names for the approval panel
  const proposerIds = useMemo(
    () => Array.from(new Set((proposals ?? []).map((p) => p.proposed_by).filter(Boolean))),
    [proposals],
  );
  const { data: proposerNames } = useQuery({
    enabled: canApprove && proposerIds.length > 0,
    queryKey: ["med-proposal-proposers", proposerIds],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", proposerIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => {
        map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Unknown";
      });
      return map;
    },
  });

  const invalidateMedRelated = () => {
    qc.invalidateQueries({ queryKey: ["client-medications", clientId] });
    qc.invalidateQueries({ queryKey: ["med-proposals", clientId] });
    qc.invalidateQueries({ queryKey: ["mar-meds", clientId] });
  };

  // Direct writes — admin only. Managers/hosts route through proposals below.
  const insertMut = useMutation({
    mutationFn: async (v: FormVals) => {
      if (!organizationId) throw new Error("Missing organization");
      const { error } = await (supabase as any).from("client_medications").insert({
        organization_id:     organizationId,
        client_id:           clientId,
        medication_name:     v.medication_name.trim(),
        dosage:              v.dosage.trim() || null,
        frequency:           v.frequency.trim() || null,
        route:               v.route.trim() || null,
        scheduled_times:     v.scheduled_times,
        instructions:        v.instructions.trim() || null,
        prescriber:          v.prescriber.trim() || null,
        purpose:             v.purpose.trim() || null,
        adverse_effects:     v.adverse_effects.trim() || null,
        choking_risk:        v.choking_risk,
        choking_risk_details: v.choking_risk_details.trim() || null,
        is_controlled:       v.is_controlled,
        is_prn:              v.is_prn,
        prn_instructions:    v.prn_instructions.trim() || null,
        pharmacy:            v.pharmacy.trim() || null,
        rx_number:           v.rx_number.trim() || null,
        packaging:           v.packaging.trim() || null,
        side_effects:        v.side_effects.trim() || null,
        contributes_to_swallowing_difficulty: v.contributes_to_swallowing_difficulty,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication added.");
      invalidateMedRelated();
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: FormVals }) => {
      const { error } = await (supabase as any).from("client_medications").update({
        medication_name:     v.medication_name.trim(),
        dosage:              v.dosage.trim() || null,
        frequency:           v.frequency.trim() || null,
        route:               v.route.trim() || null,
        scheduled_times:     v.scheduled_times,
        instructions:        v.instructions.trim() || null,
        prescriber:          v.prescriber.trim() || null,
        purpose:             v.purpose.trim() || null,
        adverse_effects:     v.adverse_effects.trim() || null,
        choking_risk:        v.choking_risk,
        choking_risk_details: v.choking_risk_details.trim() || null,
        is_controlled:       v.is_controlled,
        is_prn:              v.is_prn,
        prn_instructions:    v.prn_instructions.trim() || null,
        pharmacy:            v.pharmacy.trim() || null,
        rx_number:           v.rx_number.trim() || null,
        packaging:           v.packaging.trim() || null,
        side_effects:        v.side_effects.trim() || null,
        contributes_to_swallowing_difficulty: v.contributes_to_swallowing_difficulty,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication updated.");
      invalidateMedRelated();
      setEditMed(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discontinueMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_medications")
        .update({ is_active: false, discontinued_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication discontinued. Record preserved.");
      invalidateMedRelated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Proposal-writing mutations — managers/hosts submit these; nothing goes live.
  const proposeMut = useMutation({
    mutationFn: async (args: {
      change_type: "add" | "edit" | "discontinue";
      medication_id?: string | null;
      payload: Record<string, unknown>;
      source?: "manual" | "appointment_upload";
    }) => {
      if (!organizationId) throw new Error("Missing organization");
      const { error } = await (supabase as any).from("medication_change_proposals").insert({
        organization_id: organizationId,
        client_id: clientId,
        medication_id: args.medication_id ?? null,
        change_type: args.change_type,
        proposed_payload: args.payload,
        source: args.source ?? "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Change proposed. Awaiting admin approval.");
      invalidateMedRelated();
      setAddOpen(false);
      setEditMed(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkInsertMut = useMutation({
    mutationFn: async (rows: FormVals[]) => {
      if (!organizationId) throw new Error("Missing organization");
      if (canApprove) {
        const payload = rows.map((r) => ({
          organization_id: organizationId,
          client_id: clientId,
          medication_name: r.medication_name,
          dosage: r.dosage || null,
          frequency: r.frequency || null,
          route: r.route || null,
          scheduled_times: r.scheduled_times,
          instructions: r.instructions || null,
          prescriber: r.prescriber || null,
          purpose: null, adverse_effects: null, choking_risk: false,
          is_controlled: false, is_prn: false,
        }));
        const { error } = await (supabase as any).from("client_medications").insert(payload);
        if (error) throw error;
        return { proposed: false as const, count: rows.length };
      }
      // Manager / host uploads → create pending proposals, one per parsed med.
      const payload = rows.map((r) => ({
        organization_id: organizationId,
        client_id: clientId,
        change_type: "add" as const,
        source: "appointment_upload" as const,
        proposed_payload: formToPayload(r),
      }));
      const { error } = await (supabase as any).from("medication_change_proposals").insert(payload);
      if (error) throw error;
      return { proposed: true as const, count: rows.length };
    },
    onSuccess: (res) => {
      if (res.proposed) {
        toast.success(`${res.count} proposed medication${res.count === 1 ? "" : "s"} awaiting admin approval.`);
      } else {
        toast.success(`Imported ${res.count} medication${res.count === 1 ? "" : "s"}.`);
      }
      invalidateMedRelated();
      setImportOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await (supabase as any).rpc("apply_med_change_proposal", { _proposal_id: proposalId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Proposal approved and applied."); invalidateMedRelated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await (supabase as any).rpc("reject_med_change_proposal", {
        _proposal_id: id, _notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Proposal rejected."); invalidateMedRelated(); },
    onError: (e: Error) => toast.error(e.message),
  });


  const visible = (meds ?? []).filter((m) => showInactive || m.is_active);
  const hasChokingRisk = visible.some((m) => m.choking_risk);

  return (
    <div className="space-y-3">

      {/* Choking risk system alert */}
      {hasChokingRisk && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-rose-500 bg-rose-50 px-3 py-2.5 dark:bg-rose-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
              Choking / Swallowing Risk on File
            </p>
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              One or more medications are flagged for choking or swallowing risk. Confirm upright posture and
              crushed-med policy per care plan before every medication pass.
            </p>
          </div>
        </div>
      )}

      {/* Pending-proposal banner — visible to everyone so the list state is honest */}
      {pendingCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/20">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
              {pendingCount} pending medication change{pendingCount === 1 ? "" : "s"} awaiting admin approval
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Proposed changes are NOT live on the medication list until an organization admin approves them.
            </p>
          </div>
        </div>
      )}

      {/* Read-only banner for direct support staff */}
      {readOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Medication list is <span className="font-semibold">read-only</span> for direct support staff.
            You can still administer and document medication passes on the eMAR.
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Active prescriptions</h3>
            <Badge variant="outline">{visible.length}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="ghost"
              onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Hide inactive" : "Show inactive"}
            </Button>
            {!readOnly && (
              <>
                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" size="sm" variant="outline">
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {canApprove ? "Upload MAR / Order" : "Upload MAR (propose)"}
                    </Button>
                  </DialogTrigger>
                  <AIImportDialog
                    proposeMode={!canApprove}
                    onParse={async (p) => {
                      const r = await parseAI({ data: p });
                      return (r.medications ?? []).map((m) => ({
                        ...EMPTY,
                        medication_name: m?.medication_name ?? "",
                        dosage: m?.dosage ?? "",
                        frequency: m?.frequency ?? "",
                        route: m?.route ?? "PO",
                        scheduled_times: Array.isArray(m?.scheduled_times) ? m!.scheduled_times! : [],
                        instructions: m?.instructions ?? "",
                        prescriber: m?.prescriber ?? "",
                      }));
                    }}
                    onCommit={(rows) => bulkInsertMut.mutate(rows)}
                    committing={bulkInsertMut.isPending}
                  />
                </Dialog>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" size="sm">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {canApprove ? "Add Medication" : "Propose Add"}
                    </Button>
                  </DialogTrigger>
                  <MedFormDialog
                    title={canApprove ? "Add Medication" : "Propose New Medication"}
                    submitLabel={canApprove ? "Save Medication" : "Submit Proposal"}
                    onSubmit={(v) => {
                      if (canApprove) insertMut.mutate(v);
                      else proposeMut.mutate({ change_type: "add", payload: formToPayload(v) });
                    }}
                    pending={insertMut.isPending || proposeMut.isPending}
                  />
                </Dialog>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading medications...</p>
        ) : !visible.length ? (
          <p className="text-xs text-muted-foreground">
            {readOnly
              ? "No medications recorded."
              : canApprove
                ? "No medications recorded. Click Add Medication to begin."
                : "No medications recorded. Click Propose Add to submit for admin approval."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medication</TableHead>
                <TableHead>Dose</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Times</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Status</TableHead>
                {!readOnly && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((m) => (
                <TableRow
                  key={m.id}
                  className={`${readOnly ? "" : "cursor-pointer hover:bg-muted/40"} ${!m.is_active ? "opacity-50" : ""}`}
                  onClick={() => { if (!readOnly) setEditMed(m); }}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {m.choking_risk && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                      )}
                      {m.medication_name}
                    </div>
                    {m.prescriber && (
                      <div className="text-[10px] text-muted-foreground">Rx: {m.prescriber}</div>
                    )}
                    {m.purpose && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{m.purpose}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{m.dosage || "—"}</TableCell>
                  <TableCell className="text-xs">{m.route || "—"}</TableCell>
                  <TableCell className="text-xs">{m.frequency || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(m.scheduled_times ?? []).map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.is_controlled && (
                        <Badge className="bg-purple-100 text-purple-800 text-[10px] dark:bg-purple-950/40 dark:text-purple-200">Controlled</Badge>
                      )}
                      {m.is_prn && (
                        <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-950/40 dark:text-amber-200">PRN</Badge>
                      )}
                      {m.choking_risk && (
                        <Badge className="bg-rose-100 text-rose-800 text-[10px] dark:bg-rose-950/40 dark:text-rose-200">Choking Risk</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.is_active
                      ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200">Active</Badge>
                      : <Badge variant="outline">Discontinued</Badge>}
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); setEditMed(m); }}
                          className="h-7 px-2"
                          title={canApprove ? "Edit" : "Propose edit"}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {m.is_active && (
                          <Button
                            type="button" variant="ghost" size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canApprove) {
                                discontinueMut.mutate(m.id);
                              } else {
                                proposeMut.mutate({
                                  change_type: "discontinue",
                                  medication_id: m.id,
                                  payload: { medication_name: m.medication_name },
                                });
                              }
                            }}
                            className="h-7 px-2 text-muted-foreground hover:text-rose-600"
                            title={canApprove ? "Discontinue" : "Propose discontinue"}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Admin approval panel */}
      {canApprove && pendingCount > 0 && (
        <PendingProposalsPanel
          proposals={proposals ?? []}
          meds={meds ?? []}
          proposerNames={proposerNames ?? {}}
          onApprove={(id) => approveMut.mutate(id)}
          onReject={(id, notes) => rejectMut.mutate({ id, notes })}
          approving={approveMut.isPending}
          rejecting={rejectMut.isPending}
        />
      )}

      {/* Edit dialog */}
      <Dialog open={!!editMed} onOpenChange={(o) => { if (!o) setEditMed(null); }}>
        {editMed && (
          <MedFormDialog
            title={canApprove ? `Edit — ${editMed.medication_name}` : `Propose edit — ${editMed.medication_name}`}
            submitLabel={canApprove ? "Save Medication" : "Submit Proposal"}
            initial={medToForm(editMed)}
            onSubmit={(v) => {
              if (canApprove) updateMut.mutate({ id: editMed.id, v });
              else proposeMut.mutate({
                change_type: "edit",
                medication_id: editMed.id,
                payload: formToPayload(v),
              });
            }}
            pending={updateMut.isPending || proposeMut.isPending}
            showDiscontinue={editMed.is_active && canApprove}
            onDiscontinue={() => { discontinueMut.mutate(editMed.id); setEditMed(null); }}
          />
        )}
      </Dialog>

      {/* Import dialog */}
    </div>
  );
}


// ─── Medication Form Dialog ────────────────────────────────────────────────────

function MedFormDialog({
  title,
  initial,
  onSubmit,
  pending,
  showDiscontinue,
  onDiscontinue,
  submitLabel,
}: {
  title: string;
  initial?: FormVals;
  onSubmit: (v: FormVals) => void;
  pending: boolean;
  showDiscontinue?: boolean;
  onDiscontinue?: () => void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<FormVals>(initial ?? EMPTY);
  const [timeInput, setTimeInput] = useState("");

  function addTime() {
    const t = timeInput.trim();
    if (!/^\d{2}:\d{2}$/.test(t)) { toast.error("Use HH:MM format (e.g. 08:00)"); return; }
    if (v.scheduled_times.includes(t)) return;
    setV({ ...v, scheduled_times: [...v.scheduled_times, t].sort() });
    setTimeInput("");
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          {title}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">

        {/* Core prescription fields */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Medication Name *</Label>
          <Input
            value={v.medication_name}
            onChange={(e) => setV({ ...v, medication_name: e.target.value })}
            placeholder="e.g., Hydroxyzine HCl"
            maxLength={200}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Dosage</Label>
            <Input
              value={v.dosage}
              onChange={(e) => setV({ ...v, dosage: e.target.value })}
              placeholder="10 mg"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Route</Label>
            <Input
              value={v.route}
              onChange={(e) => setV({ ...v, route: e.target.value })}
              placeholder="PO"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Frequency</Label>
            <Input
              value={v.frequency}
              onChange={(e) => setV({ ...v, frequency: e.target.value })}
              placeholder="BID"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Scheduled Times (24h)</Label>
          <div className="flex gap-2">
            <Input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className="w-36"
            />
            <Button type="button" variant="outline" onClick={addTime}>Add Time</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.scheduled_times.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 font-mono">
                {t}
                <button
                  type="button"
                  onClick={() => setV({ ...v, scheduled_times: v.scheduled_times.filter((x) => x !== t) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Prescriber</Label>
          <Input
            value={v.prescriber}
            onChange={(e) => setV({ ...v, prescriber: e.target.value })}
            placeholder="Dr. Name"
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Administration Instructions</Label>
          <Textarea
            value={v.instructions}
            onChange={(e) => setV({ ...v, instructions: e.target.value })}
            rows={2}
            placeholder="Special instructions for staff..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Pharmacy</Label>
            <Input
              value={v.pharmacy}
              onChange={(e) => setV({ ...v, pharmacy: e.target.value })}
              placeholder="Pharmacy name"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Rx Number</Label>
            <Input
              value={v.rx_number}
              onChange={(e) => setV({ ...v, rx_number: e.target.value })}
              placeholder="Prescription number"
            />
          </div>
        </div>

        {/* Contract compliance fields */}
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            State Contract Compliance — Required Fields
          </p>

          <div className="space-y-4">

            {/* (1) Clinical purpose */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">
                Clinical Purpose *
                <span className="ml-1 font-normal text-muted-foreground">(Contract Req. 1)</span>
              </Label>
              <Textarea
                rows={2}
                value={v.purpose}
                onChange={(e) => setV({ ...v, purpose: e.target.value })}
                placeholder="What condition or symptom does this medication treat? Why is this person taking it?"
              />
            </div>

            {/* (3) Adverse effects */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">
                Adverse Effects & Side Effects *
                <span className="ml-1 font-normal text-muted-foreground">(Contract Req. 3)</span>
              </Label>
              <Textarea
                rows={3}
                value={v.adverse_effects}
                onChange={(e) => setV({ ...v, adverse_effects: e.target.value })}
                placeholder="Known side effects, signs of adverse reaction, and what staff should watch for..."
              />
            </div>

            {/* Side effects (everyday) — distinct from adverse reaction signs */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">
                Everyday Side Effects
                <span className="ml-1 font-normal text-muted-foreground">(what the Person may experience)</span>
              </Label>
              <Textarea
                rows={2}
                value={v.side_effects}
                onChange={(e) => setV({ ...v, side_effects: e.target.value })}
                placeholder="e.g. dry mouth, drowsiness, dizziness, mild stomach upset…"
              />
            </div>

            {/* Pharmacy packaging — DHHS SOW requires licensed-pharmacy dose packaging */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">
                Pharmacy Packaging *
                <span className="ml-1 font-normal text-muted-foreground">(SOW: licensed pharmacy, dose packaging)</span>
              </Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={v.packaging}
                onChange={(e) => setV({ ...v, packaging: e.target.value })}
              >
                <option value="">— select —</option>
                <option value="Pharmacy blister pack">Pharmacy blister pack</option>
                <option value="Pharmacy unit-dose card">Pharmacy unit-dose card</option>
                <option value="Pharmacy multi-dose pouch">Pharmacy multi-dose pouch</option>
                <option value="Original pharmacy bottle (single med)">Original pharmacy bottle (single med)</option>
                <option value="Pharmacy-prepared syringe">Pharmacy-prepared syringe</option>
                <option value="Manufacturer inhaler/device">Manufacturer inhaler/device</option>
                <option value="Other (see notes)">Other (see notes)</option>
              </select>
            </div>

            {/* Contributes to swallowing difficulty — independent of choking_risk */}
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={v.contributes_to_swallowing_difficulty}
                onCheckedChange={(c) => setV({ ...v, contributes_to_swallowing_difficulty: !!c })}
              />
              <span>
                <span className="font-semibold">This medication can contribute to swallowing difficulty</span>
                <span className="block text-[11px] text-muted-foreground">
                  Flagged at every pass so the supporting staff confirms upright posture and reviews the crushed-med policy.
                </span>
              </span>
            </label>


            {/* Choking risk — Contract Req. 3 specifically calls this out */}
            <div className={`rounded-lg border-2 p-3 space-y-2 ${v.choking_risk ? "border-rose-500 bg-rose-50 dark:bg-rose-950/20" : "border-border bg-muted/20"}`}>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={v.choking_risk}
                  onCheckedChange={(c) => setV({ ...v, choking_risk: !!c })}
                />
                <span className={`text-sm font-semibold ${v.choking_risk ? "text-rose-800 dark:text-rose-200" : "text-foreground"}`}>
                  This medication may contribute to swallowing difficulties or enhance the prospects of choking
                </span>
              </label>
              <p className="ml-6 text-[11px] text-muted-foreground">
                Required disclosure per state contract. Checking this displays a choking risk alert at every medication pass.
              </p>
              {v.choking_risk && (
                <Textarea
                  rows={2}
                  value={v.choking_risk_details}
                  onChange={(e) => setV({ ...v, choking_risk_details: e.target.value })}
                  placeholder="Describe the choking or swallowing risk and any required precautions (e.g., crush medication, upright position required)..."
                  className="ml-6 text-sm bg-white dark:bg-slate-900"
                />
              )}
            </div>

            {/* PRN and Controlled flags */}
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition ${
                v.is_controlled
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                  : "border-border hover:bg-muted/40"
              }`}>
                <Checkbox
                  checked={v.is_controlled}
                  onCheckedChange={(c) => setV({ ...v, is_controlled: !!c })}
                />
                <div>
                  <p className={`text-sm font-medium ${v.is_controlled ? "text-purple-800 dark:text-purple-200" : ""}`}>
                    Controlled Substance
                  </p>
                  <p className="text-[10px] text-muted-foreground">Requires pill count verification</p>
                </div>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition ${
                v.is_prn
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                  : "border-border hover:bg-muted/40"
              }`}>
                <Checkbox
                  checked={v.is_prn}
                  onCheckedChange={(c) => setV({ ...v, is_prn: !!c })}
                />
                <div>
                  <p className={`text-sm font-medium ${v.is_prn ? "text-amber-800 dark:text-amber-200" : ""}`}>
                    PRN / As Needed
                  </p>
                  <p className="text-[10px] text-muted-foreground">Reason required at each administration</p>
                </div>
              </label>
            </div>

            {v.is_prn && (
              <div className="grid gap-2">
                <Label className="text-xs font-semibold">PRN Administration Instructions</Label>
                <Textarea
                  rows={2}
                  value={v.prn_instructions}
                  onChange={(e) => setV({ ...v, prn_instructions: e.target.value })}
                  placeholder="When and under what circumstances should this PRN medication be administered?"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row">
        {showDiscontinue && onDiscontinue && (
          <Button
            type="button" variant="outline"
            onClick={onDiscontinue}
            className="border-rose-500/50 text-rose-700 hover:bg-rose-50 dark:text-rose-300 sm:mr-auto"
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Discontinue
          </Button>
        )}
        <Button
          type="button"
          disabled={!v.medication_name.trim() || pending}
          onClick={() => onSubmit(v)}
        >
          {pending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            : (submitLabel ?? "Save Medication")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── AI Import Dialog ─────────────────────────────────────────────────────────

function AIImportDialog({
  onParse, onCommit, committing, proposeMode,
}: {
  onParse: (payload: { imageBase64?: string; mime?: string; text?: string }) => Promise<FormVals[]>;
  onCommit: (rows: FormVals[]) => void;
  committing: boolean;
  proposeMode?: boolean;
}) {
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<FormVals[]>([]);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      if (file.type.startsWith("image/")) {
        const b64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1] ?? "");
          r.readAsDataURL(file);
        });
        const m = await onParse({ imageBase64: b64, mime: file.type });
        setRows(m);
      } else {
        const t = await file.text();
        const m = await onParse({ text: t });
        setRows(m);
      }
      toast.success("Medications extracted. Review before saving.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  return (
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>NECTAR Medication Importer</DialogTitle>
      </DialogHeader>
      {!rows.length ? (
        <div className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center hover:bg-accent/30 transition"
          >
            {parsing ? (
              <><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Parsing with NECTAR...</p></>
            ) : (
              <><Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Drop physician order, MAR, or pharmacy list</p>
                <p className="text-xs text-muted-foreground">PDF, image, CSV, or text supported</p></>
            )}
            <input
              ref={fileRef} type="file" className="hidden"
              accept="image/*,.pdf,.csv,.txt,.xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">or paste order text</div>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Paste physician order text here..." />
          <Button type="button" disabled={!text.trim() || parsing} onClick={async () => {
            setParsing(true);
            try { setRows(await onParse({ text })); } catch (e) { toast.error((e as Error).message); }
            finally { setParsing(false); }
          }}>
            {parsing ? "Parsing..." : "Parse Text"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Review before committing. Note: compliance fields (purpose, adverse effects) must be completed manually after import.
          </p>
          <div className="rounded-md border border-border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medication</TableHead>
                  <TableHead>Dose</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Times</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input value={r.medication_name}
                        className={!r.medication_name ? "border-rose-400" : ""}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, medication_name: e.target.value } : x))} />
                    </TableCell>
                    <TableCell>
                      <Input value={r.dosage || ""}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))} />
                    </TableCell>
                    <TableCell>
                      <Input value={r.route || ""}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, route: e.target.value } : x))} />
                    </TableCell>
                    <TableCell>
                      <Input value={r.frequency || ""}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(r.scheduled_times || []).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRows([])}>Start Over</Button>
            <Button disabled={!rows.length || committing} onClick={() => onCommit(rows)}>
              {committing ? "Saving..." : `Save ${rows.length} Medication${rows.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}
