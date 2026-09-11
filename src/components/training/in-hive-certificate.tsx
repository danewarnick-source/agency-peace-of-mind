import { CheckCircle2, Circle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PI_THEME } from "@/lib/pi-theme";
import type { ThirtyDayCertificateRecord } from "@/lib/in-hive-training";

export function InHiveCertificate({
  record,
  issued,
}: {
  record: ThirtyDayCertificateRecord;
  issued: boolean;
}) {
  const completedAt = new Date(record.completedAt);
  const dateLabel = Number.isNaN(completedAt.getTime())
    ? record.completedAt
    : completedAt.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm font-medium">
          {issued
            ? "Certificate issued — already on the staff file"
            : "Topic checklist (complete remaining topics to issue)"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print a copy
        </Button>
      </div>

      <div
        id="in-hive-thirty-day-certificate"
        className="rounded-xl border p-6 print:border-black"
        style={{
          background: PI_THEME.cream,
          borderColor: "rgba(10, 17, 32, 0.12)",
          color: PI_THEME.navy,
          fontFamily: PI_THEME.sans,
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: PI_THEME.gold }}
        >
          Provider Interface
        </p>
        <h2
          className="mt-2 text-2xl font-medium tracking-tight"
          style={{ fontFamily: PI_THEME.serif }}
        >
          {record.courseName}
        </h2>
        <p className="mt-1 text-xs opacity-70">{record.citation}</p>

        <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-55">Staff</dt>
            <dd className="font-medium">{record.staffName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-55">Organization</dt>
            <dd className="font-medium">{record.organizationName}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-55">Completion date</dt>
            <dd className="font-medium">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide opacity-55">Competency exam</dt>
            <dd className="font-medium">
              {record.examPassed
                ? `Passed${record.examScorePct != null ? ` · ${record.examScorePct}%` : ""}`
                : "Not passed"}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wide opacity-55">
          Scope of Work / SAS 30-day topics
        </p>
        <ul className="mt-2 space-y-1.5">
          {record.topics.map((t) => (
            <li key={t.code} className="flex items-start gap-2 text-sm">
              {t.passed ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: PI_THEME.ok }}
                  aria-label="Success"
                />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 opacity-35" aria-label="Not yet" />
              )}
              <span>
                <span className="font-medium">
                  {t.passed ? "Success" : "Open"} · {t.code}. {t.title}
                </span>
                <span className="mt-0.5 block text-[11px] opacity-60">{t.sowCite}</span>
              </span>
            </li>
          ))}
        </ul>

        {issued ? (
          <p className="mt-6 text-xs opacity-70">
            This record shows each required 30-day topic the staff member passed, plus the
            competency exam. It is not a Cardiopulmonary Resuscitation (CPR) or First Aid
            certificate.
          </p>
        ) : (
          <p className="mt-6 text-xs opacity-70">
            The certificate issues when every topic on this list is passed and the exam is passed.
          </p>
        )}
      </div>
    </div>
  );
}
