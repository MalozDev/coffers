"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (isStandalone || window.localStorage.getItem("coffers-pwa-install-dismissed") === "true") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      window.setTimeout(() => setVisible(true), 900);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem("coffers-pwa-install-dismissed", "true");
    setVisible(false);
    setInstallEvent(null);
  };

  const install = async () => {
    if (!installEvent) return;
    setInstalling(true);
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
    setInstallEvent(null);
    setInstalling(false);
  };

  if (!visible || !installEvent) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 sm:left-auto sm:right-6 sm:w-[22rem]">
      <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl ring-1 ring-black/5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary p-2 text-primary-foreground"><Download className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Install Coffers</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your money, one tap away.</p>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Dismiss install prompt"><X className="h-4 w-4" /></Button>
        </div>
        <Button type="button" className="mt-3 w-full" onClick={install} disabled={installing}>{installing ? "Installing..." : "Install app"}</Button>
      </div>
    </div>
  );
}
