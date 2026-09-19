"use client";
import { useEffect } from "react";

/**
 * Registra `/sw.js` (service worker mínimo, sem cache — ver o arquivo) só no
 * CLIENTE e só em produção: em dev um service worker atrapalha o hot reload e
 * dá falsa impressão de cache. Falha de registro nunca quebra a página.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* sem SW: o site segue normal, só não instala */ });
  }, []);
  return null;
}
