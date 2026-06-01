import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMobileShellContainer } from "./mobile-shell-context";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-height utility relative to the shell. Defaults to 88%. */
  maxHeightClass?: string;
  /** aria-label for the dialog */
  ariaLabel?: string;
};

/**
 * Bottom sheet bounded by the staff mobile shell. Uses position: absolute
 * relative to the shell (NOT fixed to the viewport) and mounts into the
 * shell's DOM subtree so it's contained inside the device frame in preview
 * and inside the screen on real devices. Width is 100% of the shell.
 */
export function MobileBottomSheet({
  open,
  onClose,
  children,
  maxHeightClass = "max-h-[88%]",
  ariaLabel,
}: Props) {
  const { container } = useMobileShellContainer();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Fallback to body if shell not registered yet (e.g. SSR).
  const mount = container ?? (typeof document !== "undefined" ? document.body : null);
  if (!mount) return null;

  return createPortal(
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop — absolute, bounded by shell */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 animate-in fade-in-0"
      />

      {/* Sheet — width 100% of shell, internal scroll */}
      <div
        className={`relative z-10 w-full ${maxHeightClass} overflow-y-auto overscroll-contain rounded-t-2xl border-t-4 border-[color:var(--amber-500,#f4a93a)] bg-background shadow-2xl animate-in slide-in-from-bottom`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sheet"
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-foreground hover:bg-black/10"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>,
    mount,
  );
}
