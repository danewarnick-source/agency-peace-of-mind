import { Lock } from "lucide-react";

export function FeatureLocked({ featureName }: { featureName?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">🔒 Feature Locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {featureName ? `“${featureName}” is ` : "This module is "}
          not included in your current subscription package. Please contact your
          administrator to upgrade.
        </p>
      </div>
    </div>
  );
}
