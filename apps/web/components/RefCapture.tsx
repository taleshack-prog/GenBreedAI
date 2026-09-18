"use client";
import { useEffect } from "react";
import { captureRef } from "../lib/referral-capture";
import { recordReferralClick } from "../lib/api";

/**
 * Montado no layout raiz: captura `?ref=` em QUALQUER página (landing,
 * /f/[id], /signup, /login…) e guarda em localStorage pra `register()` enviar
 * no cadastro (ADR-0024). Também conta o clique (público, só contador — não
 * credita nada), no máximo 1x por código por aba/sessão. Usa
 * `window.location.search` no efeito (não `useSearchParams`) de propósito:
 * sem exigir <Suspense> no layout nem quebrar as páginas estáticas.
 */
export function RefCapture() {
  useEffect(() => {
    try {
      const code = captureRef(window.location.search, window.localStorage);
      if (!code) return;
      const seen = `gb:ref-click:${code}`;
      if (window.sessionStorage.getItem(seen)) return;
      window.sessionStorage.setItem(seen, "1");
      void recordReferralClick(code);
    } catch { /* storage bloqueado: só não captura */ }
  }, []);
  return null;
}
