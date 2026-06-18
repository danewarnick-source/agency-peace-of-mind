import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Book a demo — HIVE" },
      {
        name: "description",
        content:
          "Talk to someone who has actually billed a Medicaid waiver. Book a 30-minute walkthrough of HIVE for your DSPD agency.",
      },
      { property: "og:title", content: "Book a demo — HIVE" },
      {
        property: "og:description",
        content: "A 30-minute walkthrough of HIVE for DSPD agency directors and owners.",
      },
    ],
  }),
  component: DemoPage,
});

const NAVY_BG =
  "radial-gradient(1000px 600px at 80% 110%, rgba(244,169,58,0.18), transparent 60%), linear-gradient(140deg, #141a3d 0%, #0d112b 100%)";
const JAKARTA = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const AMBER = "#f4a93a";
const AMBER_GRAD = "linear-gradient(135deg, #f4a93a 0%, #f59324 100%)";

function DemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", agency: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const valid =
    form.name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.agency.trim().length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    // Placeholder — real Calendly / CRM hook-up swaps in here later.
    await new Promise((r) => setTimeout(r, 600));
    setSubmitted(true);
    setBusy(false);
  };

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{ background: NAVY_BG, fontFamily: JAKARTA }}
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <Hexagon className="h-6 w-6" style={{ color: AMBER }} />
          <span className="text-lg font-semibold tracking-tight">HIVE</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/pricing" className="text-white/70 hover:text-white">
            Pricing
          </Link>
          <Link to="/signup">
            <Button
              size="sm"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              style={{ minHeight: 44 }}
            >
              Get started
            </Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24 pt-10">
        <div
          className="rounded-2xl p-7 sm:p-10"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.55)",
          }}
        >
          {submitted ? (
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "rgba(244,169,58,0.16)" }}
              >
                <CheckCircle2 className="h-7 w-7" style={{ color: AMBER }} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Demo request received
              </h1>
              <p className="mt-3 text-white/70">
                We&apos;ll be in touch within one business day to schedule your 30-minute walkthrough.
                Check your email for a confirmation.
              </p>
              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link to="/signup" className="w-full sm:w-auto">
                  <Button
                    className="w-full text-[#0d112b] hover:opacity-90 sm:w-auto"
                    style={{ background: AMBER_GRAD, minHeight: 44 }}
                  >
                    Get started now <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                    style={{ minHeight: 44 }}
                  >
                    Back to home
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/60">
                <Calendar className="h-3.5 w-3.5" style={{ color: AMBER }} />
                Book a demo
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Talk to someone who has actually billed a Medicaid waiver.
              </h1>
              <p className="mt-3 text-white/70">
                Tell us a little about your agency and we&apos;ll set up a 30-minute walkthrough — no
                sales script, just the parts of HIVE that matter for your services.
              </p>

              <form onSubmit={submit} className="mt-7 grid gap-4">
                <Field label="Your name">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Work email">
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Agency name">
                  <input
                    required
                    value={form.agency}
                    onChange={(e) => setForm({ ...form, agency: e.target.value })}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="What do you want to see? (optional)">
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>

                <Button
                  type="submit"
                  disabled={!valid || busy}
                  className="mt-2 w-full text-[#0d112b] hover:opacity-90"
                  style={{ background: AMBER_GRAD, minHeight: 44 }}
                >
                  {busy ? "Sending…" : "Request demo"}
                  {!busy && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
                <p className="text-center text-xs text-white/50">
                  Prefer to dive in? <Link to="/signup" className="underline hover:text-white">Get started now</Link>.
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  fontFamily: JAKARTA,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
        {label}
      </Label>
      {children}
    </div>
  );
}
