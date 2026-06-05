// On-device text-to-speech for the training player.
// Uses window.speechSynthesis only. No network, no audio files.
import { useEffect, useRef, useState, useCallback } from "react";

const SESSION_KEY = "hive-training-autoread";

export function useTrainingSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utterRef.current = u;
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  // Always cancel on unmount.
  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { supported, speaking, speak, stop };
}

export function getSessionAutoRead(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

export function setSessionAutoRead(on: boolean) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(SESSION_KEY, on ? "1" : "0"); } catch {}
}

function stripHtml(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildLessonSpeech(step: any, openDropIndex: number | null): string {
  if (!step || step.type !== "lesson") return "";
  const parts: string[] = [];
  if (step.title) parts.push(step.title + ".");
  if (step.lead) parts.push(stripHtml(step.lead));
  if (step.callout) {
    if (step.callout.t) parts.push(stripHtml(step.callout.t) + ".");
    if (step.callout.b) parts.push(stripHtml(step.callout.b));
  }
  if (Array.isArray(step.facts)) {
    for (const f of step.facts) {
      parts.push(`${stripHtml(f.t)} ${stripHtml(f.b)}`);
    }
  }
  if (openDropIndex !== null && Array.isArray(step.drops) && step.drops[openDropIndex]) {
    const [t, b] = step.drops[openDropIndex];
    parts.push(`${stripHtml(t)}. ${stripHtml(b)}`);
  }
  return parts.join(" ");
}

export function buildCheckSpeech(step: any): string {
  if (!step || step.type !== "check") return "";
  const parts: string[] = [];
  if (step.stem) parts.push(stripHtml(step.stem));
  if (Array.isArray(step.options)) {
    for (const o of step.options) {
      parts.push(`Option ${o.k}. ${stripHtml(o.t)}`);
    }
  }
  return parts.join(" ");
}
