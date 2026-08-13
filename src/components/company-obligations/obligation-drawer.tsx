// Create/edit drawer for a Company Obligation. Shared for both modes —
// `obligation` is null when creating, populated when editing.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ChevronDown, Lock, Plus, X } from "lucide-react";
import {
  createCompanyObligation,
  updateCompanyObligation,
  toggleObligationActive,
  type CompanyObligationRow,
} from "@/lib/company-obligations.functions";
import { listStaffGroups } from "@/lib/staff-groups.functions";

type Cadence = CompanyObligationRow["cadence"];
type EvidenceType = CompanyObligationRow["evidence_type"];
type AssigneeRole = CompanyObligationRow["assignee_role"];

interface FormState {
  title: string;
  description: string;
  sourcePolicySection: string;
  cadence: Cadence;
  dueDayConfig: Record<string, unknown>;
  reminderDaysBefore: number[];
  evidenceType: EvidenceType;
  linkedFormId: string | null;
  attestationText: string;
  requiresIndividualCompletion: boolean;
  assignedToGroups: string[];
  assignedToUsers: string[];
  assigneeRole: AssigneeRole;
  notifyManagerOnComplete: boolean;
  notifyManagerOnOverdue: boolean;
  active: boolean;
  nectarCertTypeLabel: string;
  nectarKeywordGroups: Array<{ label: string; any_of: string[] }>;
}

const DEFAULT_STATE: FormState = {
  title: "",
  description: "",
  sourcePolicySection: "",
  cadence: "monthly",
  dueDayConfig: { day_of_month: 5 },
  reminderDaysBefore: [7],
  evidenceType: "attestation",
  linkedFormId: null,
  attestationText: "",
  requiresIndividualCompletion: false,
  assignedToGroups: [],
  assignedToUsers: [],
  assigneeRole: "any_assigned",
  notifyManagerOnComplete: true,
  notifyManagerOnOverdue: true,
  active: true,
  nectarCertTypeLabel: "",
  nectarKeywordGroups: [],
};

function fromObligation(ob: CompanyObligationRow): FormState {
  return {
    title: ob.title,
    description: ob.description ?? "",
    sourcePolicySection: ob.source_policy_section ?? "",
    cadence: ob.cadence,
    dueDayConfig: (ob.due_day_config as Record<string, unknown>) ?? {},
    reminderDaysBefore: ob.reminder_days_before ?? [],
    evidenceType: ob.evidence_type,
    linkedFormId: ob.linked_form_id,
    attestationText: ob.attestation_text ?? "",
    requiresIndividualCompletion: ob.requires_individual_completion,
    assignedToGroups: ob.assigned_to_groups ?? [],
    assignedToUsers: ob.assigned_to_users ?? [],
    assigneeRole: ob.assignee_role,
    notifyManagerOnComplete: ob.notify_manager_on_complete,
    notifyManagerOnOverdue: ob.notify_manager_on_overdue,
    active: ob.active,
    nectarCertTypeLabel: ob.nectar_cert_type_label ?? "",
    nectarKeywordGroups: Array.isArray(ob.nectar_keyword_groups)
      ? (ob.nectar_keyword_groups as Array<{ label: string; any_of: string[] }>)
      : [],
  };
}

const REMINDER_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 14, label: "14 days before" },
  { value: 7, label: "7 days before" },
  { value: 3, label: "3 days before" },
  { value: 1, label: "1 day before" },
  { value: 0, label: "Day of" },
];

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function DueDayFields({
  state,
  setState,
  readOnly,
}: {
  state: FormState;
  setState: (s: FormState) => void;
  readOnly: boolean;
}) {
  const cfg = state.dueDayConfig;
  const setCfg = (next: Record<string, unknown>) => setState({ ...state, dueDayConfig: next });

  if (state.cadence === "weekly") {
    const weekday = Number(cfg.weekday ?? 1);
    return (
      <div className="grid gap-1.5">
        <Label>Weekday</Label>
        <Select value={String(weekday)} onValueChange={(v) => setCfg({ weekday: Number(v) })} disabled={readOnly}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (state.cadence === "monthly" || state.cadence === "quarterly") {
    const isLast = cfg.day_of_month === "last";
    return (
      <div className="grid gap-1.5">
        <Label>Day of month</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={28}
            disabled={isLast || readOnly}
            value={isLast ? "" : String(cfg.day_of_month ?? 1)}
            onChange={(e) => setCfg({ day_of_month: Number(e.target.value) })}
            className="w-24"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={isLast}
              disabled={readOnly}
              onCheckedChange={(v) => setCfg({ day_of_month: v === true ? "last" : 1 })}
            />
            Last day of month
          </label>
        </div>
        {state.cadence === "quarterly" && (
          <p className="text-xs text-muted-foreground">
            of the first month of each quarter (Jan, Apr, Jul, Oct)
          </p>
        )}
      </div>
    );
  }

  if (state.cadence === "annually") {
    const isLast = cfg.day_of_month === "last";
    const month = Number(cfg.month ?? 1);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Month</Label>
          <Select value={String(month)} onValueChange={(v) => setCfg({ ...cfg, month: Number(v) })} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Day</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={28}
              disabled={isLast || readOnly}
              value={isLast ? "" : String(cfg.day_of_month ?? 1)}
              onChange={(e) => setCfg({ ...cfg, day_of_month: Number(e.target.value) })}
              className="w-20"
            />
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={isLast}
                disabled={readOnly}
                onCheckedChange={(v) => setCfg({ ...cfg, day_of_month: v === true ? "last" : 1 })}
              />
              Last day
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (state.cadence === "per_event") {
    return (
      <div className="grid gap-1.5">
        <Label>Days after the triggering event</Label>
        <Input
          type="number"
          min={0}
          disabled={readOnly}
          value={String(cfg.days_after_trigger ?? 0)}
          onChange={(e) => setCfg({ days_after_trigger: Number(e.target.value) })}
          className="w-24"
        />
      </div>
    );
  }

  if (state.cadence === "one_time") {
    return (
      <div className="grid gap-1.5">
        <Label>Due date</Label>
        <Input
          type="date"
          disabled={readOnly}
          value={typeof cfg.date === "string" ? cfg.date : ""}
          onChange={(e) => setCfg({ date: e.target.value })}
        />
      </div>
    );
  }

  return null;
}

function StaffPickerCombobox({
  orgId,
  excludeIds,
  onSelect,
}: {
  orgId: string;
  excludeIds: Set<string>;
  onSelect: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: directory = [] } = useQuery({
    queryKey: ["org-member-directory-active", orgId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name, position")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
    },
  });
  const options = useMemo(() => directory.filter((d) => !excludeIds.has(d.id)), [directory, excludeIds]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">Add individual…</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search staff…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.full_name ?? d.id}
                  onSelect={() => {
                    onSelect(d.id, d.full_name ?? "Unnamed");
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{d.full_name ?? "Unnamed"}</span>
                  {d.position && <span className="ml-2 text-xs text-muted-foreground">{d.position}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ObligationDrawer({
  open,
  onOpenChange,
  orgId,
  obligation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  obligation: CompanyObligationRow | null;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createCompanyObligation);
  const updateFn = useServerFn(updateCompanyObligation);
  const toggleActiveFn = useServerFn(toggleObligationActive);
  const listGroupsFn = useServerFn(listStaffGroups);

  const isEdit = !!obligation;
  const isLocked = obligation?.is_locked ?? false;
  const [state, setState] = useState<FormState>(obligation ? fromObligation(obligation) : DEFAULT_STATE);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (open) {
      setState(obligation ? fromObligation(obligation) : DEFAULT_STATE);
    }
  }, [open, obligation]);

  // Seed individual-assignee display names on edit open.
  useEffect(() => {
    if (!open || !obligation?.assigned_to_users?.length) return;
    supabase
      .from("org_member_directory")
      .select("id, full_name")
      .in("id", obligation.assigned_to_users)
      .then(({ data }) => {
        const m = new Map<string, string>();
        for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
          m.set(r.id, r.full_name ?? "Unknown");
        }
        setUserNames(m);
      });
  }, [open, obligation]);

  const { data: groups = [] } = useQuery({
    queryKey: ["staff-groups", orgId],
    enabled: open && !!orgId,
    queryFn: () => listGroupsFn({ data: { organizationId: orgId } }),
  });

  const {
    data: forms = [],
    refetch: refetchForms,
  } = useQuery({
    queryKey: ["published-forms", orgId],
    enabled: open && !!orgId && state.evidenceType === "form",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("status", "published")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        organizationId: orgId,
        title: state.title.trim(),
        description: state.description.trim() || null,
        sourcePolicySection: state.sourcePolicySection.trim() || null,
        cadence: state.cadence,
        dueDayConfig: state.dueDayConfig,
        reminderDaysBefore: state.reminderDaysBefore,
        evidenceType: state.evidenceType,
        linkedFormId: state.evidenceType === "form" ? state.linkedFormId : null,
        attestationText: state.attestationText.trim() || null,
        requiresIndividualCompletion: state.assignedToGroups.length > 0 ? state.requiresIndividualCompletion : false,
        assignedToGroups: state.assignedToGroups,
        assignedToUsers: state.assignedToUsers,
        assigneeRole: state.assigneeRole,
        notifyManagerOnComplete: state.notifyManagerOnComplete,
        notifyManagerOnOverdue: state.notifyManagerOnOverdue,
        nectarCertTypeLabel:
          (state.evidenceType === "upload" || state.evidenceType === "upload_and_attestation")
            ? (state.nectarCertTypeLabel.trim() || null)
            : null,
        nectarKeywordGroups:
          (state.evidenceType === "upload" || state.evidenceType === "upload_and_attestation")
            ? state.nectarKeywordGroups.filter((g) => g.label.trim() && g.any_of.length > 0)
            : [],
      };
      if (isEdit && obligation) {
        const result = await updateFn({ data: { obligationId: obligation.id, ...payload } });
        if (state.active !== obligation.active) {
          await toggleActiveFn({ data: { organizationId: orgId, obligationId: obligation.id, active: state.active } });
        }
        return result;
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Obligation updated" : "Obligation created");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsAttestationText =
    state.evidenceType === "attestation" || state.evidenceType === "upload_and_attestation";

  const canSave =
    state.title.trim().length > 0 &&
    (!needsAttestationText || state.attestationText.trim().length > 0) &&
    (state.evidenceType !== "form" || !!state.linkedFormId);

  const excludeUserIds = useMemo(() => new Set(state.assignedToUsers), [state.assignedToUsers]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit obligation" : "New obligation"}</SheetTitle>
          <SheetDescription>
            A recurring or per-event compliance duty, tracked to completion.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 pb-4">
          {isLocked && (
            <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This obligation is required by the state contract (DSPD SOW DHHS91172) and cannot be modified.
              </span>
            </div>
          )}

          {/* 1. Title */}
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={state.title} onChange={(e) => setState({ ...state, title: e.target.value })} required disabled={isLocked} />
          </div>

          {/* 2. Policy section */}
          <div className="grid gap-1.5">
            <Label>Policy section</Label>
            <Input
              value={state.sourcePolicySection}
              onChange={(e) => setState({ ...state, sourcePolicySection: e.target.value })}
              placeholder="e.g. § 3.2 — TNS Operating P&P v2.1"
              disabled={isLocked}
            />
          </div>

          {/* 3. Description */}
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={state.description}
              onChange={(e) => setState({ ...state, description: e.target.value })}
              disabled={isLocked}
            />
          </div>

          {/* 4. Cadence */}
          <div className="grid gap-1.5">
            <Label>Cadence</Label>
            <Select
              value={state.cadence}
              onValueChange={(v) => {
                const cadence = v as Cadence;
                const defaults: Record<Cadence, Record<string, unknown>> = {
                  weekly: { weekday: 1 },
                  monthly: { day_of_month: 5 },
                  quarterly: { day_of_month: 15 },
                  annually: { month: 1, day_of_month: 1 },
                  per_event: { days_after_trigger: 30 },
                  one_time: { date: new Date().toISOString().slice(0, 10) },
                };
                setState({ ...state, cadence, dueDayConfig: defaults[cadence] });
              }}
              disabled={isLocked}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
                <SelectItem value="per_event">Per event</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Due date specifics */}
          <DueDayFields state={state} setState={setState} readOnly={isLocked} />

          {/* 6. Reminders */}
          <div className="grid gap-1.5">
            <Label>Reminders</Label>
            <div className="grid gap-1.5">
              {REMINDER_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={state.reminderDaysBefore.includes(opt.value)}
                    disabled={isLocked}
                    onCheckedChange={(v) => {
                      const set = new Set(state.reminderDaysBefore);
                      if (v === true) set.add(opt.value); else set.delete(opt.value);
                      setState({ ...state, reminderDaysBefore: Array.from(set).sort((a, b) => b - a) });
                    }}
                  />
                  {opt.label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={state.notifyManagerOnOverdue} disabled />
                Immediately when overdue (handled by the "Notify when overdue" admin setting below)
              </label>
            </div>
          </div>

          {/* 7. Evidence type */}
          <div className="grid gap-1.5">
            <Label>Evidence type</Label>
            <RadioGroup
              value={state.evidenceType}
              onValueChange={(v) => setState({ ...state, evidenceType: v as EvidenceType })}
              className="grid gap-2"
              disabled={isLocked}
            >
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="attestation" className="mt-0.5" />
                <span>
                  <span className="font-medium">Attestation</span>
                  <span className="block text-xs text-muted-foreground">Staff signs off with a typed statement.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="upload" className="mt-0.5" />
                <span>
                  <span className="font-medium">Upload</span>
                  <span className="block text-xs text-muted-foreground">Staff uploads a document as proof.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="upload_and_attestation" className="mt-0.5" />
                <span>
                  <span className="font-medium">Upload + Attestation</span>
                  <span className="block text-xs text-muted-foreground">Both a document and a signed statement.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="form" className="mt-0.5" />
                <span>
                  <span className="font-medium">Form</span>
                  <span className="block text-xs text-muted-foreground">Completion is a published HIVE form submission.</span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* 8. Attestation text */}
          {needsAttestationText && (
            <div className="grid gap-1.5">
              <Label>Attestation text</Label>
              <Textarea
                value={state.attestationText}
                onChange={(e) => setState({ ...state, attestationText: e.target.value })}
                placeholder="The statement staff will sign, e.g. “I confirm I have posted the current grievance poster in a visible location.”"
                required
                disabled={isLocked}
              />
            </div>
          )}

          {/* 8b. NECTAR document validation — only for upload evidence */}
          {(state.evidenceType === "upload" || state.evidenceType === "upload_and_attestation") && (
            <div className="grid gap-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">NECTAR document validation</p>
                <p className="text-xs text-muted-foreground">
                  Optional — when set, NECTAR reads uploaded evidence and checks it matches before marking this complete.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label>Expected certificate type</Label>
                <Input
                  value={state.nectarCertTypeLabel}
                  onChange={(e) => setState({ ...state, nectarCertTypeLabel: e.target.value })}
                  placeholder="e.g. CPR/First Aid Certification"
                  disabled={isLocked}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Validation keywords</Label>
                {state.nectarKeywordGroups.map((g, idx) => (
                  <div key={idx} className="grid gap-1.5 rounded-md border border-border/60 p-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={g.label}
                        onChange={(e) => {
                          const next = [...state.nectarKeywordGroups];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setState({ ...state, nectarKeywordGroups: next });
                        }}
                        placeholder="Group label, e.g. CPR"
                        disabled={isLocked}
                        className="flex-1"
                      />
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => setState({
                            ...state,
                            nectarKeywordGroups: state.nectarKeywordGroups.filter((_, i) => i !== idx),
                          })}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove keyword group"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Input
                      value={g.any_of.join(", ")}
                      onChange={(e) => {
                        const next = [...state.nectarKeywordGroups];
                        next[idx] = { ...next[idx], any_of: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                        setState({ ...state, nectarKeywordGroups: next });
                      }}
                      placeholder="Comma-separated terms, e.g. cpr, cardiopulmonary resuscitation"
                      disabled={isLocked}
                    />
                  </div>
                ))}
                {!isLocked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => setState({
                      ...state,
                      nectarKeywordGroups: [...state.nectarKeywordGroups, { label: "", any_of: [] }],
                    })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add keyword group
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 9. Linked form */}
          {state.evidenceType === "form" && (
            <div className="grid gap-1.5">
              <Label>Linked form</Label>
              <Select
                value={state.linkedFormId ?? undefined}
                onValueChange={(v) => setState({ ...state, linkedFormId: v })}
                disabled={isLocked}
              >
                <SelectTrigger><SelectValue placeholder="Select a published form" /></SelectTrigger>
                <SelectContent>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLocked && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("/dashboard/forms", "_blank")}
                  >
                    Create new form →
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => refetchForms()}>
                    Refresh list
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 10. Completion model */}
          {state.assignedToGroups.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Completion model</Label>
              <RadioGroup
                value={state.requiresIndividualCompletion ? "individual" : "any"}
                onValueChange={(v) => setState({ ...state, requiresIndividualCompletion: v === "individual" })}
                className="grid gap-2"
                disabled={isLocked}
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="any" /> Any one person
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="individual" /> Everyone individually
                </label>
              </RadioGroup>
            </div>
          )}

          {/* 11. Assigned to */}
          <div className="grid gap-2">
            <Label>Groups</Label>
            <div className="grid gap-1.5 rounded-md border border-border p-2">
              {groups.length === 0 && (
                <p className="px-1 py-1 text-sm text-muted-foreground">No groups yet — create one in Settings → Team Access → Groups.</p>
              )}
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={state.assignedToGroups.includes(g.id)}
                    disabled={isLocked}
                    onCheckedChange={(v) => {
                      const set = new Set(state.assignedToGroups);
                      if (v === true) set.add(g.id); else set.delete(g.id);
                      setState({ ...state, assignedToGroups: Array.from(set) });
                    }}
                  />
                  {g.name} <span className="text-muted-foreground">({g.member_count} members)</span>
                </label>
              ))}
            </div>

            <Label className="mt-2">Individual staff</Label>
            <div className="flex flex-wrap gap-1.5">
              {state.assignedToUsers.map((uid) => (
                <Badge key={uid} variant="secondary" className="gap-1">
                  {userNames.get(uid) ?? uid}
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setState({ ...state, assignedToUsers: state.assignedToUsers.filter((x) => x !== uid) })}
                      className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-foreground/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {!isLocked && (
              <StaffPickerCombobox
                orgId={orgId}
                excludeIds={excludeUserIds}
                onSelect={(id, name) => {
                  setState({ ...state, assignedToUsers: [...state.assignedToUsers, id] });
                  setUserNames((m) => new Map(m).set(id, name));
                }}
              />
            )}

            <Label className="mt-2">Who can complete it</Label>
            <Select
              value={state.assigneeRole}
              onValueChange={(v) => setState({ ...state, assigneeRole: v as AssigneeRole })}
              disabled={isLocked}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any_assigned">Any assigned staff</SelectItem>
                <SelectItem value="managers_only">Managers only</SelectItem>
                <SelectItem value="admin_only">Admin only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 12. Admin notifications */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-medium">
              Admin notifications
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-2 px-1 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.notifyManagerOnComplete}
                  disabled={isLocked}
                  onCheckedChange={(v) => setState({ ...state, notifyManagerOnComplete: v === true })}
                />
                Notify when someone completes
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.notifyManagerOnOverdue}
                  disabled={isLocked}
                  onCheckedChange={(v) => setState({ ...state, notifyManagerOnOverdue: v === true })}
                />
                Notify when overdue
              </label>
            </CollapsibleContent>
          </Collapsible>

          {/* 13. Active toggle */}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Only meaningful when editing an existing obligation.</p>
            </div>
            <Switch checked={state.active} disabled={isLocked} onCheckedChange={(v) => setState({ ...state, active: v })} />
          </div>
        </div>

        <SheetFooter className="gap-2 sm:justify-end">
          {isLocked ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                Save obligation
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
