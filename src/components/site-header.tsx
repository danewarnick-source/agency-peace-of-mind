import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, Menu } from "lucide-react";
import { useState } from "react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/", label: "Home" },
    { to: "/pricing", label: "Pricing" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </span>
          HIVE
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
          <Button asChild size="sm" className="bg-[image:var(--gradient-brand)] text-primary-foreground">
            <Link to="/signup">Start free trial</Link>
          </Button>
        </div>

        <button className="md:hidden" onClick={() => setOpen((s) => !s)} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="border-t border-border bg-background px-6 py-4 md:hidden">
          <div className="grid gap-3 text-sm">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-muted-foreground">
                {l.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1"><Link to="/login">Sign in</Link></Button>
              <Button asChild size="sm" className="flex-1 bg-[image:var(--gradient-brand)] text-primary-foreground"><Link to="/signup">Sign up</Link></Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
