import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatExamExportCsv, inHiveCourseIdForTitle } from "@/lib/in-hive-training";
import { examTitleFor } from "@/lib/in-hive-training-exams";
import { loadInHiveExamAttempts } from "@/lib/in-hive-training.functions";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminExamExportButton({
  staffId,
  staffName,
  obligationTitle,
}: {
  staffId: string;
  staffName: string;
  obligationTitle: string;
}) {
  const courseId = inHiveCourseIdForTitle(obligationTitle);
  const m = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("This obligation is not an in-platform course.");
      const attempts = await loadInHiveExamAttempts(staffId, courseId, null);
      const last = [...attempts].reverse().find((a) => a.passed) ?? attempts[attempts.length - 1];
      if (!last) throw new Error("No exam attempt on file yet.");
      return formatExamExportCsv({
        courseTitle: examTitleFor(courseId),
        staffName,
        completedAt: last.completedAt,
        snapshot: last,
      });
    },
    onSuccess: (csv) => {
      downloadCsv(`${courseId ?? "course"}-exam-export.csv`, csv);
      toast.success("Auditor export downloaded.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!courseId) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-6 px-1.5 text-[11px]"
      disabled={m.isPending}
      onClick={() => m.mutate()}
    >
      <Download className="h-3 w-3 mr-1" />
      Auditor export
    </Button>
  );
}
