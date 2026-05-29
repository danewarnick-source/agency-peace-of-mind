import { Link } from "@tanstack/react-router";
import { Hexagon } from "lucide-react";


export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/40 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground">
                <Hexagon className="h-4 w-4" strokeWidth={2.5} />
              </span>
              HIVE
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">HIVE — powered by NECTAR™. Modern workforce intelligence for care teams that take compliance seriously.</p>

          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm md:grid-cols-3">
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link to="/contact" className="text-muted-foreground hover:text-foreground">Contact</Link>
            <Link to="/login" className="text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/signup" className="text-muted-foreground hover:text-foreground">Sign up</Link>
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">© {new Date().getFullYear()} HIVE. All rights reserved.</p>
      </div>
    </footer>
  );
}
