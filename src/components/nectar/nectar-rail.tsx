import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Hexagon, Send, ShieldCheck, GraduationCap, AlertTriangle, FileCheck2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPTS = [
  { icon: ShieldCheck, text: "What's my compliance score?" },
  { icon: GraduationCap, text: "Show overdue training" },
  { icon: AlertTriangle, text: "Summarize open incidents" },
  { icon: FileCheck2, text: "Who hasn't acknowledged the Code of Conduct?" },
] as const;

interface NectarRailProps {
  firstName?: string;
  askRoute?: "/dashboard/help" | "/dashboard/ask-nectar";
  className?: string;
  onClose?: () => void;
}

export function NectarRail({
  firstName = "there",
  askRoute = "/dashboard/help",
  className,
  onClose,
}: NectarRailProps) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");

  function goAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate({ to: askRoute, search: { q: trimmed } as never });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    goAsk(question);
  }

  return (
    <aside
      aria-label="Nectar"
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-[var(--hive-border)] bg-[var(--hive-sidebar)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--hive-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Hexagon className="h-4 w-4 text-[var(--hive-gold)]" strokeWidth={1.6} />
          <h2 className="font-display text-sm font-semibold tracking-tight text-[var(--hive-gold)]">
            Nectar
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--hive-text-muted)] hover:bg-[var(--hive-surface)] hover:text-[var(--hive-text)]"
            aria-label="Close Nectar"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-sm text-[var(--hive-text)]">
          Hi {firstName}, how can I help?
        </p>
        <div className="grid gap-2">
          {PROMPTS.map(({ icon: Icon, text }) => (
            <button
              key={text}
              type="button"
              onClick={() => goAsk(text)}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] px-3 py-2.5 text-left text-sm text-[var(--hive-text)] transition hover:border-[var(--hive-gold)]"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hive-gold)]" />
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--hive-border)] px-4 py-3">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <label htmlFor="nectar-rail-input" className="sr-only">
            Ask a question
          </label>
          <input
            id="nectar-rail-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            className="h-10 min-w-0 flex-1 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 text-sm text-[var(--hive-text)] placeholder:text-[var(--hive-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hive-gold)]/40"
          />
          <button
            type="submit"
            aria-label="Send to Nectar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--hive-gold)] text-[var(--hive-on-gold)] hover:bg-[var(--hive-gold-hover)] disabled:opacity-50"
            disabled={!question.trim()}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--hive-text-muted)]">
          Nectar can make mistakes. Verify important information.
        </p>
      </div>
    </aside>
  );
}
