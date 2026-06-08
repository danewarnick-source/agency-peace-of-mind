import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Loader2, FileUp, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { nectarDraftForm, nectarDraftFormFromPdf } from "@/lib/forms.functions";
import { toast } from "sonner";
import { defaultFieldFor, type FormField } from "@/lib/forms-utils";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

export function NectarDraftModal({
  open, onOpenChange, onApply,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  onApply: (draft: { name: string; description: string; category: string; frequency: string; fields: FormField[] }) => void;
}) {
  const [tab, setTab] = useState<"text" | "pdf">("text");
  const [description, setDescription] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfHint, setPdfHint] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = useServerFn(nectarDraftForm);
  const draftPdf = useServerFn(nectarDraftFormFromPdf);

  function reset() {
    setDescription(""); setPdfFile(null); setPdfHint(""); setTab("text");
  }

  async function runText() {
    if (description.trim().length < 5) return toast.error("Tell Nectar what to build.");
    setBusy(true);
    try {
      const out = await draft({ data: { description: description.trim() } });
      const fields = out.draft.fields.map((f) => ({ ...defaultFieldFor(f.type), ...f }));
      onApply({ ...out.draft, fields });
      onOpenChange(false); reset();
      toast.success("Draft loaded — review and edit before publishing.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPdf() {
    if (!pdfFile) return toast.error("Choose a PDF to extract.");
    if (pdfFile.size > MAX_PDF_BYTES) return toast.error("PDF is too large (max 10MB).");
    if (!/\.pdf$/i.test(pdfFile.name) && pdfFile.type !== "application/pdf") {
      return toast.error("File must be a PDF.");
    }
    setBusy(true);
    try {
      const buf = await pdfFile.arrayBuffer();
      // base64 encode (chunked to avoid call-stack blowups on large PDFs)
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const pdfBase64 = btoa(binary);
      const out = await draftPdf({ data: {
        pdfBase64,
        filename: pdfFile.name,
        hint: pdfHint.trim() || undefined,
      } });
      const fields = out.draft.fields.map((f) => ({ ...defaultFieldFor(f.type), ...f }));
      onApply({ ...out.draft, fields });
      onOpenChange(false); reset();
      if (out.lowConfidence) {
        toast.warning("Draft loaded — low confidence. This PDF may be scanned or hard to parse; review every field carefully and expect manual corrections.", { duration: 9000 });
      } else {
        toast.success("Draft loaded from PDF — review every field (especially consents/legal wording) before publishing.", { duration: 7000 });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(b) => { onOpenChange(b); if (!b) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Build with Nectar</DialogTitle>
          <DialogDescription>
            Describe the form OR upload a PDF of an existing form. Nectar generates a draft you can review and edit — it is never auto-published.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "text" | "pdf")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="text"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Describe in text</TabsTrigger>
            <TabsTrigger value="pdf"><FileUp className="h-3.5 w-3.5 mr-1.5" /> Upload a PDF</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-3">
            <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={`E.g. "Weekly van inspection: check tire pressure, mileage, interior cleanliness, any damage, and require a tech signature."`}
              maxLength={8000} />
          </TabsContent>

          <TabsContent value="pdf" className="mt-3 space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">PDF of the existing form</Label>
              <Input type="file" accept="application/pdf,.pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
              {pdfFile && (
                <p className="text-[11px] text-muted-foreground">
                  {pdfFile.name} · {(pdfFile.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Optional hint for Nectar</Label>
              <Textarea rows={2} value={pdfHint} onChange={(e) => setPdfHint(e.target.value)}
                placeholder='E.g. "This is our intake assessment — ignore the agency logo footer."'
                maxLength={2000} />
            </div>
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Nectar extracts the form's <strong>structure</strong> (fields, types, sections) — not a pixel clone.
                Clean digital PDFs work best; scanned/handwritten PDFs rely on OCR and may extract only partially.
                The draft <strong>must be reviewed</strong> field-by-field before publishing — verify all wording, especially consents and legal/attestation language.
              </span>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {tab === "text" ? (
            <Button onClick={runText} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Generate draft
            </Button>
          ) : (
            <Button onClick={runPdf} disabled={busy || !pdfFile}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />} Extract from PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
