import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

/**
 * Shared-device timeout. After IDLE_MS of no touch/click/key on the client
 * profile route, an opaque blur overlay is shown. The caregiver must re-enter
 * their 4-digit numeric PIN to unlock the records.
 *
 * PIN storage: per-user, hashed (SubtleCrypto SHA-256), in localStorage.
 * First lock walks the user through setting a PIN. This is a frontline
 * shared-device convenience layer; do not treat as a primary auth control.
 */
const IDLE_MS = 3 * 60 * 1000; // 3 minutes

const ACTIVITY_EVENTS = [
  "pointerdown",
  "touchstart",
  "mousemove",
  "keydown",
  "scroll",
  "wheel",
] as const;

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pinKey(userId: string) {
  return `staff_pin_v1:${userId}`;
}

export function IdlePinLock() {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<"verify" | "set">("verify");
  const [pinInput, setPinInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Decide which flow to show whenever we lock.
  const openLock = useCallback(() => {
    if (!user) return;
    const stored = localStorage.getItem(pinKey(user.id));
    setMode(stored ? "verify" : "set");
    setPinInput("");
    setConfirmInput("");
    setError(null);
    setLocked(true);
  }, [user]);

  const resetTimer = useCallback(() => {
    if (locked) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(openLock, IDLE_MS);
  }, [locked, openLock]);

  useEffect(() => {
    if (!user) return;
    resetTimer();
    const handler = () => resetTimer();
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handler, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!/^\d{4}$/.test(pinInput)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (mode === "set") {
      if (pinInput !== confirmInput) {
        setError("PINs do not match.");
        return;
      }
      const h = await hashPin(pinInput);
      localStorage.setItem(pinKey(user.id), h);
      toast.success("Access PIN saved on this device.");
      setLocked(false);
      resetTimer();
      return;
    }
    const stored = localStorage.getItem(pinKey(user.id));
    const h = await hashPin(pinInput);
    if (h !== stored) {
      setError("Incorrect PIN. Try again.");
      setPinInput("");
      return;
    }
    setLocked(false);
    resetTimer();
  }

  if (!user || !locked) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Session suspended — re-enter PIN"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Session Suspended</h2>
            <p className="text-xs text-muted-foreground">
              {mode === "set"
                ? "Set a 4-digit access PIN to protect this device."
                : "Enter your staff access PIN to resume."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {mode === "set" ? "New PIN" : "PIN"}
            </span>
            <div className="relative">
              <input
                autoFocus
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pinInput}
                onChange={(e) => {
                  setError(null);
                  setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                }}
                className="h-12 w-full rounded-lg border border-input bg-background pr-10 text-center font-mono text-2xl tracking-[0.6em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                placeholder="••••"
                aria-label="4-digit PIN"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPin((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {mode === "set" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confirm PIN
              </span>
              <div className="relative">
                <input
                  type={showConfirmPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={confirmInput}
                  onChange={(e) => {
                    setError(null);
                    setConfirmInput(
                      e.target.value.replace(/\D/g, "").slice(0, 4),
                    );
                  }}
                  className="h-12 w-full rounded-lg border border-input bg-background pr-10 text-center font-mono text-2xl tracking-[0.6em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                  placeholder="••••"
                  aria-label="Confirm 4-digit PIN"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPin((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
                >
                  {showConfirmPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="h-12 w-full text-base">
            <ShieldCheck className="mr-2 h-4 w-4" />
            {mode === "set" ? "Save PIN & unlock" : "Unlock"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Auto-locks after 3 minutes of inactivity.
          </p>
        </form>
      </div>
    </div>
  );
}
