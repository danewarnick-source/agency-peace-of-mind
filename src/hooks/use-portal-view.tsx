import { useEffect, useState, useCallback } from "react";

export type PortalView = "staff" | "admin";
const KEY = "portal-view";
const EVT = "portal-view-change";

function read(): PortalView {
  if (typeof window === "undefined") return "staff";
  const v = window.localStorage.getItem(KEY);
  return v === "admin" ? "admin" : "staff";
}

export function usePortalView() {
  const [view, setView] = useState<PortalView>("staff");

  useEffect(() => {
    setView(read());
    const handler = () => setView(read());
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
  }, []);

  return { view, setView: update };
}
