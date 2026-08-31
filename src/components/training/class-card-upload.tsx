import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  attachTrainingClassCard,
  createTrainingClassCardUploadUrl,
} from "@/lib/training-class-cards.functions";
import { classCardLabel } from "@/lib/training-class-cards";
import type { TrainingClassRow } from "@/lib/training-class.functions";

export function ClassCardStatus({ row }: { row: TrainingClassRow }) {
  return (
    <span
      className="text-xs font-medium"
      data-testid={`class-card-status-${row.id}`}
    >
      {classCardLabel({
        inCount: row.cardInCount,
        missingCount: row.cardMissingCount,
        allIn: row.cardsAllIn,
      })}
    </span>
  );
}

export function ClassCardUploadButtons({
  orgId,
  row,
}: {
  orgId: string;
  row: TrainingClassRow;
}) {
  const qc = useQueryClient();
  const urlFn = useServerFn(createTrainingClassCardUploadUrl);
  const attachFn = useServerFn(attachTrainingClassCard);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<{ rosterId?: string; wholeClass: boolean } | null>(null);

  if (row.trainingType === "thirty_day") return null;

  const pick = (next: { rosterId?: string; wholeClass: boolean }) => {
    setTarget(next);
    fileRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    if (!file || !target) return;
    const key = target.wholeClass ? "class" : (target.rosterId ?? "row");
    setBusyId(key);
    try {
      const signed = await urlFn({
        data: {
          organizationId: orgId,
          classId: row.id,
          rosterId: target.rosterId ?? null,
          fileName: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
        },
      });
      if (!signed.objectPath || !signed.upload) throw new Error("Could not start the card upload.");
      const put = await fetch(signed.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Could not upload that card.");
      await attachFn({
        data: {
          organizationId: orgId,
          classId: row.id,
          rosterId: target.rosterId ?? null,
          applyToWholeClass: target.wholeClass,
          objectPath: signed.objectPath,
          fileName: file.name,
        },
      });
      toast.success("Card uploaded. The obligation is closed.");
      qc.invalidateQueries({ queryKey: ["ht-org-classes", orgId] });
      qc.invalidateQueries({ queryKey: ["hive-exec-training-classes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the card.");
    } finally {
      setBusyId(null);
      setTarget(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ClassCardStatus row={row} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          data-testid={`class-card-upload-all-${row.id}`}
          disabled={busyId !== null}
          onClick={() => pick({ wholeClass: true })}
        >
          {busyId === "class" ? "Uploading…" : "Upload card for this class"}
        </Button>
      </div>
      <ul className="space-y-1 text-xs">
        {row.roster.map((r) => (
          <li key={r.rosterId} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {r.name} · {r.cardStatus === "in" ? `Card in${r.cardFilename ? ` (${r.cardFilename})` : ""}` : "Card not in"}
            </span>
            {r.cardStatus !== "in" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
                data-testid={`class-card-upload-${r.rosterId}`}
                disabled={busyId !== null}
                onClick={() => pick({ rosterId: r.rosterId, wholeClass: false })}
              >
                {busyId === r.rosterId ? "Uploading…" : "Upload card"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
