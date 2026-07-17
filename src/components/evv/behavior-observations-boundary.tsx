import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Snapshot of the current answers — logged with the error so we can reproduce. */
  answersSnapshot?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Local error boundary so a render bug inside <BehaviorObservationsBlock/>
 * cannot white out the entire Shift Verification dialog (and the app root
 * boundary along with it). Staff can still finish and submit their timeclock;
 * the real stack is logged to console for follow-up.
 */
export class BehaviorObservationsBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[BehaviorObservationsBlock] render crashed", {
      error,
      componentStack: info.componentStack,
      answersSnapshot: this.props.answersSnapshot,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid gap-2 rounded-lg border-2 border-dashed border-rose-400 bg-rose-50/60 p-3 text-xs text-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Behavior Observations couldn&apos;t load
          </div>
          <p className="leading-relaxed">
            You can still submit your timeclock — this section is optional for
            this shift. Please screenshot this message so an admin can look at
            the underlying error:
          </p>
          <pre className="max-h-24 overflow-auto rounded bg-white/70 p-2 font-mono text-[10px] leading-tight text-rose-800 dark:bg-black/40 dark:text-rose-200">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
