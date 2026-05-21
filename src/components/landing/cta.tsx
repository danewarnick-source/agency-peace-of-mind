import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-3xl bg-[image:var(--gradient-hero)] p-10 text-center text-white shadow-[var(--shadow-elegant)] md:p-16">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Ready to retire the spreadsheet?</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Start a free 14-day trial. Invite your team in minutes. No credit card required.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link to="/signup">Start free trial <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link to="/contact">Talk to sales</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
