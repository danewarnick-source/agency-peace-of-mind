import { useEffect, useState, useCallback } from "react";

export type PortalView = "staff" | "admin" | "staff_mobile" | "hive_exec" | "state_preview";
export type StatePreviewSubView = "admin" | "staff";

const KEY = "portal-view";
const STATE_KEY = "portal-view-state-code";
const SUB_KEY = "portal-view-state-sub";
const EVT = "portal-view-change";

function readView(): PortalView {
  if (typeof window === "undefined") return "staff";
  const v = window.localStorage.getItem(KEY);
  if (v === "admin" || v === "staff_mobile" || v === "hive_exec" || v === "state_preview") return v;
  return "staff";
}

// Whether the user has ever explicitly chosen a portal view. Lets consumers
// distinguish "no choice yet" (default) from an explicit "staff" choice, so a
// fresh admin can default to the admin Home instead of the empty staff caseload
// without overriding an admin who deliberately switched to Staff View.
function readHasStoredView(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(KEY);
  return (
    v === "staff" || v === "admin" || v === "staff_mobile" ||
    v === "hive_exec" || v === "state_preview"
  );
}

function readStateCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STATE_KEY);
}

function readSub(): StatePreviewSubView {
  if (typeof window === "undefined") return "admin";
  const v = window.localStorage.getItem(SUB_KEY);
  return v === "staff" ? "staff" : "admin";
}

export function usePortalView() {
  const [view, setView] = useState<PortalView>("staff");
  const [hasStoredView, setHasStoredView] = useState(false);
  const [stateCode, setStateCodeState] = useState<string | null>(null);
  const [subView, setSubViewState] = useState<StatePreviewSubView>("admin");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setView(readView());
    setHasStoredView(readHasStoredView());
    setStateCodeState(readStateCode());
    setSubViewState(readSub());
    setHydrated(true);
    const handler = () => {
      setView(readView());
      setHasStoredView(readHasStoredView());
      setStateCodeState(readStateCode());
      setSubViewState(readSub());
    };
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = useCallback((v: PortalView) => {
    window.localStorage.setItem(KEY, v);
    window.dispatchEvent(new Event(EVT));
    setView(v);
    setHasStoredView(true);
  }, []);

  const setStateCode = useCallback((code: string | null) => {
    if (code) window.localStorage.setItem(STATE_KEY, code);
    else window.localStorage.removeItem(STATE_KEY);
    window.dispatchEvent(new Event(EVT));
    setStateCodeState(code);
  }, []);

  const setSubView = useCallback((s: StatePreviewSubView) => {
    window.localStorage.setItem(SUB_KEY, s);
    window.dispatchEvent(new Event(EVT));
    setSubViewState(s);
  }, []);

  return { view, hasStoredView, setView: update, stateCode, setStateCode, subView, setSubView, hydrated };
}
