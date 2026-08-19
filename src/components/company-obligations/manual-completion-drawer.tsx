// Admin "Add manual completion" drawer — records a completion on behalf of
// a staff member (attestation, upload, or notes-only), for the current
// instance or a specific historical one from the history panel.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { AlertTriangle, Upload } from "lucide-react";
import { recordCompletion } from "@/lib/company-obligations.functions";

type EvidenceChoice = "attestation" | "upload" | "notes";

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualCompletionDrawer({
  open,
  onOpenChange,
  orgId,
  instanceId,
  attestationText,
  evidenceType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  instanceId: string | null;
  attestationText?: string | null;
  evidenceType?: "attestation" | "upload" | "upload_and_attestation" | "form" | null;
}) {
  // An attestation is a first-person statement — an admin cannot make one on
  // a staff member's behalf, so this obligation can't be completed manually
  // at all here (the staff member must attest themselves).
  const attestationBlocked = evidenceType === "attestation";
  // upload_and_attestation lets an admin file the document half, but the
  // attestation half still requires the staff member personally, so
  // "Attestation" is never an admin-selectable evidence choice.
  const hideAttestationChoice = evidenceType === "attestation" || evidenceType === "upload_and_attestation";
  const defaultChoice: EvidenceChoice = hideAttestationChoice ? "upload" : "attestation";

  const qc = useQueryClient();
  const { user } = useAuth();
  const recordFn = useServerFn(recordCompletion);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [completedAt, setCompletedAt] = useState(() => toLocalDatetimeInputValue(new Date()));
  const [evidenceChoice, setEvidenceChoice] = useState<EvidenceChoice>(defaultChoice);
  const [attestConfirmed, setAttestConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setStaffId(null);
      setStaffName("");
      setCompletedAt(toLocalDatetimeInputValue(new Date()));
      setEvidenceChoice(defaultChoice);
      setAttestConfirmed(false);
      setFile(null);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: directory = [] } = useQuery({
    queryKey: ["org-member-directory-active", orgId],
    enabled: pickerOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
  });

  const { data: adminProfile } = useQuery({
    queryKey: ["org-member-name", orgId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory").select("full_name").eq("id", user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { full_name: string | null } | null;
    },
  });
  const adminName = adminProfile?.full_name ?? "an admin";

  const needsNotes = evidenceChoice === "notes";
  const canSave =
    !!staffId &&
    (evidenceChoice !== "attestation" || attestConfirmed) &&
    (evidenceChoice !== "upload" || !!file) &&
    (evidenceChoice !== "notes" || notes.trim().length > 0);

  const record = useMutation({
    mutationFn: async () => {
      let uploadPath: string | null = null;
      let uploadFilename: string | null = null;
      if (evidenceChoice === "upload" && file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/manual/${instanceId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, file);
        if (upErr) throw new Error(upErr.message);
        uploadPath = path;
        uploadFilename = file.name;
      }
      return recordFn({
        data: {
          organizationId: orgId,
          instanceId: instanceId as string,
          evidenceTypeUsed: evidenceChoice === "attestation" ? "attestation" : evidenceChoice === "upload" ? "upload" : "manual",
          uploadPath,
          uploadFilename,
          attestationSignedAt: evidenceChoice === "attestation" ? new Date(completedAt).toISOString() : null,
          attestationTextSnapshot: evidenceChoice === "attestation" ? (attestationText ?? null) : null,
          isManualEntry: true,
          staffId: staffId ?? undefined,
          staffName: staffName || undefined,
          manualEntryByName: adminName,
          notes: notes.trim() || null,
          completedAt: new Date(completedAt).toISOString(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Manual completion recorded");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
      qc.invalidateQueries({ queryKey: ["obligation-instance-detail"] });
      qc.invalidateQueries({ queryKey: ["obligation-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Add manual completion</SheetTitle>
          <SheetDescription>Record a completion on behalf of a staff member.</SheetDescription>
        </SheetHeader>

        {attestationBlocked ? (
          <>
            <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              This obligation requires the staff member to attest personally. Use the "Notify staff to attest"
              button on the obligation card to send them a reminder.
            </div>
            <SheetFooter className="gap-2 sm:justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled title="Staff must attest personally.">Save completion</Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-4 pb-4">
              <div className="grid gap-1.5">
                <Label>Who completed it</Label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="justify-start font-normal">
                      {staffName || "Select staff member…"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search staff…" />
                      <CommandList>
                        <CommandEmpty>No matches.</CommandEmpty>
                        <CommandGroup>
                          {directory.map((d) => (
                            <CommandItem
                              key={d.id}
                              value={d.full_name ?? d.id}
                              onSelect={() => {
                                setStaffId(d.id);
                                setStaffName(d.full_name ?? "Unnamed");
                                setPickerOpen(false);
                              }}
                            >
                              {d.full_name ?? "Unnamed"}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-1.5">
                <Label>Date and time completed</Label>
                <Input
                  type="datetime-local"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Evidence type</Label>
                <Select value={evidenceChoice} onValueChange={(v) => setEvidenceChoice(v as EvidenceChoice)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!hideAttestationChoice && <SelectItem value="attestation">Attestation</SelectItem>}
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="notes">Notes only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {evidenceType === "upload_and_attestation" && evidenceChoice === "upload" && (
                <p className="text-xs text-muted-foreground">
                  After filing the document, the staff member must still complete their personal attestation.
                </p>
              )}

              {evidenceChoice === "attestation" && (
                <div className="grid gap-1.5">
                  <div className="rounded-md border border-border bg-muted/40 p-2.5 text-sm">
                    {attestationText || "No attestation text configured for this obligation."}
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={attestConfirmed}
                      onChange={(e) => setAttestConfirmed(e.target.checked)}
                    />
                    I am confirming this on behalf of {staffName || "[selected staff]"}
                  </label>
                </div>
              )}

              {evidenceChoice === "upload" && (
                <div className="grid gap-1.5">
                  <Label>File</Label>
                  <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" />
                    {file ? file.name : "Choose file…"}
                    <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              {needsNotes && (
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} required />
                </div>
              )}

              <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  You are recording this on behalf of {staffName || "the selected staff member"}
                  {staffName ? "." : " — select a staff member above."}
                  {staffName && ` This entry will be marked as manually recorded by ${adminName}.`}
                </span>
              </div>

              {!needsNotes && (
                <div className="grid gap-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              )}
            </div>

            <SheetFooter className="gap-2 sm:justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => record.mutate()} disabled={!canSave || record.isPending}>
                Save completion
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
