import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/verify/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Verify certificate ${params.code} — Care Academy` },
      { name: "description", content: "Public certificate verification for Care Academy issued credentials." },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["verify", code],
    queryFn: async () => {
      const { data } = await supabase.rpc("verify_certification", { _code: code });
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  const expired = data?.expires_at ? new Date(data.expires_at) < new Date() : false;
  const valid = !!data && !expired;

  return (
    <div className="min-h-screen bg-secondary/40 px-6 py-16">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </span>
          Care Academy
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Certificate verification</p>
          <p className="mt-1 font-mono text-sm">{code}</p>
          {isLoading ? (
            <p className="mt-6 text-sm text-muted-foreground">Checking…</p>
          ) : !data ? (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold">Not found</p>
                <p className="text-sm text-muted-foreground">No certificate matches this code.</p>
              </div>
            </div>
          ) : (
            <div className={`mt-6 rounded-lg border p-5 ${valid ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                {valid ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                <p className="font-semibold">{valid ? "Valid certificate" : "Expired certificate"}</p>
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Recipient</dt><dd className="font-medium">{data.recipient_name ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Course</dt><dd className="font-medium">{data.course_title ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Issued</dt><dd className="font-medium">{new Date(data.issued_at).toLocaleDateString()}</dd></div>
                <div><dt className="text-muted-foreground">Expires</dt><dd className="font-medium">{data.expires_at ? new Date(data.expires_at).toLocaleDateString() : "No expiration"}</dd></div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
