import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { HexBackdrop } from "@/components/brand/hex-backdrop";

export function CTA() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="relative overflow-hidden rounded-3xl p-10 text-center text-white shadow-[var(--shadow-elegant)] md:p-16"
          style={{ background: "linear-gradient(140deg, #141a3d 0%, #0d112b 100%)" }}
        >
          <HexBackdrop opacity={0.05} />
          <div className="relative">
            <h2 className="text-balance text-3xl font-extrabold tracking-tight md:text-4xl">
              Ready to retire the spreadsheet?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Start a free 14-day trial. Invite your team in minutes. No credit card required.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/signup">
                  Start free trial <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghostOnDark">
                <Link to="/contact">Talk to sales</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
