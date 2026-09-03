import { Link } from "@tanstack/react-router";
import { PiWordmark } from "@/components/pi-landing/pi-mark";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.08] bg-[#0b1220] py-14 text-[#f3efe6]">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-start">
          <PiWordmark to="/" compact />

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm md:grid-cols-3">
            <Link to="/pricing" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Pricing
            </Link>
            <Link to="/training" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Training
            </Link>
            <Link to="/contact" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Contact
            </Link>
            <Link to="/login" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Sign in
            </Link>
            <Link to="/signup" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Get started
            </Link>
            <Link to="/terms" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              Terms
            </Link>
            <Link to="/baa" className="text-[#f3efe6]/60 transition hover:text-[#f3efe6]">
              BAA
            </Link>
          </div>
        </div>
        <div className="mt-12 border-t border-white/[0.08] pt-6 text-xs text-[#f3efe6]/40">
          <p>© {new Date().getFullYear()} Provider Interface. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
