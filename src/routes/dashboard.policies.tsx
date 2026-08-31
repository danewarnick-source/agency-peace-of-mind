import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENCY_POLICY_BUCKET,
  AGENCY_POLICY_MAX_BYTES,
  isAllowedPolicyFile,
  type PolicyAudienceKind,
} from "@/lib/agency-policies";
import {
  createAgencyPolicy,
  createAgencyPolicyUploadUrl,
  listAgencyPolicies,
  listPolicyJobCodeOptions,
} from "@/lib/agency-policies.functions";

export const Route = createFileRoute("/dashboard/policies")({
  head: () => ({ meta: [{ title: "Policies — HIVE" }] }),
  component: PoliciesHomePage,
});

function PoliciesHomePage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  if (!orgId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading your agency…</div>
    );
  }
  return <PoliciesHome orgId={orgId} />;
}

function PoliciesHome({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgencyPolicies);
  const codesFn = useServerFn(listPolicyJobCodeOptions);
  const createFn = useServerFn(createAgencyPolicy);
  const uploadUrlFn = useServerFn(createAgencyPolicyUploadUrl);

  const listQ = useQuery({
    queryKey: ["agency-policies", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });
  const codesQ = useQuery({
    queryKey: ["agency-policy-job-codes", orgId],
    queryFn: () => codesFn({ data: { organizationId: orgId } }),
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<PolicyAudienceKind>("everyone");
  const [jobCode, setJobCode] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const jobCodes = codesQ.data ?? [];
  const policies = listQ.data ?? [];

  const canSave = useMemo(() => {
    if (!title.trim()) return false;
    if (audience === "job_code" && !jobCode.trim()) return false;
    return Boolean(bodyText.trim() || file);
  }, [title, audience, jobCode, bodyText, file]);

  const reset = () => {
    setTitle("");
    setAudience("everyone");
    setJobCode("");
    setBodyText("");
    setFile(null);
    setOpen(false);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      let filePath: string | null = null;
      if (file) {
        const fileErr = isAllowedPolicyFile({ name: file.name, type: file.type, size: file.size });
        if (fileErr) throw new Error(fileErr);
        const signed = await uploadUrlFn({
          data: {
            organizationId: orgId,
            fileName: file.name,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
          },
        });
        if (!signed.objectPath || !signed.upload) throw new Error("Could not start the file upload.");
        const put = await fetch(signed.upload.signed_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Could not upload that file.");
        filePath = signed.objectPath;
      }
      await createFn({
        data: {
          organizationId: orgId,
          title: title.trim(),
          audienceKind: audience,
          audienceJobCode: audience === "job_code" ? jobCode : null,
          bodyText: bodyText.trim() || null,
          filePath,
          fileName: file?.name ?? null,
          fileMime: file?.type ?? null,
          fileSizeBytes: file?.size ?? null,
        },
      });
      toast.success("Policy added. Staff will see it on My Obligations.");
      reset();
      qc.invalidateQueries({ queryKey: ["agency-policies", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add this policy.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--hive-text)]">Policies</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One binder for this agency. Add a policy, pick who it applies to, and Hive puts it on
            those staff members&apos; My Obligations list. Staff read or watch it and attest. This
            is not a course builder and does not replace the 30-day orientation topics.
          </p>
        </div>
        <Button
          data-testid="policies-add"
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add policy
        </Button>
      </div>

      {open && (
        <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]" data-testid="policies-add-form">
          <h2 className="mb-3 text-sm font-semibold">New policy</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="policy-title">Title</Label>
              <Input
                id="policy-title"
                data-testid="policy-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Cell phone use, vehicle policy, visitor rules…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Who must complete this</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as PolicyAudienceKind)}>
                <SelectTrigger data-testid="policy-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="drivers">Drivers</SelectItem>
                  <SelectItem value="job_code">A job code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audience === "job_code" && (
              <div className="space-y-1.5">
                <Label>Job code</Label>
                <Select value={jobCode} onValueChange={setJobCode}>
                  <SelectTrigger data-testid="policy-job-code">
                    <SelectValue placeholder="Pick a job code" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobCodes.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="policy-body">Pasted text (optional if you attach a file)</Label>
              <Textarea
                id="policy-body"
                data-testid="policy-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={6}
                placeholder="Paste the policy here if you do not have a file."
              />
            </div>
            <div className="md:col-span-2">
              <div className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  {file ? "Change file" : "Attach file"}
                </Button>
                <div className="min-w-0 text-xs text-muted-foreground">
                  {file ? (
                    <span className="block truncate text-foreground">{file.name}</span>
                  ) : (
                    <span>PDF, slides, or video. Max 100 MB.</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={(e) => {
                    const next = e.target.files?.[0] ?? null;
                    if (next && next.size > AGENCY_POLICY_MAX_BYTES) {
                      toast.error("Files must be 100 MB or smaller.");
                      return;
                    }
                    setFile(next);
                  }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="policy-save"
              disabled={!canSave || busy}
              onClick={save}
            >
              {busy ? "Saving…" : "Add to binder"}
            </Button>
          </div>
        </section>
      )}

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the binder…</p>
      ) : policies.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-[var(--hive-gold)]" />
          <p className="mt-3 font-medium">No agency policies yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first one. Staff will not hunt Training, HR, or Launchpad for it.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {policies.map((p) => (
            <li
              key={p.id}
              data-testid={`policy-row-${p.id}`}
              className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--hive-text)]">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.audience_label}
                    {p.file_name ? ` · ${p.file_name}` : ""}
                    {p.body_text ? " · pasted text" : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.open_count} open on My Obligations
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
