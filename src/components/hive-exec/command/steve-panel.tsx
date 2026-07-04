import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, Loader2, ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCapability } from "@/hooks/use-exec-capability";
import { askSteve, type SteveAnswer } from "@/lib/hive-knowledge.functions";

/**
 * Steve — Executive Command Center assistant.
 *
 * Phase 1: Guide-me only. Retrieves against the authored `hive_knowledge`
 * table and composes an answer with citations. Steve has NO path to org
 * data, client records, financials, or PHI.
 */

const SUGGESTED_PROMPTS = [
  "How do I add a feature to the registry?",
  "How do I provision an auditor account?",
  "How do I grant an upgrade request?",
  "How do I toggle a feature on for an org?",
];

interface Props {
  routeContext?: string | null;
  featureKeyContext?: string | null;
  /** When true, render as a full panel (used in the Guide-me dialog). */
  expanded?: boolean;
}

export function SteveDockPanel({ routeContext = null, featureKeyContext = null, expanded = false }: Props) {
  const { allowed } = useCapability("steve.use");
  const askFn = useServerFn(askSteve);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: SteveAnswer }>>([]);

  const m = useMutation({
    mutationFn: (question: string) => askFn({ data: { question, routeContext, featureKeyContext } }),
    onSuccess: (a, q) => {
      setHistory((h) => [...h, { q, a }]);
      setInput("");
    },
  });

  if (!allowed) return null;

  const submit = () => {
    const q = input.trim();
    if (!q || m.isPending) return;
    m.mutate(q);
  };

  return (
    <aside className={`rounded-xl border border-border bg-card p-4 shadow-sm ${expanded ? "" : ""}`}>
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1b3d] text-[#fed7aa]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Steve · Guide-me</div>
          <div className="text-[11px] text-muted-foreground">
            Answers from HIVE's how-to library · no org data, no PHI
          </div>
        </div>
      </header>

      {routeContext && (
        <div className="mb-2 rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
          Scoped to: <span className="font-mono">{routeContext}</span>
        </div>
      )}

      {history.length === 0 && !m.isPending && (
        <div className="space-y-1.5">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setInput(p); m.mutate(p); }}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className={`space-y-3 ${expanded ? "max-h-[50vh]" : "max-h-64"} overflow-y-auto pr-1`}>
          {history.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              <div className="rounded-md bg-[#0f1b3d] px-2 py-1 text-xs text-white">{turn.q}</div>
              <div className="rounded-md border border-border bg-muted/20 p-2 text-xs text-foreground whitespace-pre-wrap">
                {turn.a.answer}
              </div>
              {turn.a.sources.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {turn.a.sources.map((s, j) => (
                    <span key={j} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                      [{j + 1}] {s.title}
                      {s.related_route && (
                        <Link
                          to={s.related_route as unknown as string}
                          className="inline-flex items-center text-[#d97a1c] hover:underline"
                          title={`Open ${s.related_route}`}
                        >
                          <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
                        </Link>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {m.isPending && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/20 px-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Steve is looking that up…
        </div>
      )}
      {m.isError && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          <ShieldAlert className="mt-0.5 h-3 w-3" />
          <span>{(m.error as Error)?.message ?? "Something went wrong."}</span>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Ask Steve how to use HIVE…"
          disabled={m.isPending}
        />
        <Button size="sm" variant="secondary" onClick={submit} disabled={m.isPending || !input.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Guide-me only. Steve reads authored how-tos — never org, billing, or client data.
      </p>
    </aside>
  );
}
