/**
 * Web Push (ADR-0028): assinar grava; assinar de novo o MESMO endpoint atualiza em vez de
 * duplicar; cancelar remove; assinatura que o serviço de push devolve 404/410 é apagada no
 * envio; falha de envio nunca lança; sem chaves VAPID o recurso fica DESLIGADO e nada quebra.
 * Unidade (serviço com repositório in-memory e remetente falso, `Clock` fixo por
 * `setForTesting` — nunca fake timers) + HTTP curto (rotas, guard, 503 sem VAPID).
 * Nenhum envio real: `web-push` nem precisa estar instalada.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";
import { SystemClock } from "../src/common/clock";
import { vapidConfig, isPushEnabled, vapidPartiallyConfigured } from "../src/common/vapid";
import { PushService } from "../src/push/push.service";
import { PushSender, type PushPayload, type PushTarget } from "../src/push/push-sender";
import { PushSubscriptionRepository, InMemoryPushSubscriptionRepository } from "../src/push/push-subscription.repository";
import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "../src/push/push-endpoint";
import { parseSubscribeBody } from "../src/push/push.controller";
import { getTableConfig } from "drizzle-orm/pg-core";
import { pushSubscriptions } from "../src/db/schema";

const ENV_KEYS = ["NODE_ENV", "AUTH_DEV_HEADERS", "DATABASE_URL", "FAL_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
let savedEnv: Record<string, string | undefined>;
beforeAll(() => {
  // `../src/main` carrega o `.env` local (dotenv) na importação: isola tudo o que muda o comportamento.
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true";
  for (const k of ["DATABASE_URL", "FAL_KEY"]) delete process.env[k];
});
afterAll(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
});
const setVapid = (on: boolean) => {
  if (on) { process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste"; process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste"; }
  else { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; }
  delete process.env.VAPID_SUBJECT;
};

/** Remetente falso: registra o que seria enviado; `failWith[endpoint]` simula o erro que o serviço de push devolveria. */
class FakeSender extends PushSender {
  calls: Array<{ target: PushTarget; payload: PushPayload }> = [];
  failWith = new Map<string, { statusCode?: number; message?: string }>();
  async ready() { /* sempre pronto */ }
  async send(target: PushTarget, payload: PushPayload) {
    this.calls.push({ target, payload });
    const f = this.failWith.get(target.endpoint);
    if (f) throw Object.assign(new Error(f.message ?? "falha simulada"), { statusCode: f.statusCode });
  }
}

const EP = (n: number | string) => `https://fcm.googleapis.com/fcm/send/device-${n}`;
const KEYS = (n: number | string) => ({ p256dh: `p256dh-${n}`, auth: `auth-${n}` });
const input = (n: number | string, userAgent: string | null = "UA-teste") => ({ endpoint: EP(n), ...KEYS(n), userAgent });
const PAYLOAD: PushPayload = { title: "Gestação concluída", body: "Branco", icon: "/icon-192.png", url: "/app/incubadora" };
const T0 = new Date("2026-06-01T12:00:00.000Z");

function build() {
  const repo = new InMemoryPushSubscriptionRepository();
  const sender = new FakeSender();
  const clock = new SystemClock();
  clock.setForTesting(T0);
  const service = new PushService(repo, sender, clock);
  /**
   * Cadastra o dispositivo `n` com `created_at` = T0 + n segundos (DISTINTO por dispositivo) e volta o
   * relógio pra T0. A ordem de `listByUser` é (created_at, id) e o `id` é um uuid aleatório: com o
   * MESMO `created_at` a ordem entre dispositivos é arbitrária — os testes que conferem ordem não
   * podem depender disso. Aqui a ordem esperada é a do `n`, sempre.
   */
  async function addDevice(userId: string, n: number) {
    clock.setForTesting(new Date(T0.getTime() + n * 1000));
    try { return await service.subscribe(userId, input(n)); } finally { clock.setForTesting(T0); }
  }
  return { repo, sender, clock, service, addDevice };
}

describe("assinar / cancelar", () => {
  beforeEach(() => setVapid(true));

  it("assinar GRAVA a assinatura do usuário", async () => {
    const { repo, service } = build();
    const s = await service.subscribe("u1", input(1));
    const list = await repo.listByUser("u1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: s.id, userId: "u1", endpoint: EP(1), p256dh: "p256dh-1", auth: "auth-1", userAgent: "UA-teste", lastUsedAt: null, failedAt: null });
    expect(list[0]!.createdAt.getTime()).toBe(T0.getTime());
  });

  it("assinar de novo o MESMO endpoint ATUALIZA em vez de duplicar (chaves novas, mesma linha, created_at preservado)", async () => {
    const { repo, sender, clock, service } = build();
    const first = await service.subscribe("u1", input(1));
    await repo.markFailed(first.id, T0); // já tinha falhado antes…
    clock.setForTesting(new Date(T0.getTime() + 60_000));
    const again = await service.subscribe("u1", { endpoint: EP(1), p256dh: "NOVA-p256dh", auth: "NOVA-auth", userAgent: "UA-novo" });

    const list = await repo.listByUser("u1");
    expect(list).toHaveLength(1); // não duplicou
    expect(again.id).toBe(first.id);
    expect(list[0]).toMatchObject({ p256dh: "NOVA-p256dh", auth: "NOVA-auth", userAgent: "UA-novo", failedAt: null });
    expect(list[0]!.createdAt.getTime()).toBe(T0.getTime()); // created_at não muda
    // …e o envio usa as chaves NOVAS
    await service.sendToUser("u1", PAYLOAD);
    expect(sender.calls[0]!.target).toEqual({ endpoint: EP(1), p256dh: "NOVA-p256dh", auth: "NOVA-auth" });
  });

  it("uma pessoa pode ter VÁRIOS dispositivos", async () => {
    const { repo, addDevice } = build();
    // cadastrados FORA de ordem de propósito: a listagem sai por created_at, não por ordem de chamada nem por sorte do id
    await addDevice("u1", 3);
    await addDevice("u1", 1);
    await addDevice("u1", 2);
    expect((await repo.listByUser("u1")).map((s) => s.endpoint)).toEqual([EP(1), EP(2), EP(3)]);
  });

  it("dispositivos criados no MESMO instante: a ordem é estável (created_at, id) — a mesma em toda chamada", async () => {
    const { repo, service } = build(); // relógio fixo em T0 → created_at idêntico
    for (const n of [1, 2, 3, 4, 5]) await service.subscribe("u1", input(n));
    const first = (await repo.listByUser("u1")).map((s) => s.id);
    const ids = [...first].sort(); // ordem total esperada: id crescente (created_at empata)
    expect(first).toEqual(ids);
    for (let i = 0; i < 5; i++) expect((await repo.listByUser("u1")).map((s) => s.id)).toEqual(first);
  });

  it("outra conta assinando no MESMO navegador (mesmo endpoint) fica com a linha; a anterior perde o aviso", async () => {
    const { repo, service } = build();
    await service.subscribe("u1", input(1));
    await service.subscribe("u2", input(1));
    expect(await repo.listByUser("u1")).toEqual([]);
    expect(await repo.listByUser("u2")).toHaveLength(1);
  });

  it("cancelar REMOVE; cancelar de novo (ou um endpoint que não existe) devolve false", async () => {
    const { repo, service } = build();
    await service.subscribe("u1", input(1));
    await service.subscribe("u1", input(2));
    expect(await service.unsubscribe("u1", EP(1))).toBe(true);
    expect((await repo.listByUser("u1")).map((s) => s.endpoint)).toEqual([EP(2)]);
    expect(await service.unsubscribe("u1", EP(1))).toBe(false);
    expect(await service.unsubscribe("u1", EP("nao-existe"))).toBe(false);
  });

  it("ninguém remove o dispositivo de OUTRA conta", async () => {
    const { repo, service } = build();
    await service.subscribe("u1", input(1));
    expect(await service.unsubscribe("u2", EP(1))).toBe(false);
    expect(await repo.listByUser("u1")).toHaveLength(1);
  });
});

describe("envio", () => {
  beforeEach(() => setVapid(true));

  it("envia a TODOS os dispositivos do usuário (e a mais ninguém) e marca last_used_at", async () => {
    const { repo, sender, service, addDevice } = build();
    await addDevice("u1", 1);
    await addDevice("u1", 2);
    await addDevice("u2", 3);
    const r = await service.sendToUser("u1", PAYLOAD);
    expect(r).toMatchObject({ enabled: true, subscriptions: 2, sent: 2, removed: 0, failed: 0 });
    expect(sender.calls.map((c) => c.target.endpoint)).toEqual([EP(1), EP(2)]);
    expect(sender.calls[0]!.payload).toEqual(PAYLOAD);
    for (const s of await repo.listByUser("u1")) expect(s.lastUsedAt?.getTime()).toBe(T0.getTime());
    expect((await repo.listByUser("u2"))[0]!.lastUsedAt).toBeNull();
  });

  it.each([410, 404])("assinatura que devolve %i é APAGADA (dispositivo desinstalado); as outras seguem", async (status) => {
    const { repo, sender, service } = build();
    await service.subscribe("u1", input(1));
    await service.subscribe("u1", input(2));
    sender.failWith.set(EP(1), { statusCode: status });
    const r = await service.sendToUser("u1", PAYLOAD);
    expect(r).toMatchObject({ subscriptions: 2, sent: 1, removed: 1, failed: 0 });
    expect((await repo.listByUser("u1")).map((s) => s.endpoint)).toEqual([EP(2)]); // a de 410/404 sumiu
    // no próximo envio, o dispositivo apagado nem é tentado
    sender.calls.length = 0;
    await service.sendToUser("u1", PAYLOAD);
    expect(sender.calls.map((c) => c.target.endpoint)).toEqual([EP(2)]);
  });

  it("erro que NÃO é 404/410 (5xx, rede) mantém a assinatura, marca failed_at e conta como falha; um envio bom depois limpa", async () => {
    const { repo, sender, service } = build();
    await service.subscribe("u1", input(1));
    sender.failWith.set(EP(1), { statusCode: 500 });
    let r = await service.sendToUser("u1", PAYLOAD);
    expect(r).toMatchObject({ sent: 0, removed: 0, failed: 1 });
    let [s] = await repo.listByUser("u1");
    expect(s!.failedAt?.getTime()).toBe(T0.getTime());

    sender.failWith.set(EP(1), { message: "ECONNRESET" }); // sem statusCode (erro de rede)
    r = await service.sendToUser("u1", PAYLOAD);
    expect(r.failed).toBe(1);
    expect(await repo.listByUser("u1")).toHaveLength(1); // continua lá

    sender.failWith.clear();
    r = await service.sendToUser("u1", PAYLOAD);
    expect(r.sent).toBe(1);
    [s] = await repo.listByUser("u1");
    expect(s!.failedAt).toBeNull();
  });

  it("falha de envio NUNCA lança pra quem chamou (nem erro de leitura das assinaturas)", async () => {
    const { repo, sender, service } = build();
    await service.subscribe("u1", input(1));
    sender.failWith.set(EP(1), { statusCode: 500 });
    await expect(service.sendToUser("u1", PAYLOAD)).resolves.toBeDefined();

    repo.listByUser = async () => { throw new Error("banco fora do ar"); };
    const r = await service.sendToUser("u1", PAYLOAD);
    expect(r.error).toBe("banco fora do ar");
    expect(r.sent).toBe(0);
  });

  it("usuário sem nenhuma assinatura: nada enviado, sem erro", async () => {
    const { sender, service } = build();
    const r = await service.sendToUser("ninguem", PAYLOAD);
    expect(r).toMatchObject({ enabled: true, subscriptions: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender.calls).toEqual([]);
  });
});

describe("SEM chaves VAPID: recurso desligado, nada quebra", () => {
  beforeEach(() => setVapid(false));

  it("vapidConfig() é null; isPushEnabled() é false; só UMA chave definida também desliga (e é sinalizada)", () => {
    expect(vapidConfig()).toBeNull();
    expect(isPushEnabled()).toBe(false);
    expect(vapidPartiallyConfigured()).toBe(false);
    process.env.VAPID_PUBLIC_KEY = "so-a-publica";
    expect(isPushEnabled()).toBe(false);
    expect(vapidPartiallyConfigured()).toBe(true);
    process.env.VAPID_PRIVATE_KEY = "   "; // em branco = ausente
    expect(isPushEnabled()).toBe(false);
  });

  it("com as duas: liga, com subject padrão (o site) ou o de VAPID_SUBJECT", () => {
    setVapid(true);
    expect(vapidConfig()).toMatchObject({ publicKey: "BPublicKeyDeTeste", subject: "https://genbreed.com.br" });
    process.env.VAPID_SUBJECT = "mailto:contato@exemplo.com";
    expect(vapidConfig()!.subject).toBe("mailto:contato@exemplo.com");
  });

  it("sendToUser NÃO envia nada, NÃO lança e NÃO mexe nas assinaturas", async () => {
    const { repo, sender, service } = build();
    await service.subscribe("u1", input(1)); // gravar continua possível
    const r = await service.sendToUser("u1", PAYLOAD);
    expect(r).toMatchObject({ enabled: false, sent: 0, removed: 0, failed: 0 });
    expect(sender.calls).toEqual([]);
    expect(await repo.listByUser("u1")).toHaveLength(1);
    expect(service.isEnabled()).toBe(false);
  });
});

describe("endpoint (anti-SSRF: o servidor faz POST na URL que o cliente manda)", () => {
  it("aceita os serviços de push reais (Chrome/Edge/Samsung, Firefox, Safari/iOS, Windows)", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://android.googleapis.com/gcm/send/abc",
    ]) expect(isAllowedPushEndpoint(ok), ok).toBe(true);
  });

  it("recusa: http, localhost/IP interno/metadados, host de terceiro, sufixo enganoso, credencial na URL, porta estranha, lixo e URL gigante", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data",
      "https://evil.example.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com.attacker.io/x",
      "https://fcm.googleapis.com@evil.com/x",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "isto não é url", "", "ftp://fcm.googleapis.com/x",
      `https://fcm.googleapis.com/${"a".repeat(MAX_ENDPOINT_LENGTH)}`,
    ]) expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
  });

  it("parseSubscribeBody: exige endpoint válido e as duas chaves; corta o user agent", () => {
    const ok = parseSubscribeBody({ endpoint: EP(1), keys: KEYS(1) }, "Mozilla/5.0");
    expect(ok).toEqual({ endpoint: EP(1), p256dh: "p256dh-1", auth: "auth-1", userAgent: "Mozilla/5.0" });
    expect(parseSubscribeBody({ endpoint: EP(1), keys: KEYS(1) }, undefined).userAgent).toBeNull();
    expect(parseSubscribeBody({ endpoint: EP(1), keys: KEYS(1) }, "x".repeat(1000)).userAgent).toHaveLength(255);
    expect(() => parseSubscribeBody({ endpoint: "https://evil.com/x", keys: KEYS(1) }, undefined)).toThrow(/endpoint inválido/);
    expect(() => parseSubscribeBody({ endpoint: EP(1) }, undefined)).toThrow(/keys/);
    expect(() => parseSubscribeBody({ endpoint: EP(1), keys: { p256dh: "x" } }, undefined)).toThrow(/keys/);
    expect(() => parseSubscribeBody(null, undefined)).toThrow();
    expect(() => parseSubscribeBody("texto", undefined)).toThrow();
  });
});

describe("modelo (schema.ts) — a restrição de unicidade NÃO impede vários dispositivos do mesmo usuário", () => {
  const cfg = getTableConfig(pushSubscriptions);

  it("SÓ o `endpoint` é único: dois dispositivos (endpoints diferentes) com o mesmo user_id são permitidos", () => {
    expect(cfg.columns.filter((c) => c.isUnique).map((c) => c.name)).toEqual(["endpoint"]);
    expect(cfg.columns.find((c) => c.name === "user_id")!.isUnique).toBe(false);
    // nenhuma restrição composta/extra que inclua user_id
    expect(cfg.uniqueConstraints.flatMap((u) => u.columns.map((c) => c.name))).not.toContain("user_id");
  });

  it("o índice em user_id é comum (não único)", () => {
    const idx = cfg.indexes.find((i) => i.config.name === "push_subscriptions_user_idx");
    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(false);
  });
});

describe("HTTP — /api/v1/push", () => {
  let app: NestFastifyApplication;
  const AUTH = (id: string) => ({ "x-user-id": id, "x-user-tier": "JUNIOR" });
  const body = (n: number | string) => ({ endpoint: EP(n), keys: KEYS(n) });
  const subscribe = (b: unknown, id = "http-u1", headers: Record<string, string> = AUTH(id)) =>
    app.inject({ method: "POST", url: "/api/v1/push/subscribe", payload: b as Record<string, unknown>, headers });
  const unsubscribe = (endpoint: string, id = "http-u1") =>
    app.inject({ method: "DELETE", url: "/api/v1/push/subscribe", payload: { endpoint }, headers: AUTH(id) });
  const repo = () => app.get(PushSubscriptionRepository);

  beforeAll(async () => { setVapid(false); app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
  afterAll(async () => { await app.close(); });

  describe("SEM VAPID", () => {
    beforeEach(() => setVapid(false));

    it("GET /config → enabled:false; POST /subscribe → 503; o resto do app segue funcionando", async () => {
      const cfg = await app.inject({ method: "GET", url: "/api/v1/push/config" });
      expect(cfg.statusCode).toBe(200);
      expect(cfg.json()).toEqual({ enabled: false });

      const sub = await subscribe(body("sem-vapid"));
      expect(sub.statusCode).toBe(503);
      expect(sub.json().message).toMatch(/não estão ativadas/);
      expect(await repo().listByUser("http-u1")).toEqual([]);

      // nada quebrou: rotas de outras features respondem normalmente
      expect((await app.inject({ method: "GET", url: "/api/v1/incubator", headers: AUTH("http-u1") })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/v1/me/tier", headers: AUTH("http-u1") })).statusCode).toBe(200);
    });

    it("DELETE continua funcionando (limpar nunca é bloqueado)", async () => {
      const r = await unsubscribe(EP("qualquer"));
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ removed: false });
    });
  });

  describe("COM VAPID", () => {
    beforeEach(() => setVapid(true));

    it("GET /config → enabled:true (público, sem login)", async () => {
      const cfg = await app.inject({ method: "GET", url: "/api/v1/push/config" });
      expect(cfg.json()).toEqual({ enabled: true });
    });

    it("sem login → 401 (subscribe e unsubscribe)", async () => {
      expect((await subscribe(body("anon"), "x", {})).statusCode).toBe(401);
      expect((await app.inject({ method: "DELETE", url: "/api/v1/push/subscribe", payload: { endpoint: EP("anon") } })).statusCode).toBe(401);
    });

    it("assinar grava; assinar de novo o mesmo endpoint atualiza (1 linha); a resposta não devolve as chaves", async () => {
      const r1 = await subscribe(body("a1"), "http-sub-1");
      expect(r1.statusCode).toBe(201);
      expect(r1.json()).toEqual({ subscribed: true });
      expect(r1.body).not.toContain("p256dh");

      const r2 = await subscribe({ endpoint: EP("a1"), keys: { p256dh: "novo-p256dh", auth: "novo-auth" } }, "http-sub-1");
      expect(r2.statusCode).toBe(201);
      const list = await repo().listByUser("http-sub-1");
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ endpoint: EP("a1"), p256dh: "novo-p256dh", auth: "novo-auth" });
    });

    it("vários dispositivos da mesma pessoa; cancelar remove só o pedido e só do dono", async () => {
      await subscribe(body("m1"), "http-multi");
      await subscribe(body("m2"), "http-multi");
      expect(await repo().listByUser("http-multi")).toHaveLength(2);

      expect((await unsubscribe(EP("m1"), "outro-usuario")).json()).toEqual({ removed: false }); // não é dele
      expect(await repo().listByUser("http-multi")).toHaveLength(2);

      expect((await unsubscribe(EP("m1"), "http-multi")).json()).toEqual({ removed: true });
      expect((await repo().listByUser("http-multi")).map((s) => s.endpoint)).toEqual([EP("m2")]);
      expect((await unsubscribe(EP("m1"), "http-multi")).json()).toEqual({ removed: false });
    });

    it("corpo inválido → 400 (endpoint fora da lista de serviços de push, chaves ausentes, DELETE sem endpoint)", async () => {
      expect((await subscribe({ endpoint: "https://evil.example.com/x", keys: KEYS(1) })).statusCode).toBe(400);
      expect((await subscribe({ endpoint: "http://fcm.googleapis.com/x", keys: KEYS(1) })).statusCode).toBe(400);
      expect((await subscribe({ endpoint: EP("sem-chaves") })).statusCode).toBe(400);
      expect((await app.inject({ method: "DELETE", url: "/api/v1/push/subscribe", payload: {}, headers: AUTH("http-u1") })).statusCode).toBe(400);
    });
  });
});
