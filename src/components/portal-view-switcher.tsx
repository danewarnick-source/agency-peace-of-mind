import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, GraduationCap, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalView } from "@/hooks/use-portal-view";

export type PortalViewOption = {
  value: PortalView;
  label: string;
};

const ICONS: Record<PortalView, typeof GraduationCap> = {
  staff: GraduationCap,
  staff_mobile: GraduationCap,
  admin: Building2,
  hive_exec: Lock,
  state_preview: MapPin,
};

/**
 * Portal View control. Radix Select cannot be used here: its popper viewport
 * is locked to the trigger height, so items paint over the nav (bleed-through)
 * and clicks/Enter never commit a new view.
 *
 * The menu is portaled to document.body so position:fixed is not trapped by
 * the mobile Sheet's slide transform. That puts it outside the Sheet's
 * pointer-events:auto island — Radix sets pointer-events:none on body while
 * the drawer is open — so the menu MUST be pointer-events-auto or taps fall
 * through to the dimmed page behind it.
 */
export function PortalViewSwitcher({
  value,
  onChange,
  options,
  triggerClassName,
}: {
  value: PortalView;
  onChange: (view: PortalView) => void;
  options: PortalViewOption[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const CurrentIcon = current ? ICONS[current.value] : GraduationCap;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 220);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left), width });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDoc);
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Autofocus would move focus outside the mobile Sheet (menu is portaled
    // to body) and Radix would treat that as dismiss. Keyboard users still
    // reach options via ArrowDown on the trigger.
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    if (coarse) return;
    const selected = menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus();
  }, [open]);

  const commit = (next: PortalView) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onOptionPointerDown = (e: PointerEvent<HTMLButtonElement>, next: PortalView) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Commit on pointerdown: iOS often never delivers click after a modal
    // layer races the same tap. preventDefault stops the ghost click that
    // would otherwise land on Admin Home behind the closing menu.
    e.preventDefault();
    e.stopPropagation();
    commit(next);
  };

  const onOptionKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[idx];
      if (opt) commit(opt.value);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (idx + delta + options.length) % options.length;
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
    }
  };

  let menu: ReactNode = null;
  if (open && typeof document !== "undefined") {
    menu = createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label="Portal View"
        data-testid="portal-view-menu"
        data-portal-view-menu=""
        className="pointer-events-auto fixed z-[400] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {options.map((opt, idx) => {
          const Icon = ICONS[opt.value];
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={selected}
              data-testid={`portal-view-option-${opt.value}`}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
              )}
              onPointerDown={(e) => onOptionPointerDown(e, opt.value)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                commit(opt.value);
              }}
              onKeyDown={(e) => onOptionKey(e, idx)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Portal View"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="portal-view-trigger"
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm text-sidebar-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring",
          triggerClassName,
        )}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{current?.label ?? "Staff View"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {menu}
    </>
  );
}
