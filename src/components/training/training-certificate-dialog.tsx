import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, ShieldCheck } from "lucide-react";

export type TrainingCertificateRecord = {
  topic_title: string;
  topic_code?: string | null;
  completed_at: string;
  attestation_statement: string;
  consent_statement?: string | null;
  typed_signature: string;
  signer_full_name?: string | null;
  signer_email?: string | null;
  content_version?: string | null;
  content_hash?: string | null;
  time_zone?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  consent_accepted?: boolean | null;
  question_answers?: Array<{ question: string; answer: string }> | null;
  content_snapshot?: {
    client_name?: string | null;
    section_titles?: string[];
    captured_at?: string;
  } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record: TrainingCertificateRecord | null;
  staffName?: string | null;
  staffId?: string | null;
};

function friendlyTopicLabel(code?: string | null): string | null {
  if (!code) return null;
  if (code === "client_specific_training") return "Client-Specific Training";
  if (code === "support_strategies_training") return "Support Strategies";
  return null;
}

export function TrainingCertificateDialog({
  open,
  onOpenChange,
  record,
  staffName,
  staffId,
}: Props) {
  if (!record) return null;

  const attestation =
    record.attestation_statement?.trim() ||
    record.consent_statement?.trim() ||
    "";
  const signedBy = record.signer_full_name || record.typed_signature;
  const friendlyLabel = friendlyTopicLabel(record.topic_code);
  const qa = record.question_answers ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 print:max-w-full print:max-h-none print:overflow-visible print:shadow-none print:border-0">
        <DialogHeader className="px-6 pt-6 pb-2 print:hidden">
          <DialogTitle>Training Completion Record</DialogTitle>
        </DialogHeader>

        <div
          id="training-certificate-print-area"
          className="px-6 pb-6 pt-2 text-sm print:px-0 print:pb-0 print:text-[12px]"
        >
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold tracking-tight">
              Training Completion Record
            </h1>
            <div className="mt-1 h-px bg-foreground/40" />
          </div>

          {/* Staff + Training */}
          <section className="space-y-1">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Staff
              </span>
              <p className="text-base font-semibold">
                {staffName || "—"}
                {staffId ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ID {staffId.slice(0, 8)}…
                  </span>
                ) : null}
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Training
              </span>
              <p className="text-base font-semibold">{record.topic_title}</p>
              {friendlyLabel && (
                <p className="text-xs text-muted-foreground">{friendlyLabel}</p>
              )}
              {record.content_snapshot?.client_name && (
                <p className="mt-1 text-sm font-semibold">
                  <span className="text-muted-foreground font-normal">For: </span>
                  {record.content_snapshot.client_name}
                </p>
              )}
            </div>
          </section>

          {/* Topics covered / material reviewed */}
          <section className="mt-4 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Topics covered / material reviewed
            </span>
            {record.content_snapshot?.section_titles &&
            record.content_snapshot.section_titles.length > 0 ? (
              <ul className="list-disc pl-5 space-y-0.5">
                {record.content_snapshot.section_titles.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Detailed topic list not captured for this completion (recorded
                before snapshotting). The content fingerprint below verifies the
                attested version.
              </p>
            )}
          </section>


          {/* Completed */}
          <section className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 print:bg-transparent">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Completed
            </span>
            <p className="text-base font-bold tabular-nums">
              {new Date(record.completed_at).toLocaleString()}
              {record.time_zone ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({record.time_zone})
                </span>
              ) : null}
            </p>
          </section>

          {/* Signature */}
          <section className="mt-4 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Signed by
            </span>
            <p className="font-semibold">{signedBy}</p>
            {record.signer_email && (
              <p className="text-xs text-muted-foreground">{record.signer_email}</p>
            )}
            <p className="pt-1 text-xs">
              <span className="text-muted-foreground">Typed signature: </span>
              <span className="font-mono">{record.typed_signature}</span>
            </p>
          </section>

          {/* Attestation */}
          {attestation && (
            <section className="mt-4 rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 print:bg-transparent">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Attestation
              </span>
              <p className="mt-1 italic">"{attestation}"</p>
            </section>
          )}

          {/* Version & integrity */}
          {(record.content_version || record.content_hash) && (
            <section className="mt-4 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Version &amp; integrity
              </span>
              {record.content_version && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Content version: </span>
                  <span className="font-mono">{record.content_version}</span>
                </p>
              )}
              {record.content_hash && (
                <p className="text-xs">
                  <span className="text-muted-foreground">
                    <ShieldCheck className="mr-1 inline h-3 w-3" />
                    Content fingerprint — proves the attested content is unaltered:
                  </span>
                  <br />
                  <span className="break-all font-mono">{record.content_hash}</span>
                </p>
              )}
            </section>
          )}

          {/* Review answers */}
          {qa.length > 0 && (
            <section className="mt-4 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Review answers
              </span>
              <ol className="space-y-2 list-decimal pl-5">
                {qa.map((a, i) => (
                  <li key={i}>
                    <p className="font-medium">{a.question}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                      {a.answer}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Audit metadata */}
          {(record.consent_accepted != null ||
            record.ip_address ||
            record.user_agent ||
            record.time_zone) && (
            <section className="mt-5 rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
              <p className="mb-1 font-semibold uppercase tracking-wider">
                Audit metadata
              </p>
              {record.consent_accepted != null && (
                <p>Consent accepted: {record.consent_accepted ? "Yes" : "No"}</p>
              )}
              {record.ip_address && <p>IP address: {record.ip_address}</p>}
              {record.time_zone && <p>Time zone: {record.time_zone}</p>}
              {record.user_agent && (
                <p className="break-all">User agent: {record.user_agent}</p>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
