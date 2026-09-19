"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPushConfig, subscribePush, unsubscribePush, type PushSubscriptionJson } from "../lib/api";
import { detectInstallPlatform, isRunningInstalled, installCardHref, type InstallPlatform } from "../lib/install-guide";
import {
  decidePushUi, urlBase64ToUint8Array, iosVersionFromUserAgent, deniedHelp, NOTIFY_INSTALL_LINK_LABEL,
  NOTIFY_BUTTON_LABEL, NOTIFY_OFF_LABEL, NOTIFY_EXPLANATION, NOTIFY_SUBSCRIBED_TEXT, NOTIFY_IOS_INSTALL_TEXT,
  NOTIFY_IOS_SAFARI_TEXT, NOTIFY_IOS_TOO_OLD_TEXT, NOTIFY_UNSUPPORTED_TEXT, type PushUiState,
} from "../lib/push";

/** Chave pública VAPID (a MESMA da API). Ausente = recurso desligado na web: o botão nem aparece. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * "Avisar quando nascer" (Web Push, ADR-0028) — no Perfil e na Incubadora. Pede a permissão
 * (só num clique, exigência dos navegadores) e assina; no iPhone sem o app instalado mostra
 * primeiro a instrução de instalar; permissão negada explica como reverter. Sem chave VAPID
 * na web ou sem o recurso na API, não renderiza nada (recurso desligado, nada quebra).
 */
export function NotifyButton() {
  const pathname = usePathname();
  const [ui, setUi] = useState<PushUiState>("loading");
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const evaluate = useCallback(async (serverEnabled: boolean | null) => {
    const plat = detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
    setPlatform(plat);
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let subscribed = false;
    if (supported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        subscribed = !!(await reg?.pushManager.getSubscription());
      } catch { /* sem registro ainda: não assinado */ }
    }
    setUi(decidePushUi({
      keyConfigured: VAPID_PUBLIC_KEY.length > 0,
      serverEnabled,
      platform: plat,
      installed: isRunningInstalled(window.matchMedia?.("(display-mode: standalone)").matches ?? false, (navigator as Navigator & { standalone?: boolean }).standalone),
      iosVersion: iosVersionFromUserAgent(navigator.userAgent),
      supported,
      permission: "Notification" in window ? Notification.permission : null,
      subscribed,
    }));
  }, []);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) { setUi("hidden"); return; }
    let alive = true;
    getPushConfig()
      .then((c) => { if (alive) void evaluate(c.enabled); })
      .catch(() => { if (alive) setUi("hidden"); }); // API fora do ar: não mostra um botão que não vai funcionar
    return () => { alive = false; };
  }, [evaluate]);

  async function onEnable() {
    setBusy(true); setMsg(null);
    try {
      // Tem que ser DENTRO do clique — senão o navegador ignora o pedido de permissão.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { await evaluate(true); return; }
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
      await subscribePush(sub.toJSON() as PushSubscriptionJson);
      await evaluate(true);
    } catch (e) {
      setMsg((e as Error).message || "Não foi possível ativar os avisos.");
      await evaluate(true);
    } finally { setBusy(false); }
  }

  async function onDisable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint).catch(() => {}); // mesmo se a API falhar, desassina no aparelho
        await sub.unsubscribe();
      }
      await evaluate(true);
    } catch (e) {
      setMsg((e as Error).message || "Não foi possível desativar os avisos.");
    } finally { setBusy(false); }
  }

  if (ui === "hidden" || ui === "loading") return null;

  // Os passos de instalação vivem só no cartão "Instale o app" do Perfil (InstallApp compact): aqui só o link.
  // No próprio Perfil basta a âncora; em outras telas (ex.: Incubadora) o link leva ao Perfil já no cartão.
  const installLink = (
    <Link href={installCardHref(pathname)} className="mt-1.5 inline-block font-mono text-[0.7rem] uppercase text-cyan underline decoration-dotted transition hover:text-ink">
      {NOTIFY_INSTALL_LINK_LABEL} →
    </Link>
  );

  const box = "mb-4 rounded-card border border-cyan/25 bg-bg-800 p-3 text-left";
  const note = "text-[0.72rem] leading-relaxed text-ink-muted";

  if (ui === "subscribed") {
    return (
      <div className={box}>
        <p className="text-[0.75rem] font-semibold text-ok">{NOTIFY_SUBSCRIBED_TEXT}</p>
        <button disabled={busy} onClick={onDisable}
          className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 font-mono text-[0.65rem] uppercase text-ink-muted transition hover:text-ink disabled:opacity-60">
          {busy ? "…" : NOTIFY_OFF_LABEL}
        </button>
        {msg && <p className="mt-1 text-[0.65rem] text-crit">{msg}</p>}
      </div>
    );
  }

  return (
    <div className={box}>
      <p className={note}>{NOTIFY_EXPLANATION}</p>
      {ui === "can-subscribe" && (
        <button disabled={busy} onClick={onEnable}
          className="mt-2 w-full rounded-lg border border-cyan/40 bg-cyan/5 px-3 py-2 text-center font-display text-[0.7rem] font-bold uppercase text-cyan transition hover:bg-cyan/10 disabled:opacity-60">
          {busy ? "ativando…" : `🔔 ${NOTIFY_BUTTON_LABEL}`}
        </button>
      )}
      {ui === "ios-install" && (
        <div className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5">
          <p className="text-[0.72rem] font-semibold text-warn">{NOTIFY_IOS_INSTALL_TEXT}</p>
          {installLink}
        </div>
      )}
      {ui === "ios-open-in-safari" && (
        <div className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5">
          <p className="text-[0.72rem] font-semibold text-warn">{NOTIFY_IOS_SAFARI_TEXT}</p>
          {installLink}
        </div>
      )}
      {ui === "ios-too-old" && <p className="mt-2 text-[0.72rem] font-semibold text-warn">{NOTIFY_IOS_TOO_OLD_TEXT}</p>}
      {ui === "unsupported" && <p className="mt-2 text-[0.72rem] text-ink-muted">{NOTIFY_UNSUPPORTED_TEXT}</p>}
      {ui === "denied" && <p className="mt-2 text-[0.72rem] font-semibold text-warn">{deniedHelp(platform)}</p>}
      {msg && <p className="mt-1 text-[0.65rem] text-crit">{msg}</p>}
    </div>
  );
}
