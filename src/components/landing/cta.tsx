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
              Book a demo with someone who has actually billed a Medicaid waiver — not a sales script.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <a href="https://calendly.com/hive-booking" target="_blank" rel="noopener noreferrer">
                  Book a demo <ArrowRight className="ml-1 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="ghostOnDark">
                <Link to="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
