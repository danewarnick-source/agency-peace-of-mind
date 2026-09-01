import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listStaffGroups, type StaffGroupRow } from "@/lib/staff-groups.functions";
import {
  addPackItem,
  assignObligationPack,
  attachExistingToPack,
  createObligationPack,
  type PackMatrix,
} from "@/lib/obligation-packs.functions";
import { type PackAssignSpec } from "@/lib/obligation-packs";

const ROLE_OPTIONS = [
  { key: "employee", label: "DSP / staff" },
  { key: "manager", label: "Manager" },
  { key: "program_manager", label: "Program manager" },
  { key: "admin", label: "Admin" },
] as const;

function AssignFields({
  assign,
  onChange,
  jobCodes,
  groups,
}: {
  assign: PackAssignSpec;
  onChange: (next: PackAssignSpec) => void;
  jobCodes: Array<{ key: string; label: string }>;
  groups: Array<StaffGroupRow & { member_count: number }>;
}) {
  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((x) => x !== key) : [...list, key];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-[var(--hive-text-muted)]">Assign by role</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((r) => {
            const on = assign.roles.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => onChange({ ...assign, roles: toggle(assign.roles, r.key) })}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  on
                    ? "border-[var(--hive-ink)] bg-[var(--hive-ink)] text-white"
                    : "border-[var(--hive-border)] text-[var(--hive-text-muted)] hover:bg-[#eef1f4]"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      {jobCodes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--hive-text-muted)]">Assign by job code</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {jobCodes.map((j) => {
              const on = assign.jobCodes.includes(j.key);
              return (
                <button
                  key={j.key}
                  type="button"
                  onClick={() => onChange({ ...assign, jobCodes: toggle(assign.jobCodes, j.key) })}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    on
                      ? "border-[var(--hive-ink)] bg-[var(--hive-ink)] text-white"
                      : "border-[var(--hive-border)] text-[var(--hive-text-muted)] hover:bg-[#eef1f4]"
                  }`}
                >
                  {j.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {groups.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--hive-text-muted)]">Staff groups</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.map((g) => {
              const on = assign.groupIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onChange({ ...assign, groupIds: toggle(assign.groupIds, g.id) })}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    on
                      ? "border-[var(--hive-ink)] bg-[var(--hive-ink)] text-white"
                      : "border-[var(--hive-border)] text-[var(--hive-text-muted)] hover:bg-[#eef1f4]"
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-[var(--hive-text-muted)]">
        Leave every chip off to assign the pack to all staff. Staff never pick a pack.
      </p>
    </div>
  );
}

export function CreatePackDialog({
  open,
  onOpenChange,
  orgId,
  jobCodes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  jobCodes: Array<{ key: string; label: string }>;
  onCreated: (packKey: string) => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createObligationPack);
  const listGroupsFn = useServerFn(listStaffGroups);
  const { data: groups = [] } = useQuery({
    queryKey: ["staff-groups", orgId],
    queryFn: () => listGroupsFn({ data: { organizationId: orgId } }),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [assign, setAssign] = useState<PackAssignSpec>({
    roles: [],
    jobCodes: [],
    groupIds: [],
    userIds: [],
  });

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: { organizationId: orgId, name: name.trim(), assign },
      }),
    onSuccess: (res) => {
      toast.success("Pack added");
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      onCreated(res.packKey);
      setName("");
      setAssign({ roles: [], jobCodes: [], groupIds: [], userIds: [] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-[var(--hive-border)] bg-[var(--hive-surface)]">
        <DialogHeader>
          <DialogTitle>New pack</DialogTitle>
          <DialogDescription>
            Name an internal pack, then add items. Assignment is by role or job code — staff do not
            shop for packs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pack-name">Pack name</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="House documents"
            />
          </div>
          <AssignFields
            assign={assign}
            onChange={setAssign}
            jobCodes={jobCodes}
            groups={groups}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={!name.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Creating…" : "Create pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignPackDialog({
  open,
  onOpenChange,
  orgId,
  packKey,
  packName,
  locked,
  initial,
  jobCodes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  packKey: string;
  packName: string;
  locked: boolean;
  initial: PackAssignSpec;
  jobCodes: Array<{ key: string; label: string }>;
}) {
  const qc = useQueryClient();
  const assignFn = useServerFn(assignObligationPack);
  const listGroupsFn = useServerFn(listStaffGroups);
  const { data: groups = [] } = useQuery({
    queryKey: ["staff-groups", orgId],
    queryFn: () => listGroupsFn({ data: { organizationId: orgId } }),
    enabled: open,
  });
  const [name, setName] = useState(packName);
  const [assign, setAssign] = useState<PackAssignSpec>(initial);

  const mut = useMutation({
    mutationFn: () =>
      assignFn({
        data: {
          organizationId: orgId,
          packKey,
          name: locked ? undefined : name.trim(),
          assign,
        },
      }),
    onSuccess: () => {
      toast.success("Pack assignment saved");
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-[var(--hive-border)] bg-[var(--hive-surface)]">
        <DialogHeader>
          <DialogTitle>Assign this pack</DialogTitle>
          <DialogDescription>
            {locked
              ? "System packs stay named. You can still target who receives the items."
              : "Rename the pack and choose who it applies to."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-pack-name">Pack name</Label>
            <Input
              id="assign-pack-name"
              value={locked ? packName : name}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <AssignFields
            assign={assign}
            onChange={setAssign}
            jobCodes={jobCodes}
            groups={groups}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddPackItemDialog({
  open,
  onOpenChange,
  orgId,
  packKey,
  packName,
  matrix,
  initialStep = "choose",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  packKey: string;
  packName: string;
  matrix: PackMatrix | undefined;
  initialStep?: "choose" | "existing" | "upload" | "attest";
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addPackItem);
  const attachFn = useServerFn(attachExistingToPack);
  const [step, setStep] = useState<"choose" | "existing" | "upload" | "attest">(initialStep);
  useEffect(() => {
    if (open) setStep(initialStep);
  }, [open, initialStep]);
  const [title, setTitle] = useState("");
  const [required, setRequired] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);

  const existing = useMemo(
    () => (matrix?.existingItems ?? []).filter((i) => i.packKey !== packKey),
    [matrix?.existingItems, packKey],
  );

  const addMut = useMutation({
    mutationFn: (kind: "upload" | "attest") =>
      addFn({
        data: {
          organizationId: orgId,
          packKey,
          title: title.trim(),
          kind,
          required,
          packName,
        },
      }),
    onSuccess: () => {
      toast.success("Item added");
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      void qc.invalidateQueries({ queryKey: ["company-obligations"] });
      setTitle("");
      setStep("choose");
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const attachMut = useMutation({
    mutationFn: async () => {
      for (const obligationId of picked) {
        await attachFn({
          data: { organizationId: orgId, packKey, obligationId, packName },
        });
      }
    },
    onSuccess: () => {
      toast.success("Existing items added");
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      setPicked([]);
      setStep("choose");
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        setStep(v ? initialStep : "choose");
      }}
    >
      <DialogContent className="max-w-lg border-[var(--hive-border)] bg-[var(--hive-surface)]">
        <DialogHeader>
          <DialogTitle>
            {step === "choose"
              ? "Add to pack"
              : step === "existing"
                ? "Existing item"
                : step === "upload"
                  ? "Request a file upload"
                  : "Item to complete or attest"}
          </DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? `Add a column on ${packName}. Do not add a government tax form as a Hive product — optional uploads are allowed if your agency needs them.`
              : step === "existing"
                ? "Move an existing obligation onto this pack tab."
                : step === "upload"
                  ? "Staff upload a card or file. Completing it greens the cell."
                  : "Staff read and attest, or an admin marks it complete."}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setStep("existing")}
              className="flex items-start gap-3 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 py-3 text-left hover:border-[var(--hive-ink)]/30"
            >
              <FileUp className="mt-0.5 h-4 w-4 text-[var(--hive-text-muted)]" />
              <span>
                <span className="block text-sm font-medium">Existing item</span>
                <span className="text-xs text-[var(--hive-text-muted)]">
                  Use something already in the register.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="flex items-start gap-3 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 py-3 text-left hover:border-[var(--hive-ink)]/30"
            >
              <FileUp className="mt-0.5 h-4 w-4 text-[var(--hive-text-muted)]" />
              <span>
                <span className="block text-sm font-medium">Request document upload</span>
                <span className="text-xs text-[var(--hive-text-muted)]">
                  IDs, licenses, cards. Staff upload the file.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("attest")}
              className="flex items-start gap-3 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 py-3 text-left hover:border-[var(--hive-ink)]/30"
            >
              <PenLine className="mt-0.5 h-4 w-4 text-[var(--hive-text-muted)]" />
              <span>
                <span className="block text-sm font-medium">Document to complete or attest</span>
                <span className="text-xs text-[var(--hive-text-muted)]">
                  Policy, handbook, or attestation. No e-sign vendor in this release.
                </span>
              </span>
            </button>
          </div>
        )}

        {step === "existing" && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {existing.length === 0 ? (
              <p className="text-sm text-[var(--hive-text-muted)]">No other items to attach.</p>
            ) : (
              existing.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-[var(--hive-border)] px-2 py-2 text-sm"
                >
                  <Checkbox
                    checked={picked.includes(item.id)}
                    onCheckedChange={(v) =>
                      setPicked((prev) =>
                        v === true ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span className="min-w-0 truncate">{item.title}</span>
                </label>
              ))
            )}
          </div>
        )}

        {(step === "upload" || step === "attest") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-item-title">Item name</Label>
              <Input
                id="new-item-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={step === "upload" ? "Photo ID" : "House policy"}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} />
              Required (empty required cells are red; optional cells stay quiet)
            </label>
          </div>
        )}

        <DialogFooter>
          {step !== "choose" && (
            <Button variant="outline" onClick={() => setStep("choose")}>
              Back
            </Button>
          )}
          {step === "existing" && (
            <Button
              variant="secondary"
              disabled={picked.length === 0 || attachMut.isPending}
              onClick={() => attachMut.mutate()}
            >
              {attachMut.isPending ? "Adding…" : "Add selected"}
            </Button>
          )}
          {(step === "upload" || step === "attest") && (
            <Button
              variant="secondary"
              disabled={!title.trim() || addMut.isPending}
              onClick={() => addMut.mutate(step)}
            >
              {addMut.isPending ? "Adding…" : "Add item"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
