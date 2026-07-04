import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCapability } from "@/hooks/use-exec-capability";

/**
 * Steve — Executive Command Center assistant.
 *
 * SHELL ONLY. No model wiring, no retrieval, no data access.
 * Exec-plane surface — must never be given a path to org PHI tables.
 */
const SUGGESTED_PROMPTS = [
  "Pull MRR by plan this month",
  "How do I add a feature to the registry?",
  "Map Utah billing codes to a new state",
  "Which orgs have a signed BAA on file?",
];

export function SteveDockPanel() {
  const { allowed } = useCapability("steve.use");
  if (!allowed) return null;
  return (
    <aside className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1b3d] text-[#fed7aa]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold text-foreground">Steve</div>
          <div className="text-[11px] text-muted-foreground">Exec assistant · no PHI</div>
        </div>
      </header>
      <div className="space-y-1.5">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled
            title="Coming soon"
            className="w-full cursor-not-allowed rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground opacity-70"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input placeholder="Ask Steve…" disabled title="Coming soon" />
        <Button size="sm" variant="secondary" disabled title="Coming soon">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Assistant is a shell — wiring pending.</p>
    </aside>
  );
}
