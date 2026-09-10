import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { Copy, Download, FileSpreadsheet, KeyRound, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyEmployeeRosterRow } from "@/lib/employees.functions";
import { createInvitation, resendInvitation } from "@/lib/invitations.functions";
import { interpretInviteSendResult } from "@/lib/invite-send-result";
import { resolveAuthOrigin } from "@/lib/auth-redirect";
import { generateTempPassword } from "@/lib/temp-password";
import {
  type EmployeeInviteRole,
  type EmployeeRosterDraft,
  type EmployeeRosterHeader,
  type EmployeeRosterUploadMode,
  classifyRosterRowAction,
  parseEmployeeRosterCsv,
  parseEmployeeRosterRecords,
  parseEmployeeRosterRole,
  rosterRowHasFieldIssue,
  toInviteRole,
  triggerEmployeeRosterTemplateDownload,
  validateEmployeeRosterRows,
} from "@/lib/employee-roster-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type CreatedRow = {
  draftId: string;
  userId: string;
  name: string;
  email: string;
  password: string;
  role: EmployeeInviteRole;
  action: "created" | "updated";
};

const MODE_OPTIONS: Array<{ id: EmployeeRosterUploadMode; title: string; hint: string }> = [
  { id: "add_new", title: "Add new only", hint: "Skip emails already on this roster." },
  { id: "add_and_update", title: "Add new and update existing", hint: "Match on email. New rows are created; existing rows are updated." },
  { id: "update_only", title: "Update existing only", hint: "Only change people already on this roster. New emails are skipped." },
];

async function parseRosterFile(file: File): Promise<{ rows: EmployeeRosterDraft[]; ignoredColumns: string[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseEmployeeRosterCsv(await file.text());
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return { rows: [], ignoredColumns: [] };
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headers = json.length ? Object.keys(json[0] ?? {}) : [];
  const records = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });
  return parseEmployeeRosterRecords(records, headers);
}

export function EmployeeRosterUploadWizard({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
}) {
  const qc = useQueryClient();
  const applyRow = useServerFn(applyEmployeeRosterRow);
  const createInviteFn = useServerFn(createInvitation);
  const resendInviteFn = useServerFn(resendInvitation);

  const [step, setStep] = useState<"upload" | "preview" | "access">("upload");
  const [mode, setMode] = useState<EmployeeRosterUploadMode>("add_new");
  const [rows, setRows] = useState<EmployeeRosterDraft[]>([]);
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedRow[]>([]);
  const [inviteIds, setInviteIds] = useState<Set<string>>(() => new Set());
  const [shownPasswords, setShownPasswords] = useState<Set<string>>(() => new Set());

  const { data: existingEmails = [] } = useQuery({
    enabled: !!organizationId && open,
    queryKey: ["employee-roster-emails", organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error("No organization selected.");
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId);
      const ids = (members ?? []).map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, email" as any)
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((profs ?? []) as any[])
        .map((p) => String(p.email ?? "").trim().toLowerCase())
        .filter(Boolean);
    },
  });

  const actions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof classifyRosterRowAction>>();
    for (const row of rows) {
      map.set(row.id, classifyRosterRowAction(row.email, existingEmails, mode));
    }
    return map;
  }, [rows, existingEmails, mode]);

  const actionable = rows.filter((row) => actions.get(row.id) !== "skip");
  const issues = validateEmployeeRosterRows(actionable);
  const hasErrors = issues.size > 0;
  const createCount = actionable.filter((row) => actions.get(row.id) === "create").length;
  const updateCount = actionable.filter((row) => actions.get(row.id) === "update").length;
  const skipCount = rows.length - actionable.length;

  const resetAll = () => {
    setStep("upload");
    setMode("add_new");
    setRows([]);
    setIgnoredColumns([]);
    setCreated([]);
    setInviteIds(new Set());
    setShownPasswords(new Set());
  };

  const patchRow = (id: string, patch: Partial<EmployeeRosterDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No organization selected.");
      if (hasErrors) throw new Error("Fix the highlighted rows before applying the file.");
      if (!actionable.length) throw new Error("No rows to apply in this mode.");
      const made: CreatedRow[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];
      for (const row of actionable) {
        const planned = actions.get(row.id) ?? "create";
        const password = planned === "create" ? generateTempPassword() : "";
        try {
          const res = await applyRow({
            data: {
              organizationId,
              firstName: row.first_name.trim(),
              lastName: row.last_name.trim(),
              email: row.email.trim(),
              phone: row.phone.trim(),
              role: parseEmployeeRosterRole(row.role) ?? "employee",
              hireDate: row.hire_date,
              department: row.title.trim(),
              username: row.username.trim(),
              usernameProvided: row.username_provided,
              mode,
              temporaryPassword: password,
            },
          });
          if (res.action === "skipped") {
            skipped.push(`${row.email}: ${res.reason ?? "Skipped."}`);
            continue;
          }
          made.push({
            draftId: row.id,
            userId: res.userId || "",
            name: `${row.first_name.trim()} ${row.last_name.trim()}`.trim(),
            email: row.email.trim(),
            password,
            role: toInviteRole(row.role),
            action: res.action,
          });
        } catch (e) {
          const who = `${row.first_name} ${row.last_name}`.trim() || row.email;
          errors.push(`${who}: ${e instanceof Error ? e.message : "Could not apply."}`);
        }
      }
      if (!made.length) throw new Error(errors.join(" ") || skipped.join(" ") || "No staff rows applied.");
      return { made, skipped, errors };
    },
    onSuccess: ({ made, skipped, errors }) => {
      const extra = [...skipped, ...errors];
      if (extra.length) toast.warning(`Applied ${made.length}. ${extra.join(" ")}`);
      else toast.success(made.length === 1 ? "Staff row applied" : `${made.length} staff rows applied`);
      setCreated(made);
      setInviteIds(new Set());
      setStep("access");
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["employee-roster-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async (targets: CreatedRow[]) => {
      if (!organizationId) throw new Error("No organization selected.");
      const site_origin = resolveAuthOrigin();
      const results: string[] = [];
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

  const finish = () => {
    onOpenChange(false);
    resetAll();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseRosterFile(file);
      if (!parsed.rows.length) {
        toast.error("No staff rows found. Use the template columns.");
        return;
      }
      setRows(parsed.rows);
      setIgnoredColumns(parsed.ignoredColumns);
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const selected = created.filter((r) => inviteIds.has(r.draftId));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAll();
        onOpenChange(next);
      }}
    >
      <DialogContent className={step === "preview" ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>Upload roster</DialogTitle>
              <DialogDescription>
                Download the template, choose how to treat existing emails, then upload a CSV or Excel file. Client fields are ignored.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <ModePicker mode={mode} onChange={setMode} />
              <Button type="button" variant="outline" onClick={() => triggerEmployeeRosterTemplateDownload()}>
                <Download className="mr-2 h-4 w-4" /> Download template
              </Button>
              <label className="grid cursor-pointer gap-2 rounded-md border border-dashed border-border p-6 text-center text-sm">
                <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                <span>Drop a CSV or Excel file, or click to choose</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    void onFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Review staff rows</DialogTitle>
              <DialogDescription>
                Fix highlighted cells, then apply. Invites are not sent until the next step.
              </DialogDescription>
            </DialogHeader>
            <ModePicker mode={mode} onChange={setMode} />
            <p className="text-xs text-muted-foreground">
              {createCount} new
              {updateCount > 0 && ` · ${updateCount} update`}
              {skipCount > 0 && ` · ${skipCount} skip`}
            </p>
            {ignoredColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ignored columns: {ignoredColumns.join(", ")}.
              </p>
            )}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Action</th>
                    {previewFields.map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-semibold">{labelFor(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                        {actions.get(row.id) ?? "create"}
                      </td>
                      {previewFields.map((field) => (
                        <td key={field} className="px-2 py-1">
                          <Input
                            value={row[field]}
                            onChange={(e) => patchRow(row.id, field === "username"
                              ? { username: e.target.value, username_provided: true }
                              : { [field]: e.target.value })}
                            className={
                              "h-8 text-xs " +
                              (rosterRowHasFieldIssue(issues, row.id, field) ? "border-destructive" : "")
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasErrors && (
              <ul className="list-disc pl-5 text-xs text-destructive">
                {[...issues.values()].flat().slice(0, 8).map((issue, i) => (
                  <li key={`${issue.field}-${i}`}>{issue.message}</li>
                ))}
              </ul>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => { setRows([]); setStep("upload"); }}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!organizationId || !actionable.length || hasErrors || createMutation.isPending}
                className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending
                  ? "Applying…"
                  : applyLabel(createCount, updateCount)}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "access" && (
          <>
            <DialogHeader>
              <DialogTitle>Send invites?</DialogTitle>
              <DialogDescription>
                Check who should get a join email. Nothing is sent unless you choose it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {created.map((row) => (
                <div key={row.draftId} className="grid gap-2 rounded-md border border-border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={inviteIds.has(row.draftId)}
                      onCheckedChange={(v) => {
                        setInviteIds((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(row.draftId);
                          else next.delete(row.draftId);
                          return next;
                        });
                      }}
                    />
                    <span className="font-medium">{row.name}</span>
                    <code className="truncate text-xs text-muted-foreground">{row.email}</code>
                    <span className="text-xs text-muted-foreground">{row.action === "updated" ? "updated" : "new"}</span>
                  </label>
                  {row.password ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setShownPasswords((prev) => {
                              const next = new Set(prev);
                              next.add(row.draftId);
                              return next;
                            })
                          }
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" /> Show temporary password
                        </Button>
                      </div>
                      {shownPasswords.has(row.draftId) && (
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
                      )}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={finish}>
                Don&apos;t invite yet
              </Button>
              <Button
                type="button"
                disabled={!selected.length || inviteMutation.isPending || !organizationId}
                className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
                onClick={() => inviteMutation.mutate(selected)}
              >
                <Mail className="mr-2 h-4 w-4" />
                {inviteMutation.isPending ? "Sending…" : `Send ${selected.length} invite${selected.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeRosterUploadButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      <FileSpreadsheet className="mr-2 h-4 w-4" /> Upload roster
    </Button>
  );
}

function ModePicker({
  mode,
  onChange,
}: {
  mode: EmployeeRosterUploadMode;
  onChange: (mode: EmployeeRosterUploadMode) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">If an email is already on this roster</legend>
      {MODE_OPTIONS.map((opt) => (
        <label key={opt.id} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="radio"
            name="roster-upload-mode"
            className="mt-1"
            checked={mode === opt.id}
            onChange={() => onChange(opt.id)}
          />
          <span>
            <span className="font-medium">{opt.title}</span>
            <span className="block text-xs text-muted-foreground">{opt.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function applyLabel(createCount: number, updateCount: number): string {
  if (createCount && updateCount) return `Apply ${createCount} new, ${updateCount} update`;
  if (updateCount && !createCount) return `Update ${updateCount} staff`;
  return `Create ${createCount} staff`;
}

const previewFields: EmployeeRosterHeader[] = [
  "first_name", "last_name", "email", "phone", "role", "title", "hire_date", "username",
];

function labelFor(field: EmployeeRosterHeader): string {
  switch (field) {
    case "first_name": return "First name";
    case "last_name": return "Last name";
    case "email": return "Email";
    case "phone": return "Phone";
    case "role": return "Role";
    case "title": return "Title";
    case "hire_date": return "Hire date";
    case "username": return "Username";
  }
}
