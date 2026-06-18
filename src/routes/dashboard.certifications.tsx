import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Award, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";

export const Route = createFileRoute("/dashboard/certifications")({
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: CertificationsPage,
});

function CertificationsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const isManager = org?.role === "admin" || org?.role === "manager";

  const { data: certs, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["certs", user?.id, org?.organization_id, isManager],
    queryFn: async () => {
      let q = supabase.from("certifications")
        .select("id, verification_code, recipient_name, course_title, issued_at, expires_at, user_id, organization_id")
        .order("issued_at", { ascending: false });
      q = isManager ? q.eq("organization_id", org!.organization_id) : q.eq("user_id", user!.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <NectarFocusBanner />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">{isManager ? "Team certifications" : "My certifications"}</h2>
        <p className="text-sm text-muted-foreground">Each certificate has a public verification URL anyone can use to confirm authenticity.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !certs?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Award className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No certifications yet — complete a course to earn one.</p>
          <Button asChild className="mt-4"><Link to="/dashboard/training">Go to My Training</Link></Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {certs.map((c) => {
            const expired = c.expires_at && new Date(c.expires_at) < new Date();
            return (
              <div key={c.id} className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Award className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{c.course_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.recipient_name} · Issued {new Date(c.issued_at).toLocaleDateString()}
                      {c.expires_at && ` · Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${expired ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                    {expired ? "Expired" : "Valid"}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/verify/$code" params={{ code: c.verification_code }} target="_blank">
                      <ExternalLink className="mr-1.5 h-3 w-3" /> Verify
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/certificate/$code" params={{ code: c.verification_code }} target="_blank">
                      <Download className="mr-1.5 h-3 w-3" /> PDF
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
