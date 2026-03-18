"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function StorageWarning() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("studio:storage-full", handler);
    return () => window.removeEventListener("studio:storage-full", handler);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl bg-amber-950/90 border border-amber-700 text-sm text-amber-300 flex items-start gap-2 shadow-xl">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span>El almacenamiento está lleno — el progreso no se guardará. Guardá tu trabajo antes de cerrar la pestaña.</span>
    </div>
  );
}
