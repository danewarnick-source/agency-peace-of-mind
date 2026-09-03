import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SIGNUP_TRAINING_ADDONS } from "@/lib/pi-signup-pricing";
import { formatUsdFromCents } from "@/lib/hive-pricing";
import {
  TRAINING_ONLY_TERMS,
  cleanTrainingOnlyPeople,
  formatTrainingOnlyTotal,
  quoteTrainingOnlyPeople,
  type TrainingOnlyPersonRow,
  type TrainingOnlySku,
} from "@/lib/training-only";
import {
  createTrainingOnlyCheckoutFn,
  getTrainingOnlyPaymentsStatusFn,
} from "@/lib/training-only-checkout.functions";

const JAKARTA = '"Inter", ui-sans-serif, system-ui, sans-serif';

export const Route = createFileRoute("/training")({
  validateSearch: (s: Record<string, unknown>): { checkout?: string } =>
    s.checkout === "cancelled" ? { checkout: "cancelled" } : {},
  head: () => ({
    meta: [
      { title: "Training — Provider Interface" },
      {
        name: "description",
        content:
          "Buy CPR, 30-day, Mandt, or the pack without opening a Provider Interface office. Seats only. No subscription.",
      },
      { property: "og:title", content: "Training — Provider Interface" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TrainingPurchasePage,
});

function emptyPerson(): TrainingOnlyPersonRow {
  return { name: "", sku: "cpr_first_aid" };
}

function TrainingPurchasePage() {
  const search = Route.useSearch();
  const checkoutFn = useServerFn(createTrainingOnlyCheckoutFn);
  const paymentsStatusFn = useServerFn(getTrainingOnlyPaymentsStatusFn);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [people, setPeople] = useState<TrainingOnlyPersonRow[]>([emptyPerson()]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payStatus, setPayStatus] = useState<{
    paymentsConfigured: boolean;
    testMode: boolean;
    liveBlocked: boolean;
    message: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void paymentsStatusFn()
      .then((status) => {
        if (!cancelled) setPayStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setPayStatus({
            paymentsConfigured: false,
            testMode: false,
            liveBlocked: false,
            message: "Could not read payment status.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paymentsStatusFn]);

  const quote = useMemo(() => quoteTrainingOnlyPeople(people), [people]);
  const liveBlocked = payStatus?.liveBlocked === true;
  const canPay = !liveBlocked && (payStatus == null || payStatus.paymentsConfigured);

  const updatePerson = (index: number, patch: Partial<TrainingOnlyPersonRow>) => {
    setPeople((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const pay = async () => {
    const roster = cleanTrainingOnlyPeople(people);
    setBusy(true);
    try {
      const r = await checkoutFn({
        data: {
          buyerEmail,
          buyerAgencyName: agencyName,
          termsAccepted,
          people: roster,
        },
      });
      if (r.error || !r.url) {
        toast.error(r.error ?? "Could not start checkout. Stay on this page — do not use a live card.");
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch (e) {
      setBusy(false);
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1220] text-[#f3efe6]">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 pb-16 pt-12 sm:px-6 md:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f3efe6]/45">
            Training
          </p>
          <h1
            className="mt-3 text-3xl font-medium tracking-tight text-[#f3efe6]"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            Buy classes without the office
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#f3efe6]/62">
            Add each person and pick one seat. This is not a Provider Interface subscription.
            No office, no per-client plan. The office places class seats and sends 30-day access.
          </p>

          {search.checkout === "cancelled" ? (
            <p className="mt-4 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-[#f3efe6]/80">
              Checkout cancelled. Your roster is still here.
            </p>
          ) : null}

          <div
            className="mt-8 rounded-2xl border border-white/[0.10] bg-[#f3efe6] p-5 text-[#0b1220] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] sm:p-7"
            data-testid="training-only-card"
          >
            {liveBlocked ? (
              <div
                className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
                data-testid="stripe-live-blocked"
                style={{
                  background: "rgba(244,63,94,0.10)",
                  borderColor: "rgba(244,63,94,0.35)",
                  color: "#9f1239",
                }}
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Live charges are blocked.</strong>{" "}
                  {payStatus?.message ?? "Use a preview URL with test keys. Do not pay here."}
                </span>
              </div>
            ) : (
              <div
                className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
                data-testid="stripe-test-mode-hint"
                style={{
                  background: "rgba(244,169,58,0.12)",
                  borderColor: "rgba(180,120,20,0.45)",
                  color: "#7a4b00",
                }}
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>TEST MODE</strong> — no real charge. Use card 4242 4242 4242 4242, any
                  future expiry, any CVC, any ZIP.
                  {payStatus && !payStatus.paymentsConfigured ? (
                    <> {payStatus.message ?? "Payments are not set up on this host yet."}</>
                  ) : null}
                </span>
              </div>
            )}

            <div className="grid gap-4">
              <div>
                <Label htmlFor="training-buyer-email">Receipt email</Label>
                <input
                  id="training-buyer-email"
                  data-testid="training-buyer-email"
                  type="email"
                  autoComplete="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="you@agency.com"
                  className="mt-1 flex h-11 w-full rounded-md border border-[#0b1220]/15 bg-white px-3 text-sm text-[#0b1220] outline-none focus:ring-2 focus:ring-[#0b1220]/20"
                />
              </div>
              <div>
                <Label htmlFor="training-agency-name">Agency or org name (optional)</Label>
                <input
                  id="training-agency-name"
                  data-testid="training-agency-name"
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="For the receipt"
                  className="mt-1 flex h-11 w-full rounded-md border border-[#0b1220]/15 bg-white px-3 text-sm text-[#0b1220] outline-none focus:ring-2 focus:ring-[#0b1220]/20"
                />
              </div>
            </div>

            <div className="mt-6" data-testid="training-only-roster">
              <p className="text-sm font-semibold">Roster</p>
              <p className="mt-1 text-xs text-[#0b1220]/60">
                One person, one choice. Pack is all three for that person.
              </p>
              <ul className="mt-3 space-y-3">
                {people.map((person, index) => (
                  <li
                    key={`person-${index}`}
                    className="rounded-xl border border-[#0b1220]/10 bg-white/70 p-3"
                    data-testid={`training-person-${index}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        aria-label={`Person ${index + 1} name`}
                        data-testid={`training-person-name-${index}`}
                        value={person.name}
                        onChange={(e) => updatePerson(index, { name: e.target.value })}
                        placeholder="Name"
                        className="h-11 min-w-0 flex-1 rounded-md border border-[#0b1220]/15 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0b1220]/20"
                      />
                      {people.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove ${person.name || `person ${index + 1}`}`}
                          onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#0b1220]/55 hover:bg-[#0b1220]/5 hover:text-[#0b1220]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {SIGNUP_TRAINING_ADDONS.map((addon) => {
                        const selected = person.sku === addon.id;
                        return (
                          <button
                            key={addon.id}
                            type="button"
                            data-testid={`training-sku-${index}-${addon.id}`}
                            onClick={() => updatePerson(index, { sku: addon.id as TrainingOnlySku })}
                            className="rounded-lg border px-3 py-2 text-left"
                            style={{
                              borderColor: selected ? "#0b1220" : "rgba(11,18,32,0.12)",
                              background: selected ? "rgba(11,18,32,0.06)" : "white",
                            }}
                          >
                            <span className="block text-sm font-medium">{addon.name}</span>
                            <span className="block text-xs text-[#0b1220]/60">
                              {formatUsdFromCents(addon.priceCents)}
                              {addon.savingsHint ? ` · ${addon.savingsHint}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                data-testid="training-add-person"
                onClick={() => setPeople((rows) => [...rows, emptyPerson()])}
                className="mt-3 h-11 w-full border-[#0b1220]/20 bg-white text-[#0b1220] hover:bg-white sm:w-auto"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add a person
              </Button>
            </div>

            <div
              className="mt-6 rounded-xl border border-[#0b1220]/10 bg-white/70 p-4 text-sm"
              data-testid="training-only-total"
            >
              <p className="font-semibold">Running total</p>
              {quote.lines.length === 0 ? (
                <p className="mt-1 text-[#0b1220]/55">Add a person to see the total.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {quote.lines.map((line) => (
                    <li key={line.sku} className="flex justify-between gap-3">
                      <span>
                        {line.quantity} × {line.name}
                      </span>
                      <span className="font-medium">{formatUsdFromCents(line.lineCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 flex justify-between border-t border-[#0b1220]/10 pt-2 font-semibold">
                <span>Due now</span>
                <span>{formatTrainingOnlyTotal(quote.totalCents)}</span>
              </p>
            </div>

            <label className="mt-5 flex items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                data-testid="training-terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>{TRAINING_ONLY_TERMS}</span>
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                to="/signup"
                data-testid="training-office-link"
                className="text-sm text-[#0b1220]/60 underline-offset-4 hover:text-[#0b1220] hover:underline"
              >
                Need the office instead?
              </Link>
              <Button
                type="button"
                data-testid="training-pay"
                onClick={() => void pay()}
                disabled={busy || !canPay || quote.people === 0 || !termsAccepted}
                className="h-11 w-full min-w-0 border-0 bg-[#0b1220] text-[#f3efe6] hover:bg-[#111827] sm:w-auto sm:min-w-[160px]"
                style={{ fontFamily: JAKARTA, fontWeight: 700 }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay with Stripe"}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
