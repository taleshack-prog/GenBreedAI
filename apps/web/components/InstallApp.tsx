"use client";
import { useEffect, useState } from "react";
import { Eyebrow } from "./Eyebrow";
import {
  detectInstallPlatform, installGuideOrder, installGuidesFor, installCompactSteps, isRunningInstalled,
  type InstallPlatform, type InstallGuideId, type InstallVariant,
  INSTALL_TITLE, INSTALL_INTRO, INSTALL_ANDROID_TITLE, INSTALL_ANDROID_STEPS, INSTALL_IOS_TITLE, INSTALL_IOS_STEPS,
  INSTALL_IOS_WARNING, INSTALL_IOS_OPEN_IN_SAFARI, INSTALL_WHY, INSTALL_ALREADY_INSTALLED, INSTALL_BUTTON_LABEL,
  INSTALL_CARD_ID, INSTALL_COMPACT_INTRO, INSTALL_COMPACT_WHY,
} from "../lib/install-guide";

/** Evento não padronizado do Chrome/Android: convite nativo de instalação. Fica guardado até o usuário tocar em "Instalar". */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Instale o app" — duas variantes do MESMO componente (mesma detecção, mesmo botão
 * "Instalar", mesmos textos-chave):
 *  - `landing` (padrão): seção grande da página inicial, as duas instruções (a do aparelho
 *    primeiro). Detecta o aparelho só DEPOIS de montar — o HTML do servidor usa a ordem padrão e
 *    troca sem descompasso de hidratação. Já instalado: mostra "você já está usando o app".
 *  - `compact`: cartão do Perfil (`#instalar-app`), versão curta só do sistema detectado. Some
 *    quando o app já roda instalado. Não renderiza NADA até detectar (evita piscar as duas
 *    instruções antes de saber qual é o aparelho) e, em desktop, só existe se o navegador
 *    oferecer o convite nativo de instalação.
 */
export function InstallApp({ variant = "landing" }: { variant?: InstallVariant }) {
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [detected, setDetected] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setInstalled(isRunningInstalled(
      window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      (navigator as Navigator & { standalone?: boolean }).standalone,
    ));
    setDetected(true);
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

  const compact = variant === "compact";
  if (compact && (!detected || installed)) return null; // Perfil: o cartão some quando o app já roda instalado

  const guidesToShow = installGuidesFor(platform, variant, promptEvent !== null);
  if (compact && guidesToShow.length === 0) return null; // desktop sem convite nativo: nada a instalar aqui

  const installButton = promptEvent && (
    <button onClick={onInstallClick}
      className="mb-3 w-full rounded-lg bg-cyan px-4 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wide text-bg-900 shadow-neon-cyan transition hover:brightness-110">
      {INSTALL_BUTTON_LABEL}
    </button>
  );

  const stepsList = (guide: InstallGuideId) => (
    <ol className="list-decimal space-y-1.5 pl-5 text-[0.8rem] leading-relaxed text-ink-muted">
      {(compact ? installCompactSteps(guide) : guide === "ios" ? INSTALL_IOS_STEPS : INSTALL_ANDROID_STEPS).map((s) => <li key={s}>{s}</li>)}
    </ol>
  );

  const guides: Record<InstallGuideId, React.ReactNode> = {
    android: (
      <div key="android" className={compact ? "" : "rounded-card border border-white/10 bg-bg-800/60 p-5"}>
        {!compact && <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink">{INSTALL_ANDROID_TITLE}</h3>}
        {installButton}
        {stepsList("android")}
      </div>
    ),
    ios: (
      <div key="ios" className={compact ? "" : "rounded-card border border-white/10 bg-bg-800/60 p-5"}>
        {!compact && <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink">{INSTALL_IOS_TITLE}</h3>}
        {platform === "ios-other" && (
          <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[0.75rem] font-semibold text-warn">{INSTALL_IOS_OPEN_IN_SAFARI}</p>
        )}
        {stepsList("ios")}
        <p className="mt-3 text-[0.75rem] font-semibold leading-relaxed text-ink">{INSTALL_IOS_WARNING}</p>
      </div>
    ),
  };

  if (compact) {
    // Cartão do Perfil — versão curta, só do sistema detectado. `scroll-mt` deixa o título visível ao vir da âncora.
    return (
      <section id={INSTALL_CARD_ID} className="mb-5 scroll-mt-4 rounded-card border border-cyan/25 bg-bg-800 p-4 text-left">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink">{INSTALL_TITLE}</h2>
        <p className="mb-3 text-[0.72rem] text-ink-muted">{INSTALL_COMPACT_INTRO}</p>
        {guidesToShow.map((id) => guides[id])}
        {(platform === "ios-safari" || platform === "ios-other") && (
          <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-muted">{INSTALL_COMPACT_WHY}</p>
        )}
      </section>
    );
  }

  return (
    <section className="px-5 py-14 sm:py-20" id="instalar">
      <div className="mx-auto max-w-3xl">
        <Eyebrow color="#00F0FF">{INSTALL_TITLE}</Eyebrow>
        <p className="mb-3 text-center font-display text-2xl font-bold text-ink sm:text-3xl">Leve o laboratório no bolso</p>
        <p className="mx-auto mb-8 max-w-xl text-center text-[0.85rem] leading-relaxed text-ink-muted">{INSTALL_INTRO}</p>

        {installed ? (
          <p className="rounded-card border border-ok/30 bg-bg-800/60 p-5 text-center text-sm text-ok">{INSTALL_ALREADY_INSTALLED}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{installGuideOrder(platform).map((id) => guides[id])}</div>
        )}

        <p className="mx-auto mt-6 max-w-xl text-center text-[0.75rem] leading-relaxed text-ink-muted">{INSTALL_WHY}</p>
      </div>
    </section>
  );
}
