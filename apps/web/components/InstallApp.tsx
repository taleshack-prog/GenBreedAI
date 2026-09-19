"use client";
import { useEffect, useState } from "react";
import { Eyebrow } from "./Eyebrow";
import {
  detectInstallPlatform, installGuideOrder, isRunningInstalled, type InstallPlatform, type InstallGuideId,
  INSTALL_TITLE, INSTALL_INTRO, INSTALL_ANDROID_TITLE, INSTALL_ANDROID_STEPS, INSTALL_IOS_TITLE, INSTALL_IOS_STEPS,
  INSTALL_IOS_WARNING, INSTALL_IOS_OPEN_IN_SAFARI, INSTALL_WHY, INSTALL_ALREADY_INSTALLED, INSTALL_BUTTON_LABEL,
} from "../lib/install-guide";

/** Evento não padronizado do Chrome/Android: convite nativo de instalação. Fica guardado até o usuário tocar em "Instalar". */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Seção "Instale o app" da landing. Detecta o aparelho só DEPOIS de montar
 * (efeito) — o HTML do servidor usa a ordem padrão (Android primeiro) e troca
 * sem descompasso de hidratação. As duas instruções ficam sempre visíveis.
 */
export function InstallApp() {
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setInstalled(isRunningInstalled(
      window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      (navigator as Navigator & { standalone?: boolean }).standalone,
    ));
    const onPrompt = (e: Event) => { e.preventDefault(); setPromptEvent(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function onInstallClick() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch { /* o navegador recusou o convite: as instruções manuais continuam valendo */ }
    setPromptEvent(null); // o convite só pode ser usado uma vez
  }

  const order = installGuideOrder(platform);
  const guides: Record<InstallGuideId, React.ReactNode> = {
    android: (
      <div key="android" className="rounded-card border border-white/10 bg-bg-800/60 p-5">
        <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink">{INSTALL_ANDROID_TITLE}</h3>
        {promptEvent && (
          <button onClick={onInstallClick}
            className="mb-3 w-full rounded-lg bg-cyan px-4 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110">
            {INSTALL_BUTTON_LABEL}
          </button>
        )}
        <ol className="list-decimal space-y-1.5 pl-5 text-[0.8rem] leading-relaxed text-ink-muted">
          {INSTALL_ANDROID_STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>
    ),
    ios: (
      <div key="ios" className="rounded-card border border-white/10 bg-bg-800/60 p-5">
        <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink">{INSTALL_IOS_TITLE}</h3>
        {platform === "ios-other" && (
          <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[0.75rem] font-semibold text-warn">{INSTALL_IOS_OPEN_IN_SAFARI}</p>
        )}
        <ol className="list-decimal space-y-1.5 pl-5 text-[0.8rem] leading-relaxed text-ink-muted">
          {INSTALL_IOS_STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-3 text-[0.75rem] font-semibold leading-relaxed text-ink">{INSTALL_IOS_WARNING}</p>
      </div>
    ),
  };

  return (
    <section className="px-5 py-14 sm:py-20" id="instalar">
      <div className="mx-auto max-w-3xl">
        <Eyebrow color="#00F0FF">{INSTALL_TITLE}</Eyebrow>
        <p className="mb-3 text-center font-display text-2xl font-bold text-ink sm:text-3xl">Leve o laboratório no bolso</p>
        <p className="mx-auto mb-8 max-w-xl text-center text-[0.85rem] leading-relaxed text-ink-muted">{INSTALL_INTRO}</p>

        {installed ? (
          <p className="rounded-card border border-ok/30 bg-bg-800/60 p-5 text-center text-sm text-ok">{INSTALL_ALREADY_INSTALLED}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{order.map((id) => guides[id])}</div>
        )}

        <p className="mx-auto mt-6 max-w-xl text-center text-[0.75rem] leading-relaxed text-ink-muted">{INSTALL_WHY}</p>
      </div>
    </section>
  );
}
