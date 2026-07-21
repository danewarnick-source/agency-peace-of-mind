import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, LogOut, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getAuditorContext, type AuditorContext } from "@/lib/audit-portal.functions";
import { toast } from "sonner";

interface Props {
  children: (auditor: AuditorContext) => ReactNode;
}

/**
 * Auditor-realm shell. Gates the /audit-portal/* pages behind an active
 * auditor_accounts row. State workers are NOT org users; this UI never
 * shows the org sidebar or nav.
 */
export function AuditPortalShell({ children }: Props) {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const ctxFn = useServerFn(getAuditorContext);
  const ctxQ = useQuery({
    queryKey: ["auditor-context", session?.user?.id ?? null],
    queryFn: () => ctxFn(),
    retry: false,
    enabled: !!session?.user?.id,
  });

  // Realm mutual exclusion: a signed-in user with no active auditor account
  // does NOT belong in the auditor portal — kick them to /dashboard.
  useEffect(() => {
    if (authLoading) return;
    if (!session?.user?.id) return;
    if (ctxQ.isLoading || ctxQ.isFetching) return;
    if (!ctxQ.data) navigate({ to: "/dashboard", replace: true });
  }, [authLoading, session?.user?.id, ctxQ.isLoading, ctxQ.isFetching, ctxQ.data, navigate]);

  if (authLoading || (session?.user?.id && ctxQ.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-muted-foreground">Loading auditor portal…</div>
      </div>
    );
  }

  const auditor = ctxQ.data ?? null;
  if (!session?.user?.id) return <AuditorLoginPanel onSignedIn={() => ctxQ.refetch()} />;
  if (!auditor) {
    // Signed in but not an auditor — redirect in progress; render nothing.
    return null;
  }



  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/audit-portal" className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">HIVE</div>
              <div className="font-display text-lg font-semibold text-[#0f1b3d]">State Audit Portal</div>
            </div>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="font-medium text-[#0f1b3d]">{auditor.full_name}</div>
              <div className="text-xs text-muted-foreground">{auditor.agency_name}</div>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/audit-portal";
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children(auditor)}</main>
    </div>
  );
}

function AuditorLoginPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      // Trigger context refetch; if not an active auditor, sign out to avoid
      // stranding an org user in the auditor shell.
      const ctxRes = await fetch("/", { method: "HEAD" }).catch(() => null);
      void ctxRes;
      onSignedIn();
      toast.success("Signed in");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg);
      await supabase.auth.signOut().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0f1b3d] via-[#1a2a5a] to-[#0f1b3d] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#fed7aa]/30 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">HIVE</div>
            <h1 className="font-display text-lg font-bold text-[#0f1b3d]">State Audit Portal</h1>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <div>
              This is a separate portal for state auditors. Access is provisioned by
              HIVE — accounts cannot self-register. If you are an agency staff member,
              use your organization's regular sign-in.
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#0f1b3d] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm focus:border-[#0f1b3d] focus:outline-none"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full min-h-[44px] items-center justify-center rounded-md bg-[#0f1b3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in to State Audit Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}
