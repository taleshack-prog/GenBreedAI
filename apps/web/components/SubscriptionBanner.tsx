"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSubscriptionNotice } from "../lib/api";
import {
  BANNER_DISMISS_LABEL, BANNER_LINK_LABEL, bannerTone, dismissNotice, shouldRefetch, shouldShowBanner,
  type SubscriptionNotice,
} from "../lib/subscription-banner";

/**
 * Faixa de aviso de assinatura (ADR-0030) — no layout de `/app/*`, então aparece ao abrir QUALQUER tela do jogo:
 * "vence em até 3 dias" / "o pagamento falhou" / "voltou para o plano gratuito", com link para a página de planos e
 * botão para dispensar (lembrado por aviso e por período). O servidor decide e manda o texto; quando a assinatura volta a
 * ficar ativa ele devolve `null` e a faixa some. Falha ao buscar nunca mostra erro nem quebra a tela (só não há faixa).
 * Busca ao abrir, ao voltar para a aba e ao navegar, no máximo 1x por minuto.
 */
export function SubscriptionBanner() {
  const pathname = usePathname();
  const [notice, setNotice] = useState<SubscriptionNotice | null>(null);
  const [, bump] = useState(0); // força re-render ao dispensar (o "dispensado" vive no localStorage)
  const lastFetch = useRef<number | null>(null);

  const load = useCallback(() => {
    if (!shouldRefetch(lastFetch.current, Date.now())) return;
    lastFetch.current = Date.now();
    getSubscriptionNotice().then(setNotice).catch(() => { /* sem faixa; a tela segue normal */ });
  }, []);

  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  let storage: Storage | null = null;
  try { storage = typeof window !== "undefined" ? window.localStorage : null; } catch { storage = null; }
  const visible = notice !== null && (storage ? shouldShowBanner(notice, storage) : true);
  if (!notice || !visible) return null;

  const tone = bannerTone(notice.kind) === "crit"
    ? "border-crit/40 bg-crit/10 text-crit"
    : "border-warn/40 bg-warn/10 text-warn";

  return (
    <div role="status" className={`sticky top-0 z-40 border-b px-4 py-2.5 backdrop-blur ${tone}`}>
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.75rem] font-bold uppercase tracking-wide">{notice.title}</p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-ink-muted">{notice.body}</p>
          <Link href={notice.url} className="mt-1 inline-block font-mono text-[0.7rem] uppercase underline decoration-dotted">
            {BANNER_LINK_LABEL} →
          </Link>
        </div>
        <button
          aria-label={BANNER_DISMISS_LABEL}
          onClick={() => { if (storage) dismissNotice(storage, notice.dismissKey); else setNotice(null); bump((n) => n + 1); }}
          className="shrink-0 rounded px-2 py-1 font-mono text-sm text-ink-muted transition hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
