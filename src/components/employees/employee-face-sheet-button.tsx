import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Download, Printer, Eye, Send, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateEmployeeFaceSheetFn } from "@/lib/employee-face-sheet.functions";

/**
 * Employee Face Sheet trigger — parallel to the client's `FaceSheetButton`.
 *
 * Actions:
 *   • Preview   — open the PDF in a new tab (browser viewer = print/download too).
 *   • Download  — force a file download.
 *   • Print     — open the PDF and invoke the browser print dialog.
 *   • Ship-to-file — snapshot the sheet into the employee's HR docs.
 *
 * Variants match the client button so header placement is identical.
 */
export function EmployeeFaceSheetButton({
  staffId,
  variant = "default",
}: {
  staffId: string;
  variant?: "default" | "pill";
}) {
  const gen = useServerFn(generateEmployeeFaceSheetFn);
  const [busy, setBusy] = useState<null | "preview" | "download" | "print" | "ship">(null);

  async function build(ship: boolean): Promise<{ blob: Blob; filename: string; shipped: boolean }> {
    const { pdfBase64, filename, shipped } = await gen({ data: { staffId, ship } });
    const bin = atob(pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { blob: new Blob([bytes], { type: "application/pdf" }), filename, shipped: !!shipped };
  }

  async function run(kind: NonNullable<typeof busy>) {
    setBusy(kind);
    try {
      const { blob, filename, shipped } = await build(kind === "ship");
      const url = URL.createObjectURL(blob);
      try {
        if (kind === "download") {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else if (kind === "print") {
          const win = window.open(url, "_blank", "noopener,noreferrer");
          if (win) {
            // Give the PDF a beat to render before invoking print.
            win.addEventListener("load", () => win.print(), { once: true });
          } else {
            toast.error("Enable popups to print the face sheet.");
          }
        } else if (kind === "preview") {
          const win = window.open(url, "_blank", "noopener,noreferrer");
          if (!win) {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        } else if (kind === "ship") {
          if (shipped) toast.success("Face sheet snapshot saved to HR docs.");
        }
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build face sheet");
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;
  const label = isBusy ? "Working…" : "Face Sheet";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "pill" ? (
          <button
            type="button"
            disabled={isBusy}
            title="Employee Face Sheet — preview, download, print, or ship to HR docs"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
          >
            <FileText className="h-3 w-3" />
            {label}
            <ChevronDown className="h-3 w-3" />
          </button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={isBusy} className="shrink-0">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            {isBusy ? "Working…" : "Employee Face Sheet"}
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => run("preview")}>
          <Eye className="mr-2 h-3.5 w-3.5" /> Preview
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("download")}>
          <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("print")}>
          <Printer className="mr-2 h-3.5 w-3.5" /> Print
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run("ship")}>
          <Send className="mr-2 h-3.5 w-3.5" /> Ship to HR docs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
