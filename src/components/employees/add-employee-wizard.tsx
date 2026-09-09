import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Mail, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createEmployeeManually } from "@/lib/employees.functions";
import { inviteStaffMembers } from "@/lib/invitations.functions";
import { interpretInviteSendResult } from "@/lib/invite-send-result";
import { resolveAuthOrigin } from "@/lib/auth-redirect";
import { generateTempPassword } from "@/lib/temp-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TrainingRequirementField } from "@/components/hr/training-requirement-field";
import {
  normalizeConfig,
  WORKER_TYPE_OPTIONS,
  type StaffIntakeFieldsConfig,
} from "@/components/hr/staff-fields-panel";

type Role = "admin" | "manager" | "employee";

type CreatedEmployee = {
  userId: string;
  email: string;
  password: string;
};

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
  const inviteFn = useServerFn(inviteStaffMembers);

  const [step, setStep] = useState<"details" | "access">("details");
  const [created, setCreated] = useState<CreatedEmployee | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("employee");
  const [requiresDeescalation, setRequiresDeescalation] = useState(true);
  const [requiresAbi, setRequiresAbi] = useState(true);
  const [staffType, setStaffType] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [workerType, setWorkerType] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});

  const resetOptional = () => {
    setStaffType([]);
    setDepartment("");
    setEmployeeId("");
    setWorkerType("");
    setCustomFieldValues({});
    setRequiresDeescalation(true);
    setRequiresAbi(true);
    setRole("employee");
  };

  const resetAll = () => {
    setStep("details");
    setCreated(null);
    setShowPassword(false);
    resetOptional();
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

  const { data: tracks } = useQuery({
    enabled: !!organizationId && open,
    queryKey: ["tracks-mini", organizationId],
    queryFn: async () => {
      const { data } = await supabase.from("training_tracks").select("id, name").eq("is_published", true);
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      role: Role;
      startDate: string;
      endDate: string;
      trackIds: string[];
      password: string;
    }) => {
      if (!organizationId) throw new Error("No organization selected.");
      if (input.startDate && input.endDate && input.endDate < input.startDate) {
        throw new Error("End date must be on or after Start date.");
      }
      return await createManual({
        data: {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          temporaryPassword: input.password,
          role: input.role,
          hireDate: input.startDate,
          startDate: input.startDate,
          endDate: input.endDate,
          trackIds: input.trackIds,
          requiresDeescalation,
          requiresAbi,
          staffType,
          department,
          employeeId,
          workerType,
          customFieldValues,
        },
      });
    },
    onSuccess: (res, vars) => {
      toast.success("Employee file created");
      setCreated({
        userId: res?.userId || "",
        email: vars.email,
        password: vars.password,
      });
      setStep("access");
      resetOptional();
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !created) throw new Error("No organization selected.");
      const raw = await inviteFn({
        data: {
          organization_id: organizationId,
          site_origin: resolveAuthOrigin(),
          user_ids: created.userId ? [created.userId] : [],
          emails: created.email ? [created.email] : [],
          role,
          force: true,
        },
      });
      const out = interpretInviteSendResult(raw);
      if (out.rpc_failure) throw new Error(out.message);
      return out;
    },
    onSuccess: (out) => {
      if (out.email_sent) {
        toast.success(`Invite emailed to ${out.email ?? created?.email ?? "the employee"}.`);
      } else if (out.results[0]?.status === "created_unsent" || out.email_error) {
        toast.warning(
          `Invitation created, but the email couldn't be sent (${out.email_error ?? "unknown error"}). Share the join link from Pending invitations.`,
        );
      } else {
        toast.warning(out.message);
      }
      qc.invalidateQueries({ queryKey: ["invites"] });
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = (goToProfile: boolean) => {
    const id = created?.userId;
    onOpenChange(false);
    resetAll();
    if (goToProfile && id) window.location.href = `/dashboard/employees/${id}?tab=record`;
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
                if (!organizationId) {
                  toast.error("No organization selected.");
                  return;
                }
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  firstName: String(fd.get("first_name") || "").trim(),
                  lastName: String(fd.get("last_name") || "").trim(),
                  email: String(fd.get("email") || "").trim(),
                  phone: String(fd.get("phone") || "").trim(),
                  role,
                  startDate: String(fd.get("hire_date") || ""),
                  endDate: String(fd.get("end_date") || ""),
                  trackIds: (fd.getAll("track_ids") as string[]).filter(Boolean),
                  password: generateTempPassword(),
                });
              }}
              className="grid gap-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="first_name">First name</Label>
                  <Input id="first_name" name="first_name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input id="last_name" name="last_name" required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">
                  Email address · used for sign-in <span className="text-destructive">*</span>
                </Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" name="phone" type="tel" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="hire_date">
                    Hire date <span className="text-destructive">*</span>
                  </Label>
                  <Input id="hire_date" name="hire_date" type="date" required />
                  <p className="text-xs text-muted-foreground">All training deadlines are calculated from this date.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">End date (optional)</Label>
                  <Input id="end_date" name="end_date" type="date" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <OptionalIntakeFields
                config={staffIntakeConfig}
                staffType={staffType}
                onStaffTypeChange={setStaffType}
                department={department}
                onDepartmentChange={setDepartment}
                employeeId={employeeId}
                onEmployeeIdChange={setEmployeeId}
                workerType={workerType}
                onWorkerTypeChange={setWorkerType}
                customFieldValues={customFieldValues}
                onCustomFieldValuesChange={setCustomFieldValues}
                onOpenSettings={onOpenSettings}
              />

              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Behavior-related training requirements
                </p>
                <TrainingRequirementField
                  label="De-escalation training"
                  hint="Typically required for staff assigned to a behavior-coded client (BC1/2/3) or a client with a Behavior Support Plan."
                  value={requiresDeescalation}
                  onChange={setRequiresDeescalation}
                  atRisk={false}
                  warningText=""
                />
                <TrainingRequirementField
                  label="ABI training"
                  hint="Typically required for staff assigned to a client with an ABI (acquired brain injury) designation."
                  value={requiresAbi}
                  onChange={setRequiresAbi}
                  atRisk={false}
                  warningText=""
                />
              </div>

              {!!tracks?.length && (
                <div className="grid gap-2">
                  <Label>Assigned training tracks</Label>
                  <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                    {tracks.map((t) => (
                      <label key={t.id} className="flex items-center gap-2">
                        <input type="checkbox" name="track_ids" value={t.id} className="rounded" />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !organizationId}
                  className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                >
                  {createMutation.isPending ? "Creating…" : "Create employee"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>How should they sign in?</DialogTitle>
              <DialogDescription>
                The employee file is complete. Send a join email, or copy a temporary password for same-day access.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="text-xs text-muted-foreground">Login</div>
                <code className="block truncate">{created?.email}</code>
              </div>
              <Button
                type="button"
                className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                disabled={inviteMutation.isPending}
                onClick={() => inviteMutation.mutate()}
              >
                <Mail className="mr-2 h-4 w-4" />
                {inviteMutation.isPending ? "Sending…" : "Send invite email"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowPassword(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> Show temporary password
              </Button>
              {showPassword && created && (
                <div className="grid gap-2 rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Temporary password · shown once</div>
                  <div className="flex gap-2">
                    <code className="flex-1 rounded bg-secondary p-2 text-sm">{created.password}</code>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(created.password);
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
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => finish(false)}>
                Skip for now
              </Button>
              <Button type="button" onClick={() => finish(true)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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
          <Label htmlFor="employee_id">Employee ID (optional)</Label>
          <Input
            id="employee_id"
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
          <Label htmlFor={`cf-${field.id}`} className="flex items-center gap-2">
            {field.name}
            <Badge variant="outline" className="text-[10px]">Custom</Badge>
          </Label>
          {field.type === "text" && (
            <Input
              id={`cf-${field.id}`}
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "date" && (
            <Input
              id={`cf-${field.id}`}
              type="date"
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "number" && (
            <Input
              id={`cf-${field.id}`}
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
