import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, PenTool, Type as TypeIcon } from "lucide-react";
import {
  getEmployeeLoanForSigning,
  submitEmployeeLoanSignature,
} from "@/lib/employee-loans.functions";

export const Route = createFileRoute("/sign/employee-loan/$token")({
  head: () => ({ meta: [{ title: "Sign loan agreement — HIVE" }] }),
  component: SignEmployeeLoanPage,
});

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "$0.00";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch { return s; }
}

function SignEmployeeLoanPage() {
  const { token } = Route.useParams();
  const fetchAgreement = useServerFn(getEmployeeLoanForSigning);
  const submit = useServerFn(submitEmployeeLoanSignature);

  const q = useQuery({
    queryKey: ["sign-emp-loan", token],
    queryFn: () => fetchAgreement({ data: { token } }),
  });

  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typedSig, setTypedSig] = useState("");
  const padRef = useRef<SignatureCanvas | null>(null);
  const [submitted, setSubmitted] = useState<null | { signed_at: string }>(null);

  useEffect(() => {
    if (q.data?.ok) {
      setName(q.data.token.signer_name || "");
      setTypedSig(q.data.token.signer_name || "");
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: async () => {
      let signature_image = "";
      if (mode === "drawn") {
        if (!padRef.current || padRef.current.isEmpty()) throw new Error("Please draw your signature before submitting.");
        signature_image = padRef.current.toDataURL("image/png");
      } else {
        if (!typedSig.trim()) throw new Error("Please type your signature.");
        signature_image = typedSigToDataUrl(typedSig);
      }
      return submit({
        data: {
          token,
          signer_name: name,
          signature_image,
          signature_method: mode,
          consent: true,
        },
      });
    },
    onSuccess: (r) => setSubmitted({ signed_at: r.signed_at }),
  });

  if (q.isLoading) {
    return <div className="min-h-screen bg-muted/30 p-8 text-sm text-muted-foreground">Loading agreement…</div>;
  }

  if (!q.data?.ok) {
    return (
      <div className="min-h-screen bg-muted/30 p-8">
        <Card className="mx-auto max-w-lg">
          <CardHeader><CardTitle>Signing link unavailable</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{q.data?.error ?? "This link is not valid."}</CardContent>
        </Card>
      </div>
    );
  }

  const a = q.data.token.agreement_snapshot as any;

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 p-8">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" /> Agreement signed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Thank you, {name}. Your signature was recorded at {new Date(submitted.signed_at).toLocaleString()}.</p>
            <p className="text-muted-foreground">
              A signed copy is on file with {a.lender_name}. This link is now closed and cannot be used again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Employee Loan Agreement</h1>
          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Secure e-signature</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Parties</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div><b>Employer:</b> {a.lender_name}</div>
            <div><b>Employee:</b> {a.borrower_name}</div>
            <div><b>Agreement date:</b> {fmtDate(a.agreement_date)}</div>
            {a.maturity_date && <div><b>Maturity date:</b> {fmtDate(a.maturity_date)}</div>}
          </CardContent>
        </Card>

        {a.purpose && (
          <Card>
            <CardHeader><CardTitle className="text-base">Purpose</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{a.purpose}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Financial terms</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div><b>Advance amount:</b> {fmtMoney(a.advance_amount)} {a.advance_cadence ? `(${a.advance_cadence})` : ""}</div>
            <div><b>Interest rate:</b> {a.interest_rate ? `${a.interest_rate}% / year` : "Interest-free"}</div>
            {a.direct_payment_amount ? (
              <div className="md:col-span-2">
                <b>Direct payment:</b> {fmtMoney(a.direct_payment_amount)} {a.direct_payment_cadence ? `(${a.direct_payment_cadence})` : ""}
                {a.direct_payment_description ? ` — ${a.direct_payment_description}` : ""}
              </div>
            ) : null}
            {a.repayment_method && <div className="md:col-span-2"><b>Repayment method:</b> {a.repayment_method}</div>}
          </CardContent>
        </Card>

        {Array.isArray(a.repayment_conditions) && a.repayment_conditions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Repayment conditions</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <ol className="list-decimal space-y-1 pl-5">
                {a.repayment_conditions.map((c: any) => <li key={c.id}>{c.label}</li>)}
              </ol>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Voluntary participation</CardTitle></CardHeader>
          <CardContent className="text-sm">
            The Employee's decision to accept or decline this loan will not affect, in any way, the Employee's
            employment status, terms of employment, or any benefits provided by the Employer.
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader><CardTitle className="text-base">Sign electronically</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Your legal name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "typed" ? "default" : "outline"} onClick={() => setMode("typed")}>
                <TypeIcon className="mr-1 h-3.5 w-3.5" /> Type signature
              </Button>
              <Button type="button" size="sm" variant={mode === "drawn" ? "default" : "outline"} onClick={() => setMode("drawn")}>
                <PenTool className="mr-1 h-3.5 w-3.5" /> Draw signature
              </Button>
            </div>

            {mode === "typed" ? (
              <div>
                <Label>Signature (typed)</Label>
                <Input value={typedSig} onChange={(e) => setTypedSig(e.target.value)} className="h-14 text-2xl italic" style={{ fontFamily: "'Brush Script MT','Segoe Script','cursive'" }} />
              </div>
            ) : (
              <div>
                <Label>Signature (drawn)</Label>
                <div className="rounded border border-border bg-white">
                  <SignatureCanvas
                    ref={padRef}
                    penColor="#111"
                    canvasProps={{ width: 640, height: 160, className: "w-full" }}
                  />
                </div>
                <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => padRef.current?.clear()}>
                  Clear
                </Button>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
              <span>
                <b>ESIGN consent:</b> I agree to conduct this transaction electronically. I understand my electronic
                signature has the same legal effect as a handwritten signature and that {a.lender_name} will retain
                a copy of this signed agreement.
              </span>
            </label>

            {mut.isError && <p className="text-sm text-destructive">{(mut.error as any)?.message ?? "Could not submit"}</p>}

            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!consent || !name.trim() || mut.isPending}
                onClick={() => mut.mutate()}
              >
                {mut.isPending ? "Signing…" : "Sign agreement"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Signing captures your name, timestamp, IP address, and browser information for audit purposes.
        </p>
      </div>
    </div>
  );
}

/** Render a typed signature into a PNG dataURL using an offscreen canvas so
 *  it can be embedded in the signed PDF. */
function typedSigToDataUrl(text: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "italic 56px 'Brush Script MT','Segoe Script',cursive";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, canvas.height / 2);
  return canvas.toDataURL("image/png");
}
