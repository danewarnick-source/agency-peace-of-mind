import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listTrainingClassesForExec,
  markTrainingClassComplete,
  type TrainingClassRow,
} from "@/lib/training-class.functions";
import { trainingClassLabel, trainingClassUnitCents, type TrainingClassType } from "@/lib/training-class";
import { formatUsdFromCents } from "@/lib/hive-pricing";
import { ClassCardStatus } from "@/components/training/class-card-upload";
import {
  listTrainingOnlyOrdersForExec,
  sendTrainingOnlySeatFn,
  setupTrainingOnlySeatFn,
  type TrainingOnlyExecSeat,
} from "@/lib/training-only-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/classes")({
  head: () => ({ meta: [{ title: "Training — Provider Interface Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <ExecClassesPage />
    </RequireHiveExecutive>
  ),
});

const TYPES: TrainingClassType[] = ["cpr_first_aid", "mandt", "package"];

function ExecClassesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrainingClassesForExec);
  const publicFn = useServerFn(listTrainingOnlyOrdersForExec);
  const markFn = useServerFn(markTrainingClassComplete);
  const [bucket, setBucket] = useState<"upcoming" | "past">("upcoming");

  const q = useQuery({
    queryKey: ["hive-exec-training-classes"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });
  const publicQ = useQuery({
    queryKey: ["hive-exec-training-only"],
    queryFn: () => publicFn(),
    refetchInterval: 30_000,
  });

  const upcoming = useMemo(
    () => (q.data ?? []).filter((c) => c.status === "upcoming"),
    [q.data],
  );
  const past = useMemo(
    () => (q.data ?? []).filter((c) => c.status !== "upcoming"),
    [q.data],
  );
  const shown = bucket === "upcoming" ? upcoming : past;

  const markDone = async (id: string) => {
    try {
      await markFn({ data: { class_id: id } });
      toast.success("Class marked complete.");
      qc.invalidateQueries({ queryKey: ["hive-exec-training-classes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the class.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Provider Interface · Exec</div>
          <h2 className="font-display text-xl font-semibold">Training</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Public training-only purchases land here first — name, SKU, payer, paid or unpaid.
            Set the class date and send access. Office-submitted class rosters stay below. These
            people are not agency staff.
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${bucket === "upcoming" ? "bg-[var(--hive-text)] text-white" : "text-muted-foreground"}`}
            onClick={() => setBucket("upcoming")}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${bucket === "past" ? "bg-[var(--hive-text)] text-white" : "text-muted-foreground"}`}
            onClick={() => setBucket("past")}
          >
            Past ({past.length})
          </button>
        </div>
      </div>

      <PublicPurchasesSection
        rows={publicQ.data ?? []}
        loading={publicQ.isLoading}
        onChanged={() => qc.invalidateQueries({ queryKey: ["hive-exec-training-only"] })}
      />

      {TYPES.map((type) => {
        const rows = shown.filter((c) => c.trainingType === type);
        return (
          <section key={type} className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-[var(--hive-gold)]" />
              {trainingClassLabel(type)}
            </h3>
            {q.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading classes…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {bucket} {trainingClassLabel(type)} classes.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((c) => (
                  <ClassCard key={c.id} row={c} onComplete={() => markDone(c.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ClassCard({ row, onComplete }: { row: TrainingClassRow; onComplete: () => void }) {
  return (
    <div className="rounded-lg border p-3" data-testid={`exec-class-${row.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to="/dashboard/hive-exec/$orgId"
            params={{ orgId: row.organizationId }}
            className="font-medium text-[var(--hive-text)] hover:underline"
          >
            {row.providerName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {row.seatCount} staff · {formatUsdFromCents(trainingClassUnitCents(row.trainingType))} / seat ·{" "}
            {row.amountCents === 0 ? "$0 charged" : formatUsdFromCents(row.amountCents)} · submitted{" "}
            {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "—"}
            {" · "}
            <ClassCardStatus row={row} />
          </div>
        </div>
        {row.status === "upcoming" && (
          <Button size="sm" variant="outline" onClick={onComplete}>
            Mark class done
          </Button>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {row.roster.map((r) => (
          <li key={`${r.email}-${r.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {r.cardStatus === "in" ? "Card in" : "Card not in"}
            </span>
            <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-[var(--hive-gold)] hover:underline">
              <Mail className="h-3 w-3" /> {r.email}
            </a>
            {r.phone ? (
              <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-[var(--hive-gold)] hover:underline">
                <Phone className="h-3 w-3" /> {r.phone}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublicPurchasesSection({
  rows,
  loading,
  onChanged,
}: {
  rows: TrainingOnlyExecSeat[];
  loading: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="exec-training-only">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="h-4 w-4 text-[var(--hive-gold)]" />
        Public training purchases
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Paying outsiders. Not True North staff. Pack is CPR, 30-day, and Mandt for that person.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading public purchases…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public training-only orders yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PublicSeatRow key={row.seatId} row={row} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function PublicSeatRow({ row, onChanged }: { row: TrainingOnlyExecSeat; onChanged: () => void }) {
  const setupFn = useServerFn(setupTrainingOnlySeatFn);
  const sendFn = useServerFn(sendTrainingOnlySeatFn);
  const [open, setOpen] = useState(false);
  const [classDate, setClassDate] = useState(row.classDate ?? "");
  const [classNotes, setClassNotes] = useState(row.classNotes ?? "");
  const [sendTo, setSendTo] = useState(row.sentToEmail ?? row.buyerEmail);
  const [busy, setBusy] = useState(false);
  const paid = row.paymentStatus === "paid";

  const saveSetup = async () => {
    setBusy(true);
    try {
      await setupFn({
        data: {
          seatId: row.seatId,
          classDate: classDate || null,
          classNotes: classNotes || null,
        },
      });
      toast.success("Class details saved.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save setup.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await sendFn({ data: { seatId: row.seatId, sendToEmail: sendTo } });
      toast.success(`Sent to ${r.sentTo}.`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-3" data-testid={`exec-training-only-${row.seatId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-[var(--hive-text)]">
            {row.personName}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{row.skuLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Payer {row.buyerEmail}
            {row.buyerAgencyName ? ` · ${row.buyerAgencyName}` : ""}
            {" · "}
            {paid ? "Paid" : "Unpaid"}
            {" · "}
            {new Date(row.paidAt ?? row.orderedAt).toLocaleDateString()}
            {row.classDate ? ` · class ${row.classDate}` : ""}
            {row.sentAt ? " · sent" : ""}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Set up / send"}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`class-date-${row.seatId}`}>Class date</Label>
            <Input
              id={`class-date-${row.seatId}`}
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor={`send-to-${row.seatId}`}>Send to</Label>
            <Input
              id={`send-to-${row.seatId}`}
              type="email"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`notes-${row.seatId}`}>Notes for the person</Label>
            <textarea
              id={`notes-${row.seatId}`}
              value={classNotes}
              onChange={(e) => setClassNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={
                row.sku === "pack"
                  ? "Pack covers CPR, 30-day, and Mandt. Time, place, or course note."
                  : "Time, place, or course note."
              }
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void saveSetup()} className="h-11">
              Save setup
            </Button>
            <Button type="button" disabled={busy || !paid} onClick={() => void send()} className="h-11">
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
