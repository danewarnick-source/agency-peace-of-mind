import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Mail, Plus, ShieldPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createEmployeeManually } from "@/lib/employees.functions";
import { createInvitation, resendInvitation } from "@/lib/invitations.functions";
import { interpretInviteSendResult } from "@/lib/invite-send-result";
import { resolveAuthOrigin } from "@/lib/auth-redirect";
import { generateTempPassword } from "@/lib/temp-password";
import { uniqueHireEmails } from "@/lib/employee-roster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  normalizeConfig,
  WORKER_TYPE_OPTIONS,
  type StaffIntakeFieldsConfig,
} from "@/components/hr/staff-fields-panel";

type Role = "admin" | "manager" | "employee";

type HireDraft = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  hireDate: string;
  staffType: string[];
  department: string;
  employeeId: string;
  workerType: string;
  customFieldValues: Record<string, unknown>;
};

type CreatedEmployee = {
  draftId: string;
  userId: string;
  name: string;
  email: string;
  password: string;
  role: Role;
};

function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyDraft(): HireDraft {
  return {
    id: newDraftId(),
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "employee",
    hireDate: "",
    staffType: [],
    department: "",
    employeeId: "",
    workerType: "",
    customFieldValues: {},
  };
}

function fieldId(name: string, index: number): string {
  return index === 0 ? name : `${name}_${index}`;
}

export function AddEmployeeWizard({
  open,
  onOpenChange,
  organizationId,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  onOpenSettings: () => void;
}) {
  const qc = useQueryClient();
  const createManual = useServerFn(createEmployeeManually);
  const createInviteFn = useServerFn(createInvitation);
  const resendInviteFn = useServerFn(resendInvitation);

  const [step, setStep] = useState<"details" | "access">("details");
  const [drafts, setDrafts] = useState<HireDraft[]>(() => [emptyDraft()]);
  const [created, setCreated] = useState<CreatedEmployee[]>([]);
  const [inviteIds, setInviteIds] = useState<Set<string>>(() => new Set());
  const [shownPasswords, setShownPasswords] = useState<Set<string>>(() => new Set());

  const resetAll = () => {
    setStep("details");
    setDrafts([emptyDraft()]);
    setCreated([]);
    setInviteIds(new Set());
    setShownPasswords(new Set());
  };

  const { data: staffIntakeConfig } = useQuery({
    enabled: !!organizationId && open,
    queryKey: ["staff-intake-fields", organizationId],
    queryFn: async (): Promise<StaffIntakeFieldsConfig> => {
      const { data } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("feature_config" as any)
        .eq("id", organizationId!)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fc = (data as any)?.feature_config ?? null;
      return normalizeConfig(fc?.staff_intake_fields);
    },
  });

  const patchDraft = (id: string, patch: Partial<HireDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const createMutation = useMutation({
    mutationFn: async (rows: HireDraft[]) => {
      if (!organizationId) throw new Error("No organization selected.");
      const dup = uniqueHireEmails(rows.map((r) => r.email));
      if (dup) throw new Error(`${dup} is listed more than once.`);

      const made: CreatedEmployee[] = [];
      const errors: string[] = [];
      for (const row of rows) {
        const password = generateTempPassword();
        try {
          const res = await createManual({
            data: {
              organizationId,
              firstName: row.firstName.trim(),
              lastName: row.lastName.trim(),
              email: row.email.trim(),
              phone: row.phone.trim(),
              temporaryPassword: password,
              role: row.role,
              hireDate: row.hireDate,
              startDate: row.hireDate,
              trackIds: [],
              requiresDeescalation: false,
              requiresAbi: false,
              staffType: row.staffType,
              department: row.department,
              employeeId: row.employeeId,
              workerType: row.workerType,
              customFieldValues: row.customFieldValues,
            },
          });
          made.push({
            draftId: row.id,
            userId: res?.userId || "",
            name: `${row.firstName.trim()} ${row.lastName.trim()}`.trim(),
            email: row.email.trim(),
            password,
            role: row.role,
          });
        } catch (e) {
          const who = `${row.firstName.trim()} ${row.lastName.trim()}`.trim() || row.email.trim();
          errors.push(`${who}: ${e instanceof Error ? e.message : "Could not create."}`);
        }
      }
      if (!made.length) {
        throw new Error(errors.join(" ") || "Could not create employees.");
      }
      return { made, errors };
    },
    onSuccess: ({ made, errors }) => {
      if (errors.length) {
        toast.warning(`Created ${made.length}. ${errors.join(" ")}`);
      } else {
        toast.success(made.length === 1 ? "Employee file created" : `${made.length} employee files created`);
      }
      setCreated(made);
      setInviteIds(new Set());
      setStep("access");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async (targets: CreatedEmployee[]) => {
      if (!organizationId) throw new Error("No organization selected.");
      const site_origin = resolveAuthOrigin();
      const results: string[] = [];
      // Same rail as Pending invitations → Resend (createInvitation / resendInvitation).
      // inviteStaffMembers is a different RPC that can resolve undefined; do not read `.sent` on it.
      for (const row of targets) {
        const email = row.email.trim().toLowerCase();
        try {
          let raw: unknown;
          try {
            raw = await createInviteFn({
              data: { organization_id: organizationId, email, role: row.role, site_origin },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (!/pending invitation already exists/i.test(msg)) throw e;
            const { data: pending, error } = await supabase
              .from("invitations")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("email", email)
              .eq("status", "pending")
              .maybeSingle();
            if (error) throw new Error(error.message);
            if (!pending?.id) throw e;
            raw = await resendInviteFn({
              data: { organization_id: organizationId, invitation_id: pending.id, site_origin },
            });
          }
          const out = interpretInviteSendResult(raw);
          if (out.rpc_failure) throw new Error(out.message);
          results.push(
            out.email_sent
              ? `Invite emailed to ${out.email ?? email}.`
              : out.email_error
                ? `Invitation created for ${email}, but the email couldn't be sent (${out.email_error}).`
                : `${email}: ${out.message}`,
          );
        } catch (e) {
          results.push(`${email}: ${e instanceof Error ? e.message : "Invite failed."}`);
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const failed = results.some((r) => !/^Invite emailed/.test(r));
      if (failed) toast.warning(results.join(" · "));
      else toast.success(results.join(" · "));
      qc.invalidateQueries({ queryKey: ["invites"] });
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = (goToProfile: boolean) => {
    const id = created.length === 1 ? created[0]?.userId : "";
    onOpenChange(false);
    resetAll();
    if (goToProfile && id) window.location.href = `/dashboard/employees/${id}?tab=record`;
  };

  const submitDetails = () => {
    if (!organizationId) {
      toast.error("No organization selected.");
      return;
    }
    const missing = drafts.find((d) =>
      !d.firstName.trim() || !d.lastName.trim() || !d.email.trim() || !d.phone.trim() || !d.hireDate,
    );
    if (missing) {
      toast.error("Each employee needs a first name, last name, email, phone, and hire date.");
      return;
    }
    createMutation.mutate(drafts);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAll();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add employee</DialogTitle>
              <DialogDescription>
                Creates the full staff record first. You can send a join email or copy a temporary password after.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitDetails();
              }}
              className="grid gap-4"
            >
              {drafts.map((draft, index) => (
                <HireDraftFields
                  key={draft.id}
                  draft={draft}
                  index={index}
                  showHeader={drafts.length > 1}
                  canRemove={drafts.length > 1}
                  staffIntakeConfig={staffIntakeConfig}
                  onOpenSettings={onOpenSettings}
                  onChange={(patch) => patchDraft(draft.id, patch)}
                  onRemove={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}
              >
                <Plus className="mr-2 h-4 w-4" /> Add another employee
              </Button>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !organizationId}
                  className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                >
                  {createMutation.isPending
                    ? "Creating…"
                    : drafts.length === 1
                      ? "Create employee"
                      : `Create ${drafts.length} employees`}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send invites?</DialogTitle>
              <DialogDescription>
                Check who should get a join email. Nothing is sent unless you choose it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {created.map((row) => (
                <AccessCard
                  key={row.draftId}
                  row={row}
                  checked={inviteIds.has(row.draftId)}
                  showPassword={shownPasswords.has(row.draftId)}
                  onCheckedChange={(next) => {
                    setInviteIds((prev) => {
                      const copy = new Set(prev);
                      if (next) copy.add(row.draftId);
                      else copy.delete(row.draftId);
                      return copy;
                    });
                  }}
                  onShowPassword={() =>
                    setShownPasswords((prev) => {
                      const next = new Set(prev);
                      next.add(row.draftId);
                      return next;
                    })
                  }
                />
              ))}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => finish(false)}>
                Don&apos;t invite yet
              </Button>
              <Button
                type="button"
                disabled={!inviteIds.size || inviteMutation.isPending || !organizationId}
                className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                onClick={() => inviteMutation.mutate(created.filter((row) => inviteIds.has(row.draftId)))}
              >
                <Mail className="mr-2 h-4 w-4" />
                {inviteMutation.isPending
                  ? "Sending…"
                  : `Send ${inviteIds.size} invite${inviteIds.size === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccessCard({
  row,
  checked,
  showPassword,
  onCheckedChange,
  onShowPassword,
}: {
  row: CreatedEmployee;
  checked: boolean;
  showPassword: boolean;
  onCheckedChange: (checked: boolean) => void;
  onShowPassword: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <span className="font-medium">{row.name}</span>
        <code className="truncate text-xs text-muted-foreground">{row.email}</code>
      </label>
      <Button type="button" variant="outline" onClick={onShowPassword}>
        <KeyRound className="mr-2 h-4 w-4" /> Show temporary password
      </Button>
      {showPassword && (
        <div className="grid gap-2 rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground">Temporary password · shown once</div>
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-secondary p-2 text-sm">{row.password}</code>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(row.password);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">They will be asked to change this on first sign-in.</p>
        </div>
      )}
    </div>
  );
}

function HireDraftFields({
  draft,
  index,
  showHeader,
  canRemove,
  staffIntakeConfig,
  onOpenSettings,
  onChange,
  onRemove,
}: {
  draft: HireDraft;
  index: number;
  showHeader: boolean;
  canRemove: boolean;
  staffIntakeConfig: StaffIntakeFieldsConfig | undefined;
  onOpenSettings: () => void;
  onChange: (patch: Partial<HireDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={showHeader ? "grid gap-4 rounded-md border border-border p-3" : "grid gap-4"}>
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Employee {index + 1}
          </p>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onRemove}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={fieldId("first_name", index)}>First name</Label>
          <Input
            id={fieldId("first_name", index)}
            value={draft.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fieldId("last_name", index)}>Last name</Label>
          <Input
            id={fieldId("last_name", index)}
            value={draft.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("email", index)}>
          Email address · used for sign-in <span className="text-destructive">*</span>
        </Label>
        <Input
          id={fieldId("email", index)}
          type="email"
          value={draft.email}
          onChange={(e) => onChange({ email: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("phone", index)}>Phone number</Label>
        <Input
          id={fieldId("phone", index)}
          type="tel"
          value={draft.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("hire_date", index)}>
          Hire date <span className="text-destructive">*</span>
        </Label>
        <Input
          id={fieldId("hire_date", index)}
          type="date"
          value={draft.hireDate}
          onChange={(e) => onChange({ hireDate: e.target.value })}
          required
        />
        <p className="text-xs text-muted-foreground">All training deadlines are calculated from this date.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("role", index)}>Role</Label>
        <Select value={draft.role} onValueChange={(v) => onChange({ role: v as Role })}>
          <SelectTrigger id={fieldId("role", index)}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <OptionalIntakeFields
        config={staffIntakeConfig}
        staffType={draft.staffType}
        onStaffTypeChange={(staffType) => onChange({ staffType })}
        department={draft.department}
        onDepartmentChange={(department) => onChange({ department })}
        employeeId={draft.employeeId}
        onEmployeeIdChange={(employeeId) => onChange({ employeeId })}
        workerType={draft.workerType}
        onWorkerTypeChange={(workerType) => onChange({ workerType })}
        customFieldValues={draft.customFieldValues}
        onCustomFieldValuesChange={(customFieldValues) => onChange({ customFieldValues })}
        onOpenSettings={onOpenSettings}
        idSuffix={index === 0 ? "" : `-${index}`}
      />
    </div>
  );
}

export function AddEmployeeButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]" onClick={onClick} disabled={disabled}>
      <ShieldPlus className="mr-2 h-4 w-4" /> Add employee
    </Button>
  );
}

function OptionalIntakeFields({
  config,
  staffType, onStaffTypeChange,
  department, onDepartmentChange,
  employeeId, onEmployeeIdChange,
  workerType, onWorkerTypeChange,
  customFieldValues, onCustomFieldValuesChange,
  onOpenSettings,
  idSuffix = "",
}: {
  config: StaffIntakeFieldsConfig | undefined;
  staffType: string[];
  onStaffTypeChange: (v: string[]) => void;
  department: string;
  onDepartmentChange: (v: string) => void;
  employeeId: string;
  onEmployeeIdChange: (v: string) => void;
  workerType: string;
  onWorkerTypeChange: (v: string) => void;
  customFieldValues: Record<string, unknown>;
  onCustomFieldValuesChange: (v: Record<string, unknown>) => void;
  onOpenSettings: () => void;
  idSuffix?: string;
}) {
  if (!config) return null;

  const atHireCustomFields = config.custom_fields.filter((f) => f.at_hire);
  const hasAnyOptionalField =
    config.staff_type.enabled ||
    config.department.enabled ||
    config.employee_id.enabled ||
    config.worker_type.enabled ||
    atHireCustomFields.length > 0;

  const setCustomFieldValue = (id: string, value: unknown) => {
    onCustomFieldValuesChange({ ...customFieldValues, [id]: value });
  };

  if (!hasAnyOptionalField) {
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          No optional fields configured.{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onOpenSettings}>
            Configure staff fields
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your organization's fields
      </p>

      {!config.staff_type.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <span>
            Staff type is not enabled — training requirements won't auto-activate until set on this staff
            member's profile. Enable in staff field settings.
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onOpenSettings}>
            Open settings
          </Button>
        </div>
      )}

      {config.staff_type.enabled && (
        <div className="grid gap-2">
          <Label>Staff type · drives training requirements</Label>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {(config.staff_type.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={staffType.includes(opt)}
                  onCheckedChange={(v) => {
                    onStaffTypeChange(
                      v === true ? [...staffType, opt] : staffType.filter((s) => s !== opt),
                    );
                  }}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}

      {config.department.enabled && (
        <div className="grid gap-2">
          <Label>Department</Label>
          <Select value={department} onValueChange={onDepartmentChange}>
            <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
            <SelectContent>
              {(config.department.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.employee_id.enabled && (
        <div className="grid gap-2">
          <Label htmlFor={`employee_id${idSuffix}`}>Employee ID (optional)</Label>
          <Input
            id={`employee_id${idSuffix}`}
            value={employeeId}
            onChange={(e) => onEmployeeIdChange(e.target.value)}
          />
        </div>
      )}

      {config.worker_type.enabled && (
        <div className="grid gap-2">
          <Label>Worker type</Label>
          <Select value={workerType} onValueChange={onWorkerTypeChange}>
            <SelectTrigger><SelectValue placeholder="Select worker type" /></SelectTrigger>
            <SelectContent>
              {WORKER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {atHireCustomFields.map((field) => (
        <div key={field.id} className="grid gap-2">
          <Label htmlFor={`cf-${field.id}${idSuffix}`} className="flex items-center gap-2">
            {field.name}
            <Badge variant="outline" className="text-[10px]">Custom</Badge>
          </Label>
          {field.type === "text" && (
            <Input
              id={`cf-${field.id}${idSuffix}`}
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "date" && (
            <Input
              id={`cf-${field.id}${idSuffix}`}
              type="date"
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "number" && (
            <Input
              id={`cf-${field.id}${idSuffix}`}
              type="number"
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "yesno" && (
            <Select
              value={(customFieldValues[field.id] as string) ?? ""}
              onValueChange={(v) => setCustomFieldValue(field.id, v)}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          )}
          {field.type === "dropdown" && (
            <Select
              value={(customFieldValues[field.id] as string) ?? ""}
              onValueChange={(v) => setCustomFieldValue(field.id, v)}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
    </div>
  );
}
