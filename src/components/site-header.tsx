import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Hexagon, Menu, X, ArrowRight } from "lucide-react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "Home" },
    { to: "/pricing", label: "Pricing" },
    { to: "/training", label: "Training" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[color:var(--border-light)] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border-light)] bg-white text-[color:var(--navy-800)] shadow-sm">
            <Hexagon className="h-4 w-4 text-[color:var(--amber-500)]" strokeWidth={2.5} />
          </span>
          <div className="leading-none">
            <div className="text-[15px] font-bold tracking-tight text-[color:var(--navy-900)]">HIVE</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              Powered by NECTAR™
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-[color:var(--text-soft)] transition hover:text-[color:var(--navy-900)]"
              activeProps={{ className: "text-[color:var(--navy-900)] font-semibold" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/demo">
              Book a demo <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">Get started</Link>
          </Button>
        </div>

        <button
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[color:var(--border-light)] text-[color:var(--navy-900)] md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[color:var(--border-light)] bg-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium text-[color:var(--text-soft)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--navy-900)]"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="h-11 flex-1">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-11 flex-1">
                <Link to="/demo">Book a demo</Link>
              </Button>
              <Button asChild size="sm" className="h-11 flex-1">
                <Link to="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
