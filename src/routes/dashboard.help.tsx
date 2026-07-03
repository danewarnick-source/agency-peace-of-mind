import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Hexagon, Send, Loader2, ArrowRight, BarChart3, Sparkles, RotateCcw, LifeBuoy, CheckCircle2, ListChecks } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { askNectarHelp, escalateHelpToHive, getHelpTicketStatus, type NectarHelpReply } from "@/lib/nectar-help.functions";
import { NectarBadge, NectarMark, NectarButton } from "@/components/nectar/nectar-brand";
import { NectarTaskCenter } from "@/components/nectar/nectar-task-center";
import { NectarAnswer } from "@/components/nectar/nectar-answer";
import { FeatureGate } from "@/components/upgrade-gate";

export const Route = createFileRoute("/dashboard/help")({
  head: () => ({ meta: [{ title: "Need help? — NECTAR" }] }),
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q.trim().length > 0
      ? search.q.slice(0, 1000)
      : undefined,
  }),
  component: HelpPage,
});


interface ChatMsg {
  id: string;
  role: "user" | "nectar";
  text: string;
  reply?: NectarHelpReply;
}

const STARTERS_ADMIN = [
  "Where do I set a client's monthly unit cap?",
  "How do I add a staff member?",
  "Where do I assign a caseload?",
  "How does clock-out paperwork work?",
  "Where can I see remaining units for a client?",
  "How do I pull a 520?",
];
const STARTERS_STAFF = [
  "Where do I clock in?",
  "How do I write a daily log?",
  "Where can I see my hours this period?",
  "What is NECTAR pay?",
];

const HISTORY_KEY = "hive.nectar.helpHistory";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function HelpPage() {
  const { data: org } = useCurrentOrg();
  const role = org?.role ?? "employee";
  const isAdmin = role === "admin" || role === "manager" || role === "super_admin";
  const starters = isAdmin ? STARTERS_ADMIN : STARTERS_STAFF;
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [pendingGoal, setPendingGoal] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askNectarHelp);
  const escalate = useServerFn(escalateHelpToHive);
  const getStatus = useServerFn(getHelpTicketStatus);

  useEffect(() => { setRecent(loadRecent()); }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Auto-send a question routed in from the global NECTAR search bar
  // (e.g. /dashboard/help?q=…). Fires once, then clears the search param.
  const { q: initialQ } = useSearch({ from: "/dashboard/help" });
  const initialFired = useRef(false);
  useEffect(() => {
    if (initialFired.current) return;
    if (!initialQ || !org?.organization_id) return;
    initialFired.current = true;
    send(initialQ);
    navigate({ to: "/dashboard/help", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, org?.organization_id]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ticketQ = useQuery({
    queryKey: ["help-ticket", ticketId],
    enabled: !!ticketId,
    queryFn: () => getStatus({ data: { ticketId: ticketId! } }),
    refetchInterval: 15_000,
  });


  const m = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, role, organizationId: org?.organization_id ?? "" } }),
    onSuccess: (reply, q) => {
      setMessages((prev) => [
        ...prev,
        { id: `n-${Date.now()}`, role: "nectar", text: reply.answer, reply },
      ]);
      const next = [q, ...recent.filter((x) => x !== q)].slice(0, 8);
      setRecent(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (e) => {
      const text = e instanceof Error ? e.message : "Something went wrong — please try again.";
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "nectar", text }]);
    },
  });

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (q.length < 2) return;
    // Heuristic: if the user asks for a walkthrough, open the Task Center pre-filled.
    if (/\b(walk me through|guide me|help me with|show me how|tour)\b/i.test(q)) {
      setPendingGoal(q);
      setTaskCenterOpen(true);
      setInput("");
      return;
    }
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: q }]);
    setInput("");
    m.mutate(q);
  }

  function clearChat() {
    setMessages([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const escalateM = useMutation({
    mutationFn: async () => {
      const lastUser = [...messages].reverse().find((mm) => mm.role === "user");
      const context = messages.slice(-6).map((mm) => `${mm.role === "user" ? "Me" : "NECTAR"}: ${mm.text}`).join("\n");
      const question = lastUser?.text ?? "I'd like to talk to a human at HIVE.";
      return escalate({ data: { question, context, organizationId: org?.organization_id ?? "" } });
    },
    onSuccess: (r) => {
      setTicketId(r.ticketId);
      setMessages((prev) => [...prev, {
        id: `n-esc-${Date.now()}`, role: "nectar",
        text: "I've connected you with the HIVE team — someone will follow up shortly. You can keep chatting with me in the meantime.",
      }]);
    },
    onError: (e) => {
      setMessages((prev) => [...prev, {
        id: `e-esc-${Date.now()}`, role: "nectar",
        text: e instanceof Error ? e.message : "Couldn't reach the HIVE team — please try again.",
      }]);
    },
  });


  return (
    <FeatureGate featureKey="nectar">
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2 sm:mb-3 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <NectarMark size="md" />
          <div>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <NectarBadge size="xs" />
              <span>Need help? NECTAR can help.</span>
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[#0f1b3d] sm:text-2xl">Ask NECTAR</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Your friendly guide to using HIVE — ask where things live or how a workflow works.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 sm:gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPendingGoal(undefined); setTaskCenterOpen(true); }}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-[#d97a1c] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#b8651a]"
            >
              <ListChecks className="h-3.5 w-3.5" /> Guide me
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => escalateM.mutate()}
            disabled={escalateM.isPending || !!ticketId}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-1 text-xs font-medium text-[#9a3412] hover:bg-[#ffedd5] disabled:opacity-60"
          >
            {escalateM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LifeBuoy className="h-3.5 w-3.5" />}
            {ticketId ? "Connected with HIVE" : "Ask the HIVE team"}
          </button>
        </div>
      </header>


      {ticketId && ticketQ.data && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-xs text-[#1e40af]">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            HIVE support ticket — status: <span className="font-semibold capitalize">{ticketQ.data.status.replace(/_/g, " ")}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[#1e40af]/70">
            Updated {new Date(ticketQ.data.updated_at).toLocaleString()}
          </span>
        </div>
      )}


      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-[#fbfaf7] p-4 shadow-sm"
      >
        {messages.length === 0 && (
          <EmptyState
            starters={starters}
            recent={recent}
            onPick={send}
          />
        )}

        <ul className="space-y-3">
          {messages.map((msg) => (
            <li key={msg.id}>
              {msg.role === "user" ? (
                <UserBubble text={msg.text} />
              ) : (
                <NectarBubble
                  text={msg.text}
                  reply={msg.reply}
                  onFollowUp={send}
                  onNavigate={(path) => {
                    // Use raw navigation since paths come from AI with literal $clientId etc.
                    if (path.includes("$clientId")) {
                      navigate({ to: "/dashboard/billing" });
                    } else {
                      window.location.assign(path);
                    }
                  }}
                />
              )}
            </li>
          ))}
          {m.isPending && (
            <li><NectarTypingBubble /></li>
          )}
        </ul>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="mt-3 flex gap-2"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask NECTAR anything about HIVE…"
          className="min-h-[44px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d97a1c]/40"
          disabled={m.isPending}
        />
        <NectarButton
          type="submit"
          disabled={input.trim().length < 2}
          loading={m.isPending}
          icon={<Send className="h-4 w-4" />}
        >
          Send
        </NectarButton>
      </form>
      <NectarTaskCenter
        open={taskCenterOpen}
        onOpenChange={(o) => { setTaskCenterOpen(o); if (!o) setPendingGoal(undefined); }}
        initialGoal={pendingGoal}
      />
    </div>
    </FeatureGate>
  );
}

function EmptyState({
  starters, recent, onPick,
}: { starters: string[]; recent: string[]; onPick: (q: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const DEFAULT_COUNT = 3;
  const visible = showAll ? starters : starters.slice(0, DEFAULT_COUNT);
  const hasMore = starters.length > DEFAULT_COUNT;
  return (
    <div className="flex flex-col items-center gap-3 py-3 text-center sm:gap-4 sm:py-8">
      <div className="hidden flex-col items-center gap-3 sm:flex">
        <NectarMark size="lg" />
        <div>
          <h2 className="font-display text-lg font-semibold text-[#0f1b3d]">Hi! I'm NECTAR.</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Ask me where things live in HIVE or how a workflow works — I'll point you straight to it.
          </p>
        </div>
      </div>
      <div className="w-full max-w-xl">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:mb-2 sm:text-xs">Try one of these</p>
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
          {visible.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="min-h-[36px] rounded-full border border-[#fed7aa] bg-white px-2.5 py-1 text-xs text-[#0f1b3d] shadow-sm hover:bg-[#fff7ed] sm:min-h-[44px] sm:px-3 sm:py-1.5"
            >
              {s}
            </button>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="min-h-[36px] rounded-full border border-border bg-white px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted sm:min-h-[44px] sm:px-3 sm:py-1.5"
            >
              {showAll ? "Fewer" : "More suggestions"}
            </button>
          )}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="w-full max-w-xl">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:mb-2 sm:text-xs">Recent</p>
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {recent.slice(0, showAll ? recent.length : 3).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="min-h-[36px] rounded-full border border-border bg-white px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted sm:min-h-[44px] sm:px-3 sm:py-1.5"
              >
                {r.length > 60 ? r.slice(0, 57) + "…" : r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#0f1b3d] px-3.5 py-2 text-sm text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

function NectarBubble({
  text, reply, onFollowUp, onNavigate,
}: {
  text: string;
  reply?: NectarHelpReply;
  onFollowUp: (q: string) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f1b3d] text-[#d97a1c] shadow-sm">
        <Hexagon className="h-4 w-4" fill="currentColor" />
      </div>
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-2xl rounded-tl-sm border border-[#fed7aa] bg-white px-3.5 py-2.5 text-sm text-[#0f1b3d] shadow-sm">
          <NectarAnswer text={text} />
        </div>
        {reply?.isDataRequest && (
          <button
            type="button"
            onClick={() => onNavigate("/dashboard/billing/nectar")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-1.5 text-xs font-medium text-[#9a3412] hover:bg-[#ffedd5]"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            That looks like a data question — open Ask NECTAR report builder
          </button>
        )}
        {reply?.deepLink && (
          <button
            type="button"
            onClick={() => onNavigate(reply.deepLink!.path)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[#d97a1c] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#b8651a]"
          >
            {reply.deepLink.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        {reply?.followUps && reply.followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {reply.followUps.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFollowUp(f)}
                className="min-h-[44px] rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                <Sparkles className="mr-1 inline h-3 w-3 text-[#d97a1c]" />
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NectarTypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f1b3d] text-[#d97a1c] shadow-sm">
        <Hexagon className="h-4 w-4" fill="currentColor" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-[#fed7aa] bg-white px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d97a1c] [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d97a1c] [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d97a1c]" />
        </span>
      </div>
    </div>
  );
}
