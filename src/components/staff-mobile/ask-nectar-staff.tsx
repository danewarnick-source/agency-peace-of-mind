import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, Shield, AlertTriangle } from "lucide-react";
import {
  askNectarStaff,
  type NectarStaffReply,
} from "@/lib/nectar-staff.functions";
import {
  NectarMark,
  NectarButton,
} from "@/components/nectar/nectar-brand";
import { NectarAnswer } from "@/components/nectar/nectar-answer";
import { useMobileShellContainer } from "./mobile-shell-context";
import { useActiveShiftBarVisible } from "@/hooks/use-active-shift-bar";
import { useCurrentOrg } from "@/hooks/use-org";
import { staffNectarFailureMessage } from "@/lib/nectar-staff-errors";
import {
  STAFF_CLOCK_BAR_PX,
  STAFF_TAB_BAR_OFFSET_CSS,
  STAFF_TAB_BAR_PX,
} from "@/lib/staff-phone-chrome";

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

/** Ignore rubber-band / swipe; only treat a real keyboard shrink as lift. */
const KEYBOARD_LIFT_MIN_PX = 80;

export interface AskNectarStaffProps {
  /** Pre-fill a focused client (only used if the staff is actually assigned). */
  clientId?: string;
  /** Compact heading variant for embedding into sheets. */
  compact?: boolean;
  /** Auto-send this question once on mount. */
  initialQuestion?: string;
}

/**
 * Mobile-friendly scoped NECTAR chat for staff.
 *
 * Server-side scope enforcement lives in `askNectarStaff` — this component
 * just renders the conversation. No DB persistence: each session is in
 * React state only.
 *
 * Composer is an in-flow shrink-0 footer (not a portal). Swipe / overscroll
 * on the thread cannot hide it. Bottom padding clears the clocked-in bar.
 */
export function AskNectarStaff({ clientId, initialQuestion }: AskNectarStaffProps) {
  const ask = useServerFn(askNectarStaff);
  const { data: org } = useCurrentOrg();
  const organizationId = org?.organization_id;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [keyboardLift, setKeyboardLift] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const { container } = useMobileShellContainer();
  const barVisible = useActiveShiftBarVisible();
  const inStaffShell = !!container;

  const chromePadCss = useMemo(() => {
    if (!inStaffShell) return "0.75rem";
    if (keyboardLift >= KEYBOARD_LIFT_MIN_PX) {
      return `calc(${keyboardLift}px + 0.5rem)`;
    }
    if (barVisible) {
      return `calc(${STAFF_TAB_BAR_PX + STAFF_CLOCK_BAR_PX}px + env(safe-area-inset-bottom, 0px) + 0.5rem)`;
    }
    return `calc(${STAFF_TAB_BAR_OFFSET_CSS} + 0.5rem)`;
  }, [barVisible, inStaffShell, keyboardLift]);

  const mutation = useMutation({
    mutationFn: async (question: string) =>
      ask({ data: { question, clientId, organizationId: organizationId ?? "" } }),
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
      const raw = e instanceof Error ? e.message : "Something went wrong.";
      const statusMatch = raw.match(/AI error \((\d+)\)/);
      const msg = statusMatch
        ? staffNectarFailureMessage(Number(statusMatch[1]), raw)
        : raw;
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

    const updateKeyboard = () => {
      const lift = Math.max(0, window.innerHeight - vv.height);
      setKeyboardLift(lift >= KEYBOARD_LIFT_MIN_PX ? lift : 0);
    };

    updateKeyboard();
    vv.addEventListener("resize", updateKeyboard);
    return () => {
      vv.removeEventListener("resize", updateKeyboard);
    };
  }, []);

  const send = (q: string) => {
    const text = q.trim();
    if (!text || mutation.isPending) return;
    if (!organizationId) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text },
        { id: crypto.randomUUID(), role: "nectar", text: "Still loading your workspace — try again in a moment." },
      ]);
      return;
    }
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setInput("");
    mutation.mutate(text);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  // Auto-send an initial question (e.g. from the global NECTAR search bar) once
  // the org is loaded, only once per mount.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (!initialQuestion || !organizationId) return;
    firedRef.current = true;
    send(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, organizationId]);

  const isEmpty = messages.length === 0;

  return (
    <div
      data-ask-nectar-chat
      className="flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-card"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-none px-4 py-3"
      >
        {isEmpty && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-[var(--hive-gold)]/30 bg-[#fff7ed] px-3 py-2 text-[11px] leading-snug text-[#7a4a0a]">
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
                  className="block min-h-[40px] w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground transition hover:border-[var(--hive-gold)]/50 hover:bg-[#fff7ed] active:scale-[0.99]"
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
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--hive-text)] px-3.5 py-2 text-sm text-white shadow-sm">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <NectarMark size="sm" className="mt-0.5" ornament={false} />
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
            <NectarMark size="sm" className="mt-0.5" ornament={false} />
            <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form
        data-ask-nectar-composer
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="shrink-0 border-t border-border bg-background/98 px-3 pt-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/92"
        style={{ paddingBottom: chromePadCss }}
      >
        <div className="flex items-end gap-2">
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
            placeholder="Ask NECTAR anything about your training…"
            rows={1}
            className="min-h-[48px] max-h-32 flex-1 resize-none rounded-full border border-input bg-background px-4 py-3 text-sm leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hive-gold)]/40"
            disabled={mutation.isPending}
          />
          <NectarButton
            type="submit"
            variant="amber"
            loading={mutation.isPending}
            icon={<Send className="h-4 w-4" />}
            disabled={!input.trim() || mutation.isPending}
            className="h-12 min-w-[48px] rounded-full"
          >
            <span className="sr-only">Send</span>
          </NectarButton>
        </div>
      </form>
    </div>
  );
}
