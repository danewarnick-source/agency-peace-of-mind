import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, Shield, AlertTriangle } from "lucide-react";
import {
  askNectarStaff,
  type NectarStaffReply,
} from "@/lib/nectar-staff.functions";
import {
  NectarMark,
  NectarBadge,
  NectarButton,
} from "@/components/nectar/nectar-brand";
import { NectarAnswer } from "@/components/nectar/nectar-answer";
import { useMobileShellContainer } from "./mobile-shell-context";
import { useActiveShiftBarVisible } from "@/hooks/use-active-shift-bar";
import { useCurrentOrg } from "@/hooks/use-org";

interface ChatMsg {
  id: string;
  role: "user" | "nectar";
  text: string;
  reply?: NectarStaffReply;
}

const STARTERS = [
  "What are my client's PCSP goals today?",
  "Walk me through the reimbursement process.",
  "What's the medication procedure for a missed dose?",
  "How many hours have I worked this period?",
];

export interface AskNectarStaffProps {
  /** Pre-fill a focused client (only used if the staff is actually assigned). */
  clientId?: string;
  /** Compact heading variant for embedding into sheets. */
  compact?: boolean;
}

/**
 * Mobile-friendly scoped NECTAR chat for staff.
 *
 * Server-side scope enforcement lives in `askNectarStaff` — this component
 * just renders the conversation. No DB persistence: each session is in
 * React state only.
 */
export function AskNectarStaff({ clientId, compact = false }: AskNectarStaffProps) {
  const ask = useServerFn(askNectarStaff);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [viewportInset, setViewportInset] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const { container } = useMobileShellContainer();
  const barVisible = useActiveShiftBarVisible();

  const bottomOffset = useMemo(() => {
    const navHeight = 56;
    const shiftBarHeight = barVisible ? 56 : 0;
    const persistentBarsOffset = navHeight + shiftBarHeight;
    return viewportInset > 0 ? viewportInset : persistentBarsOffset;
  }, [barVisible, viewportInset]);

  const mutation = useMutation({
    mutationFn: async (question: string) =>
      ask({ data: { question, clientId } }),
    onSuccess: (reply) => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "nectar",
          text: reply.answer,
          reply,
        },
      ]);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "nectar", text: msg },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mutation.isPending]);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const updateInset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setViewportInset(inset);
    };

    updateInset();
    vv.addEventListener("resize", updateInset);
    vv.addEventListener("scroll", updateInset);

    return () => {
      vv.removeEventListener("resize", updateInset);
      vv.removeEventListener("scroll", updateInset);
    };
  }, []);

  const send = (q: string) => {
    const text = q.trim();
    if (!text || mutation.isPending) return;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setInput("");
    mutation.mutate(text);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const isEmpty = messages.length === 0;

  const composerMount = container;

  const composer = (
    <div
      className="absolute inset-x-0 z-30 border-t border-border bg-background/98 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/92"
      style={{
        bottom: `${bottomOffset}px`,
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Message NECTAR…"
          rows={1}
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-full border border-input bg-background px-4 py-2.5 text-sm leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a93a]/40"
          disabled={mutation.isPending}
        />
        <NectarButton
          type="submit"
          variant="amber"
          loading={mutation.isPending}
          icon={<Send className="h-4 w-4" />}
          disabled={!input.trim() || mutation.isPending}
          className="h-11 min-w-[44px] rounded-full"
        >
          <span className="sr-only">Send</span>
        </NectarButton>
      </form>
    </div>
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        {/* Header — fixed at top */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-[#0d112b] px-4 py-2.5 text-white">
          <NectarMark size={compact ? "sm" : "md"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <NectarBadge size="xs" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#fed7aa]/90">
                Staff assistant
              </span>
            </div>
            <h2 className="truncate font-display text-sm font-bold leading-tight tracking-tight">
              Ask NECTAR · Staff
            </h2>
          </div>
          <span
            title="Client information shown here is for the people on your caseload — treat it as confidential PHI."
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#f4a93a]/40 bg-[#f4a93a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fed7aa]"
          >
            <Shield className="h-3 w-3" /> PHI
          </span>
        </div>

        {/* Conversation frame — internal scroll only */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
          style={{
            paddingBottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom) + 5.5rem)`,
          }}
        >
          {isEmpty && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-[#f4a93a]/30 bg-[#fff7ed] px-3 py-2 text-[11px] leading-snug text-[#7a4a0a]">
                <Shield className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Client info here is for people on your caseload — treat as confidential PHI.
                </span>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                I help with company policies, your trainings, job duties, your pay,
                and the people on your caseload — their goals, safety, and meds.
              </p>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Try asking
                </p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block min-h-[40px] w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground transition hover:border-[#f4a93a]/50 hover:bg-[#fff7ed] active:scale-[0.99]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#0d112b] px-3.5 py-2 text-sm text-white shadow-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <NectarMark size="sm" className="mt-0.5" />
                <div className="max-w-[85%] flex-1 rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 shadow-sm">
                  {m.reply?.refused && (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9a3412]">
                      <AlertTriangle className="h-3 w-3" />
                      Out of scope
                    </div>
                  )}
                  <NectarAnswer text={m.text} />
                  {m.reply && m.reply.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.reply.citations.map((c, i) => (
                        <span
                          key={`${c.type}-${c.id}-${i}`}
                          className="inline-flex items-center rounded border border-[#fed7aa] bg-[#fff7ed] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#9a3412]"
                          title={c.title}
                        >
                          {c.type === "pcsp"
                            ? "PCSP"
                            : c.type === "medication"
                              ? "Med"
                              : c.type}
                          {" · "}
                          {c.title.length > 28 ? c.title.slice(0, 26) + "…" : c.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {mutation.isPending && (
            <div className="flex gap-2">
              <NectarMark size="sm" className="mt-0.5" />
              <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>
      </div>
      {composerMount ? createPortal(composer, composerMount) : null}
    </>
  );
}
