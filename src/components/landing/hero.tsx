import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, GraduationCap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: "radial-gradient(circle at 20% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 60%, white 0%, transparent 35%)",
      }} />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            <GraduationCap className="h-3.5 w-3.5" />
            Employee training & certification, simplified
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Train your team. Track every certification.{" "}
            <span className="bg-gradient-to-r from-white to-[oklch(0.85_0.12_200)] bg-clip-text text-transparent">
              Stay audit-ready.
            </span>
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-white/80 md:text-xl">
            Care Academy is the modern training platform for teams that take compliance seriously.
            Assign courses, monitor progress, and issue verifiable certificates — all in one place.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link to="/signup">Start free trial <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            {["14-day free trial", "No credit card", "Cancel anytime"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[oklch(0.85_0.12_200)]" /> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
