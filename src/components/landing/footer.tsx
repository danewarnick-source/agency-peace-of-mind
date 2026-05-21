export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/40 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} CareCompliance. Built for disability services agencies.</p>
        <p>DSPD aligned • HIPAA-ready • SOC 2 in progress</p>
      </div>
    </footer>
  );
}
