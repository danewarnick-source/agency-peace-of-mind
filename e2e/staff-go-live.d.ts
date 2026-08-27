import type { E2EBridge } from "./harness/e2e-bridge";

declare global {
  interface Window {
    __e2e: E2EBridge;
    __e2eSpeak: (text: string, opts?: { isFinal?: boolean }) => void;
  }
}

export {};
