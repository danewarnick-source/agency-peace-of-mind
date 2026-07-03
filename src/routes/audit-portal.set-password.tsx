import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/audit-portal/set-password")({
  head: () => ({
    meta: [
      { title: "Set password — HIVE State Audit Portal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    packageId: typeof search.packageId === "string" ? search.packageId : undefined,
  }),
  component: SetPasswordPage,
});

type Status = "verifying" | "ready" | "error";

function SetPasswordPage() {
  const { packageId } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => { if (!cancelled) setStatus("ready"); };
    const markError = (msg: string) => {
      if (cancelled) return;
      setErrorMsg(msg);
      setStatus("error");
    };
    const cleanUrl = () => {
      try { window.history.replaceState({}, "", window.location.pathname + window.location.search); }
      catch { /* ignore */ }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        markReady();
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return markError("This invite link is invalid or has expired.");
          cleanUrl();
          return markReady();
        }
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) return markError("This invite link is invalid or has expired.");
          cleanUrl();
          return markReady();
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) return markReady();

        setTimeout(async () => {
          if (cancelled) return;
          const { data: again } = await supabase.auth.getSession();
          if (again.session) markReady();
          else markError("This invite link is invalid or has expired.");
        }, 1200);
      } catch (e) {
        markError(e instanceof Error ? e.message : "Could not verify invite link.");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password"));
    const confirm = String(fd.get("confirm"));
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password set — opening your audit package");
    if (packageId) {
      navigate({ to: "/audit-portal/$packageId", params: { packageId }, replace: true });
    } else {
      navigate({ to: "/audit-portal", replace: true });
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

        {status === "verifying" && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">
            Verifying your invite link…
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>{errorMsg || "This invite link is invalid or has expired."}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ask the provider organization to resend your audit package invitation.
            </p>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="space-y-3">
            <p className="text-sm text-slate-700">
              Set a password for your auditor account. You'll be taken directly to your
              granted audit package.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">New password</span>
              <input
                type="password" name="password" required minLength={8} autoComplete="new-password"
                className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#0f1b3d] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Confirm password</span>
              <input
                type="password" name="confirm" required minLength={8} autoComplete="new-password"
                className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#0f1b3d] focus:outline-none"
              />
            </label>
            <button
              type="submit" disabled={busy}
              className="inline-flex w-full min-h-[44px] items-center justify-center rounded-md bg-[#0f1b3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Set password & open audit package"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
