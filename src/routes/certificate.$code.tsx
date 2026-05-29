import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Award, Download, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/certificate/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Certificate ${params.code}` },
      { name: "description", content: "Printable training certificate." },
    ],
  }),
  component: CertificatePage,
});

function CertificatePage() {
  const { code } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["certificate", code],
    queryFn: async () => {
      const { data } = await supabase.rpc("verify_certification", { _code: code });
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  // Auto-trigger print dialog when ?print=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("print") === "1" && data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data]);

  const expired = data?.expires_at ? new Date(data.expires_at) < new Date() : false;

  if (isLoading) {
    return <p className="p-12 text-center text-sm text-muted-foreground">Loading certificate…</p>;
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <XCircle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm text-muted-foreground">Certificate not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/40 px-6 py-10 print:bg-white print:p-0">
      {/* Action bar — hidden in print */}
      <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between print:hidden">
        <div className="text-sm text-muted-foreground">
          Verification code: <span className="font-mono">{code}</span>
        </div>
        <Button onClick={() => window.print()} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          <Download className="mr-2 h-4 w-4" /> Download / Print PDF
        </Button>
      </div>

      {/* Certificate sheet */}
      <div className="mx-auto max-w-4xl rounded-3xl border-8 border-double border-primary/30 bg-card p-10 shadow-[var(--shadow-card)] print:rounded-none print:border-primary/40 print:shadow-none">
        <div className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-primary-foreground">
            <Award className="h-7 w-7" />
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Certificate of Completion
          </p>
          <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight md:text-5xl">
            {data.recipient_name ?? "Recipient"}
          </h1>
          <p className="mt-6 text-sm text-muted-foreground">has successfully completed</p>
          <h2 className="mt-3 text-2xl font-semibold text-primary md:text-3xl">
            {data.course_title}
          </h2>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-6 border-t border-border pt-8 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Issued</p>
              <p className="mt-1 font-medium">{new Date(data.issued_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Expires</p>
              <p className="mt-1 font-medium">
                {data.expires_at ? new Date(data.expires_at).toLocaleDateString() : "No expiration"}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Certificate ID</p>
              <p className="mt-1 break-all font-mono text-xs">{code}</p>
            </div>
          </div>
          <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {expired ? (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span>This certificate has expired and requires renewal.</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Verify authenticity at /verify/{code}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 0.5in; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
