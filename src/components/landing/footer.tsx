import { Link } from "@tanstack/react-router";
import { Hexagon } from "lucide-react";
import { HexBackdrop } from "@/components/brand/hex-backdrop";

export function Footer() {
  return (
    <footer
      className="relative overflow-hidden border-t border-white/5 py-14 text-white"
      style={{ background: "linear-gradient(140deg, #141a3d 0%, #0d112b 100%)" }}
    >
      <HexBackdrop opacity={0.04} glow={false} />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-start">
          <div className="max-w-sm">
            <Link to="/" className="flex items-center gap-2.5 font-semibold">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] backdrop-blur">
                <Hexagon className="h-4 w-4 text-[color:var(--amber-500)]" strokeWidth={2.5} />
              </span>
              <span className="text-[15px]">
                HIVE <span className="ml-1 text-xs font-normal text-white/55">— powered by NECTAR™</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              Modern workforce intelligence for care teams that take compliance seriously.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm md:grid-cols-3">
            <Link to="/pricing" className="text-white/60 transition hover:text-[color:var(--amber-500)]">Pricing</Link>
            <Link to="/contact" className="text-white/60 transition hover:text-[color:var(--amber-500)]">Contact</Link>
            <Link to="/login" className="text-white/60 transition hover:text-[color:var(--amber-500)]">Sign in</Link>
            <Link to="/signup" className="text-white/60 transition hover:text-[color:var(--amber-500)]">Sign up</Link>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/45 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} HIVE. All rights reserved.</p>
          <p>HIPAA · 21st Century Cures Act · SOC 2-aligned</p>
        </div>
      </div>
    </footer>
  );
}
