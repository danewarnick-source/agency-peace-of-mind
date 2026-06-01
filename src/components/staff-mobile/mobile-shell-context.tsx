import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = {
  container: HTMLElement | null;
  setContainer: (el: HTMLElement | null) => void;
};

const MobileShellContext = createContext<Ctx>({
  container: null,
  setContainer: () => {},
});

/**
 * Provides a positioning context (the staff mobile phone shell) that overlays
 * (bottom sheets, dialogs, paperwork pop-ups) can mount into via portal so they
 * stay bounded by the device frame in preview and by the screen on a real phone.
 */
export function MobileShellProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <MobileShellContext.Provider value={{ container, setContainer }}>
      {children}
    </MobileShellContext.Provider>
  );
}

export function useMobileShellContainer() {
  return useContext(MobileShellContext);
}
