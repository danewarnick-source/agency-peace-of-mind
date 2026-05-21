import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    if (onHome) {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-lg">CareCompliance</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="/#features" onClick={scrollTo("features")} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="/#pricing" onClick={scrollTo("pricing")} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          <a href="/#contact" onClick={scrollTo("contact")} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Contact Us</a>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Login</Link>
          </Button>
          <Button asChild size="sm" className="bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[var(--shadow-card)] hover:opacity-95">
            <Link to="/signup">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
