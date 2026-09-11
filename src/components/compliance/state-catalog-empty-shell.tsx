export function StateCatalogEmptyShell({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h1 className="font-display text-xl font-bold tracking-tight text-[var(--hive-text)]">
        Compliance catalog
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
