import { Link } from "@tanstack/react-router";
import { PiWordmark } from "@/components/pi-landing/pi-mark";

export function PiPublicFooter() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#0b1220] py-12 text-[#f3efe6]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-start md:justify-between">
        <PiWordmark to="/" compact />
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#f3efe6]/70">
          <Link to="/pricing" className="hover:text-[#f3efe6]">
            Pricing
          </Link>
          <Link to="/login" className="hover:text-[#f3efe6]">
            Sign in
          </Link>
          <Link to="/contact" className="hover:text-[#f3efe6]">
            Contact
          </Link>
          <Link to="/terms" className="hover:text-[#f3efe6]">
            Terms
          </Link>
          <Link to="/baa" className="hover:text-[#f3efe6]">
            BAA
          </Link>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl px-5 text-xs text-[#f3efe6]/40 sm:px-8">
        © {new Date().getFullYear()} Provider Interface. All rights reserved.
      </div>
    </footer>
  );
}
