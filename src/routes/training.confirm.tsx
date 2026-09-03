import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { formatUsdFromCents } from "@/lib/hive-pricing";
import {
  confirmTrainingOnlyCheckoutFn,
  type TrainingOnlyConfirmOrder,
} from "@/lib/training-only-checkout.functions";

export const Route = createFileRoute("/training/confirm")({
  validateSearch: (s: Record<string, unknown>): { session_id?: string } => {
    const sessionId = typeof s.session_id === "string" ? s.session_id.trim() : "";
    return sessionId.startsWith("cs_") ? { session_id: sessionId } : {};
  },
  head: () => ({
    meta: [{ title: "Training purchase — Provider Interface" }],
  }),
  component: TrainingConfirmPage,
});

function TrainingConfirmPage() {
  const search = Route.useSearch();
  const confirmFn = useServerFn(confirmTrainingOnlyCheckoutFn);
  const [order, setOrder] = useState<TrainingOnlyConfirmOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!search.session_id) {
      setError("Missing checkout session.");
      setLoading(false);
      return;
    }
    void confirmFn({ data: { sessionId: search.session_id } })
      .then((r) => {
        if (cancelled) return;
        setOrder(r.order);
        setError(r.error);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmFn, search.session_id]);

  const hasThirty = order?.seats.some((s) => s.includesThirtyDay) ?? false;
  const hasClass = order?.seats.some((s) => s.includesClassSeat) ?? false;

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
            {order?.paymentStatus === "paid" ? "Seats are paid" : "Confirming payment"}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#f3efe6]/62">
            This is not an office. You are not an admin. The office places class seats and sends
            30-day access from Provider Interface Executive.
          </p>

          <div className="mt-8 rounded-2xl border border-white/[0.10] bg-[#f3efe6] p-5 text-[#0b1220] sm:p-7">
            {loading ? (
              <p className="text-sm">Checking Stripe…</p>
            ) : error && !order ? (
              <p className="text-sm text-[#9f1239]">{error}</p>
            ) : order ? (
              <div data-testid="training-confirm-order">
                <p className="text-sm">
                  Receipt: <span className="font-medium">{order.buyerEmail}</span>
                  {order.buyerAgencyName ? ` · ${order.buyerAgencyName}` : ""}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {order.paymentStatus === "paid" ? "Paid" : "Unpaid"} ·{" "}
                  {formatUsdFromCents(order.amountCents)}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {order.seats.map((seat) => (
                    <li
                      key={seat.id}
                      className="flex justify-between gap-3 rounded-lg border border-[#0b1220]/10 bg-white/70 px-3 py-2"
                    >
                      <span>
                        <span className="font-medium">{seat.personName}</span>
                        <span className="block text-xs text-[#0b1220]/60">{seat.skuLabel}</span>
                      </span>
                      <span>{formatUsdFromCents(seat.unitCents)}</span>
                    </li>
                  ))}
                </ul>
                {hasClass ? (
                  <p className="mt-4 text-sm text-[#0b1220]/70">
                    CPR and Mandt are class seats. The office will place each person on a class
                    and email the details.
                  </p>
                ) : null}
                {hasThirty ? (
                  <p className="mt-3 text-sm text-[#0b1220]/70">
                    The 30-day course uses a training-only login — not Employees, Clients, or the
                    Scheduler. The office sends that access.
                  </p>
                ) : null}
                {error && order.paymentStatus !== "paid" ? (
                  <p className="mt-3 text-sm text-[#9f1239]">{error}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/training"
                className="inline-flex h-11 items-center justify-center rounded-md bg-[#0b1220] px-4 text-sm font-semibold text-[#f3efe6]"
              >
                Buy more seats
              </Link>
              <Link
                to="/login"
                search={{ next: "/training/course" }}
                className="inline-flex h-11 items-center justify-center rounded-md border border-[#0b1220]/20 px-4 text-sm font-medium text-[#0b1220]"
              >
                Training-only sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
