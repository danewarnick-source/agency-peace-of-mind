import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  listMyAuditorShares,
  getAuditorShareView,
} from "@/lib/auditor-shares.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Hexagon,
  ShieldCheck,
  Loader2,
  LogOut,
  Mail,
  ArrowLeft,
  Folder,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  share: z.string().uuid().optional(),
});

export const Route = createFileRoute("/auditor")({
  head: () => ({ meta: [{ title: "Auditor Portal — HIVE" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuditorPortal,
});

function AuditorPortal() {
  const { session, loading } = useAuth();
  const search = useSearch({ from: "/auditor" });
  const navigate = useNavigate({ from: "/auditor" });
  const navy = "#141a3d";

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(1000px 600px at 80% 110%, rgba(244,169,58,0.10), transparent 60%), linear-gradient(140deg, #f5f6fb 0%, #eef0f7 100%)",
      }}
    >
      <header className="border-b border-[color:var(--border-light)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold" style={{ color: navy }}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#141a3d] text-white">
              <Hexagon className="h-4 w-4 text-[#f4a93a]" strokeWidth={2.5} />
            </span>
            HIVE
            <span className="text-xs font-normal text-muted-foreground border-l border-[color:var(--border-light)] ml-2 pl-2">
              Auditor Portal
            </span>
          </Link>
          {session?.user?.email && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{session.user.email}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auditor", search: {} });
                }}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!session ? (
          <AuditorSignIn />
        ) : search.share ? (
          <AuditorShareDetail
            shareId={search.share}
            onBack={() => navigate({ to: "/auditor", search: {} })}
          />
        ) : (
          <AuditorShareList
            onOpen={(id) => navigate({ to: "/auditor", search: { share: id } })}
          />
        )}
      </main>
    </div>
  );
}

function AuditorSignIn() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter the email address your share was sent to.");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auditor` },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't send sign-in link");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="bg-card/80 backdrop-blur border-[color:var(--border-light)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-[color:var(--amber-600)]" /> Auditor sign-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the email address the provider granted you access with. We'll send a one-time link — you verify yourself, no account creation needed.
          </p>
          {sent ? (
            <div className="rounded-md border border-[color:var(--amber-300)] bg-[color:var(--amber-50)] px-3 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Mail className="h-4 w-4" /> Check your inbox
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                We sent a sign-in link to <strong>{email}</strong>. The link returns you here.
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Email address</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="auditor@dspd.utah.gov"
                />
              </div>
              <Button variant="cta" className="w-full" onClick={send} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send sign-in link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditorShareList({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useServerFn(listMyAuditorShares);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-auditor-shares"],
    queryFn: () => list(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shared with you</h1>
        <p className="text-sm text-muted-foreground">
          Audit folders that providers have granted you access to. Only files explicitly shared are visible.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="text-sm text-destructive">{(error as Error).message}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(data?.shares ?? []).map((s: any) => {
          const cls =
            s.live_status === "active"
              ? "border-[color:var(--amber-300)]"
              : "border-[color:var(--border-light)] opacity-80";
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className={`text-left rounded-lg border ${cls} bg-card/70 backdrop-blur p-4 hover:bg-white transition`}
            >
              <div className="flex items-center justify-between gap-2">
                <Folder className="h-5 w-5 text-[color:var(--navy-700)]" />
                <Badge
                  className={
                    s.live_status === "active"
                      ? "bg-[color:var(--amber-100)] text-[color:var(--navy-900)] border-0"
                      : "bg-[color:var(--surface-2)] text-foreground border-0"
                  }
                >
                  {s.live_status}
                </Badge>
              </div>
              <div className="mt-3 font-semibold">{s.packet?.name ?? "Audit folder"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {s.organization_name && <>From {s.organization_name} · </>}
                Access until {format(new Date(s.ends_at), "MMM d, yyyy h:mma")}
              </div>
            </button>
          );
        })}
        {!isLoading && (data?.shares ?? []).length === 0 && (
          <Card className="bg-card/60 backdrop-blur border-dashed col-span-full">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No audit folders have been shared with this email yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AuditorShareDetail({ shareId, onBack }: { shareId: string; onBack: () => void }) {
  const fetchView = useServerFn(getAuditorShareView);
  const { data, isLoading, error } = useQuery({
    queryKey: ["auditor-share-view", shareId],
    queryFn: () => fetchView({ data: { share_id: shareId } }),
    retry: false,
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { staff: [], client: [], admin: [], other: [] };
    (data?.items ?? []).forEach((i: any) => g[i.sub_folder]?.push(i));
    return g;
  }, [data?.items]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening shared folder…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-6 text-sm text-destructive">
            {(error as Error).message}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  const counts = {
    total: data.items.length,
    provided: data.items.filter((i: any) => ["auto_filled", "confirmed"].includes(i.status)).length,
    missing: data.items.filter((i: any) => i.status === "missing").length,
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to shared folders
      </Button>

      <Card className="bg-card/70 backdrop-blur border-[color:var(--border-light)]">
        <CardHeader>
          <CardTitle className="text-lg">{data.packet?.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Shared by {data.organization?.name} · access until{" "}
            {format(new Date(data.share.ends_at), "MMM d, yyyy h:mma")}
          </div>
          {data.packet?.expectations_summary && (
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Expectations: </span>
              {data.packet.expectations_summary}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-sm pt-1">
            <Stat label="Items needed" value={counts.total} />
            <Stat label="Provided" value={counts.provided} tone="amber" />
            <Stat label="Missing" value={counts.missing} tone={counts.missing > 0 ? "red" : undefined} />
          </div>
        </CardContent>
      </Card>

      {(["staff", "client", "admin", "other"] as const).map((folder) => (
        <Card key={folder} className="bg-card/70 backdrop-blur border-[color:var(--border-light)]">
          <CardHeader>
            <CardTitle className="text-sm capitalize flex items-center gap-2">
              <Folder className="h-4 w-4 text-[color:var(--navy-700)]" />
              {folder} <span className="text-muted-foreground font-normal">({grouped[folder].length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {grouped[folder].length === 0 && (
              <div className="text-xs text-muted-foreground">No items in this folder.</div>
            )}
            {grouped[folder].map((it: any) => {
              const provided = ["auto_filled", "confirmed"].includes(it.status);
              const missing = it.status === "missing";
              return (
                <div
                  key={it.id}
                  className="rounded-md border border-[color:var(--border-light)] bg-white/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{it.title}</span>
                      </div>
                      {it.description && (
                        <div className="text-xs text-muted-foreground mt-1">{it.description}</div>
                      )}
                      {it.source_hint && (
                        <div className="text-[11px] mt-1.5 inline-flex items-center gap-1 rounded-full border border-[color:var(--border-light)] bg-[color:var(--surface-2)] px-2 py-0.5 text-muted-foreground">
                          Source: {it.source_hint}
                        </div>
                      )}
                    </div>
                    <Badge
                      className={
                        provided
                          ? "bg-[color:var(--amber-100)] text-[color:var(--navy-900)] border-0"
                          : missing
                          ? "bg-destructive/10 text-destructive border border-destructive/30"
                          : "bg-[color:var(--surface-2)] text-foreground border-0"
                      }
                    >
                      {provided ? (
                        <><CheckCircle2 className="h-3 w-3" /> Provided{it.evidence_count > 0 ? ` (${it.evidence_count})` : ""}</>
                      ) : missing ? (
                        <><AlertTriangle className="h-3 w-3" /> Missing</>
                      ) : (
                        it.status.replace("_", " ")
                      )}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {(data.linked_files ?? []).length > 0 && (
        <Card className="bg-card/70 backdrop-blur border-[color:var(--border-light)]">
          <CardHeader>
            <CardTitle className="text-sm">Monthly billing-support files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.linked_files.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-md border border-[color:var(--border-light)] bg-white/70 px-3 py-2 text-sm"
              >
                <span className="font-medium">{format(new Date(f.period_month), "MMMM yyyy")}</span>
                <span className="text-xs text-muted-foreground">{f.status?.replace("_", " ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/70 backdrop-blur border-[color:var(--amber-300)]">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--amber-600)]" />
            NECTAR — Training standard vs evidence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Based on the documents the provider uploaded. NECTAR places the standard from the SOW/contract alongside the training HIVE has on file so you can compare requirement vs. evidence directly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-[color:var(--border-light)] bg-white/70 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Standard (from authoritative sources)
              </div>
              {(data.nectar.authoritative_sources ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground">No SOW/contract uploaded.</div>
              )}
              {data.nectar.authoritative_sources.map((s: any) => (
                <div key={s.id} className="text-xs flex items-center gap-2 py-0.5">
                  <BookOpen className="h-3 w-3 text-[color:var(--navy-700)]" />
                  <span className="font-medium">{s.title}</span>
                  {s.authoritative_kind && (
                    <span className="text-muted-foreground">· {s.authoritative_kind}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-md border border-[color:var(--border-light)] bg-white/70 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                HIVE training evidence
              </div>
              <div className="space-y-1">
                {(data.nectar.training_courses ?? []).slice(0, 8).map((c: any) => (
                  <div key={c.id} className="text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-[color:var(--amber-600)]" />
                    {c.title}
                  </div>
                ))}
                {(data.nectar.certifications ?? []).slice(0, 8).map((c: any) => (
                  <div key={c.id} className="text-xs flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3 text-[color:var(--navy-700)]" />
                    {c.name}
                  </div>
                ))}
                {(data.nectar.training_courses ?? []).length === 0 &&
                  (data.nectar.certifications ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      No training records on file.
                    </div>
                  )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "red";
}) {
  const cls =
    tone === "amber"
      ? "text-[color:var(--amber-600)]"
      : tone === "red"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-md border border-[color:var(--border-light)] bg-white/70 px-3 py-2">
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
