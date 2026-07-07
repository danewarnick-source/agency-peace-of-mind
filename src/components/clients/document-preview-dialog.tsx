import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PreviewDoc = {
  fileName: string;
  mimeType?: string | null;
  signedUrl: string;
};

type Kind = "pdf" | "image" | "text" | "docx" | "unsupported";

function detectKind(doc: PreviewDoc): Kind {
  const mime = (doc.mimeType ?? "").toLowerCase();
  const ext = (doc.fileName.split(".").pop() ?? "").toLowerCase();
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (
    mime.includes("wordprocessingml") ||
    ext === "docx"
  ) return "docx";
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    ["txt", "csv", "md", "json", "html", "htm", "log", "xml"].includes(ext)
  ) return "text";
  return "unsupported";
}

function kindLabel(k: Kind, ext: string): string {
  if (k === "pdf") return "PDF";
  if (k === "image") return ext.toUpperCase() || "Image";
  if (k === "docx") return "Word";
  if (k === "text") return ext.toUpperCase() || "Text";
  return ext.toUpperCase() || "File";
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  doc,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: PreviewDoc | null;
}) {
  if (!doc) return null;
  const kind = detectKind(doc);
  const ext = (doc.fileName.split(".").pop() ?? "").toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden sm:max-w-[95vw]"
      >
        <div className="flex items-center gap-3 border-b border-border/60 bg-card/60 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{doc.fileName}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{kindLabel(kind, ext)}</Badge>
            </div>
          </div>
          <a
            href={doc.signedUrl}
            download={doc.fileName}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </a>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 bg-muted/30">
          <PreviewBody doc={doc} kind={kind} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ doc, kind }: { doc: PreviewDoc; kind: Kind }) {
  if (kind === "pdf") {
    return (
      <iframe
        title={doc.fileName}
        src={doc.signedUrl}
        className="h-full w-full border-0"
      />
    );
  }
  if (kind === "image") {
    return (
      <div className="h-full w-full overflow-auto flex items-start justify-center p-4">
        <img
          src={doc.signedUrl}
          alt={doc.fileName}
          className="max-w-full h-auto object-contain"
        />
      </div>
    );
  }
  if (kind === "text") return <TextPreview url={doc.signedUrl} />;
  if (kind === "docx") return <DocxPreview url={doc.signedUrl} />;
  return <UnsupportedPreview doc={doc} />;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}
      </div>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [state, setState] = useState<{ loading: boolean; text: string; error: string | null }>({
    loading: true,
    text: "",
    error: null,
  });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, text: "", error: null });
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => alive && setState({ loading: false, text: t, error: null }))
      .catch((e: Error) => alive && setState({ loading: false, text: "", error: e.message }));
    return () => {
      alive = false;
    };
  }, [url]);
  if (state.loading) return <Spinner label="Loading…" />;
  if (state.error) return <ErrorPanel message={state.error} />;
  return (
    <div className="h-full w-full overflow-auto p-4">
      <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
        {state.text}
      </pre>
    </div>
  );
}

function DocxPreview({ url }: { url: string }) {
  const [state, setState] = useState<{ loading: boolean; html: string; error: string | null }>({
    loading: true,
    html: "",
    error: null,
  });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, html: "", error: null });
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const mammoth = (await import("mammoth/mammoth.browser" as string)) as {
          convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (alive) setState({ loading: false, html: result.value, error: null });
      } catch (e) {
        if (alive) setState({ loading: false, html: "", error: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);
  if (state.loading) return <Spinner label="Rendering document…" />;
  if (state.error) return <ErrorPanel message={state.error} />;
  return (
    <div className="h-full w-full overflow-auto p-6 bg-background">
      <div
        className="prose prose-sm dark:prose-invert max-w-3xl mx-auto"
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
    </div>
  );
}

function UnsupportedPreview({ doc }: { doc: PreviewDoc }) {
  return (
    <div className="h-full w-full grid place-items-center p-8 text-center">
      <div className="space-y-3 max-w-md">
        <p className="text-sm font-medium">Preview not available for this file type.</p>
        <p className="text-xs text-muted-foreground">
          Download the file to view it with the native application on your device.
        </p>
        <a href={doc.signedUrl} download={doc.fileName} target="_blank" rel="noreferrer">
          <Button size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download {doc.fileName}
          </Button>
        </a>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="h-full w-full grid place-items-center p-8 text-center">
      <div className="space-y-2 max-w-md">
        <p className="text-sm font-medium text-destructive">Couldn't render preview.</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
