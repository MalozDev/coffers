"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToastKind = "success" | "error";
interface ToastItem { id: number; kind: ToastKind; message: string; }
interface ToastContextValue { showToast: (kind: ToastKind, message: string) => void; }

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
        {toasts.map((toast) => <Toast key={toast.id} toast={toast} onDismiss={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} />)}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const success = toast.kind === "success";
  return <div className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
    {success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
    <span className="min-w-0 flex-1">{toast.message}</span>
    <Button type="button" variant="ghost" size="icon-xs" className="-mr-1 -mt-1" onClick={onDismiss} aria-label="Dismiss notification"><X className="h-4 w-4" /></Button>
  </div>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
