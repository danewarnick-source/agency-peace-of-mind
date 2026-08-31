import { Link } from "@tanstack/react-router";
import { HiveWordmark } from "@/components/brand/hive-mark";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-[var(--hive-border)] bg-[var(--hive-bg)] py-14 text-[var(--hive-text)]">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-start">
          <HiveWordmark to="/" tone="canvas" />

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm md:grid-cols-3">
            <Link to="/pricing" className="text-[var(--hive-text-muted)] transition hover:text-[var(--hive-gold)]">
              Pricing
            </Link>
            <Link to="/contact" className="text-[var(--hive-text-muted)] transition hover:text-[var(--hive-gold)]">
              Contact
            </Link>
            <Link to="/login" className="text-[var(--hive-text-muted)] transition hover:text-[var(--hive-gold)]">
              Sign in
            </Link>
            <Link to="/signup" className="text-[var(--hive-text-muted)] transition hover:text-[var(--hive-gold)]">
              Get started
            </Link>
          </div>

          <p className="font-medium text-[var(--hive-gold)]">hivecertify.com</p>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-[var(--hive-border)] pt-6 text-xs text-[var(--hive-text-muted)] md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Hive. All rights reserved.</p>
          <p>HIPAA · 21st Century Cures Act · SOC 2-aligned</p>
        </div>
      </div>
    </footer>
  );
}
