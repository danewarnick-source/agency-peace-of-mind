import { createRoot } from "react-dom/client";
import { StaffGoLiveApp } from "./staff-go-live-app";
import { createBridge, installSpeechAndGps } from "./e2e-bridge";
import "./styles.css";

if (typeof window.SpeechSynthesisUtterance === "undefined") {
  class FakeUtterance {
    text = "";
    lang = "en-US";
    rate = 1;
    onend: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    constructor(text?: string) {
      this.text = text ?? "";
    }
  }
  (
    window as unknown as { SpeechSynthesisUtterance: typeof FakeUtterance }
  ).SpeechSynthesisUtterance = FakeUtterance;
}

const bridge = createBridge();
window.__e2e = bridge;
installSpeechAndGps(bridge);

createRoot(document.getElementById("root")!).render(<StaffGoLiveApp />);
