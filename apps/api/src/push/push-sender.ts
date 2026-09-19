/**
 * Envio de Web Push (ADR-0028). `PushSender` é a porta (o `PushService` e os testes só
 * conhecem ela); `WebPushSender` é o adapter real, sobre a biblioteca `web-push`.
 *
 * `web-push` NÃO está nas dependências declaradas da API ainda (instalação à parte:
 * `pnpm --filter @genbreedai/api add web-push`, com `package.json` e lockfile juntos).
 * Por isso é carregada por `import()` dinâmico com o nome numa variável (o TypeScript
 * não tenta resolver o módulo — `pnpm typecheck` passa antes e depois da instalação),
 * igual ao `sharp` (ADR-0027). Sem a biblioteca, `ready()` LANÇA com mensagem clara e
 * `push:dispatch` aborta ANTES de reivindicar qualquer entrada (nada é marcado sem
 * poder enviar).
 */
import { vapidConfig } from "../common/vapid";

/** O que o serviço de push precisa pra falar com UM dispositivo (`PushSubscription.toJSON()`). */
export interface PushTarget { endpoint: string; p256dh: string; auth: string }

/** Conteúdo da notificação — o service worker (`public/sw.js`) lê exatamente estes campos. */
export interface PushPayload {
  title: string;
  body: string;
  icon: string;
  /** Caminho aberto no clique (mesma origem). */
  url: string;
  /** Notificações com a mesma tag se substituem no aparelho. */
  tag?: string;
}

export abstract class PushSender {
  /** Falha (lança) se o envio não é possível: chaves VAPID ausentes ou biblioteca `web-push` não instalada. */
  abstract ready(): Promise<void>;
  /** Envia a um dispositivo. Lança em qualquer erro; o erro do serviço de push carrega `statusCode` (404/410 = dispositivo sumiu). */
  abstract send(target: PushTarget, payload: PushPayload): Promise<void>;
}

/** Só o que usamos do `web-push` — evita depender dos tipos dele (não instalado). */
interface WebPushLib {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number; urgency: "very-low" | "low" | "normal" | "high" },
  ): Promise<unknown>;
}

/** Quanto tempo o serviço de push guarda a mensagem se o aparelho estiver desligado (24 h). */
const TTL_SECONDS = 24 * 60 * 60;

export class WebPushSender extends PushSender {
  private lib: WebPushLib | null = null;

  private async load(): Promise<WebPushLib> {
    if (this.lib) return this.lib;
    const name = "web-push"; // variável de propósito — ver o comentário do arquivo
    try {
      const mod = await import(name);
      this.lib = (mod.default ?? mod) as WebPushLib;
      return this.lib;
    } catch {
      throw new Error("web-push não está instalado (pnpm --filter @genbreedai/api add web-push) — envio de push indisponível");
    }
  }

  async ready(): Promise<void> {
    const cfg = vapidConfig();
    if (!cfg) throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não definidas — Web Push desligado");
    const lib = await this.load();
    lib.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<void> {
    await this.ready();
    await this.lib!.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: TTL_SECONDS, urgency: "normal" },
    );
  }
}
