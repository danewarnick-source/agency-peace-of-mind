import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateClientFaceSheet } from "@/lib/client-face-sheet.functions";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";

export function FaceSheetButton({
  clientId,
  variant = "default",
}: {
  clientId: string;
  /** "default" = outline sm button; "pill" = tiny chip matching identity-row pills. */
  variant?: "default" | "pill";
}) {
  const gen = useServerFn(generateClientFaceSheet);
  const [busy, setBusy] = useState(false);

  const openSheet = async () => {
    setBusy(true);
    try {
      const { pdfBase64, filename } = await gen({ data: { clientId } });
      const bin = atob(pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Popup blocked — fall back to a direct download.
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate face sheet");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={openSheet}
        disabled={busy}
        title="Generate Client Face Sheet PDF"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
      >
        <FileText className="h-3 w-3" />
        {busy ? "Building…" : "Face Sheet"}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={openSheet}
      disabled={busy}
      className="shrink-0"
    >
      <FileText className="mr-1.5 h-3.5 w-3.5" />
      {busy ? "Building…" : "Client Face Sheet"}
    </Button>
  );
}
