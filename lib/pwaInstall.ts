"use client";

// Der `beforeinstallprompt`-Event feuert nur einmal pro Page-Load. Damit
// sowohl das schwebende Install-Banner als auch ein expliziter Button in den
// Einstellungen darauf zugreifen können, speichern wir den Event in einem
// Module-State und benachrichtigen alle Listener via Custom-Event.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let storedPrompt: BeforeInstallPromptEvent | null = null;
let isInstalled = false;
let isRegistered = false;
const EVENT_NAME = "sa:pwa-state";

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function registerPwa(): void {
  if (typeof window === "undefined" || isRegistered) return;
  isRegistered = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((e) => console.warn("[pwa] sw register failed", e));
  }

  // Läuft die App bereits im Standalone-Modus, ist der Prompt irrelevant.
  const media = window.matchMedia?.("(display-mode: standalone)");
  if (media?.matches) isInstalled = true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    storedPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    storedPrompt = null;
    isInstalled = true;
    emit();
  });
}

export function getPwaInstallState(): {
  available: boolean;
  installed: boolean;
} {
  return { available: storedPrompt != null, installed: isInstalled };
}

export async function triggerPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!storedPrompt) return "unavailable";
  await storedPrompt.prompt();
  const choice = await storedPrompt.userChoice;
  // Prompt ist nach Aufruf verbraucht
  storedPrompt = null;
  emit();
  return choice.outcome;
}

export function onPwaStateChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, cb);
  return () => window.removeEventListener(EVENT_NAME, cb);
}
