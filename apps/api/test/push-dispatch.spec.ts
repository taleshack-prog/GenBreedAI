/**
 * `push:dispatch` (ADR-0028): avisa quem teve a gestação concluída, uma vez só, sem custo.
 * Repositório de incubadora e de assinaturas in-memory, remetente falso, `Clock` fixo por
 * `setForTesting` (nunca fake timers). Nenhum envio real: `web-push` nem precisa estar instalada.
 * (O UPDATE ... RETURNING do adapter Drizzle não roda aqui — a migração da coluna
 * `ready_notified_at` ainda não existe pro PGlite; a exclusividade do claim é coberta no adapter
 * in-memory, que segue o mesmo contrato da porta.)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { phenoSummary } from "@genbreedai/shared";
import type { Genotype, Phenotype } from "@genbreedai/shared";
import { SystemClock } from "../src/common/clock";
import { InMemoryIncubatorRepository } from "../src/incubator/in-memory.repository";
import { InMemoryPushSubscriptionRepository } from "../src/push/push-subscription.repository";
import { PushService } from "../src/push/push.service";
import { PushSender, type PushPayload, type PushTarget } from "../src/push/push-sender";
import { dispatchReady, buildPayload, summaryLines, CLAIM_BATCH, NOTIFICATION_TITLE, NOTIFICATION_URL, NOTIFICATION_ICON } from "../src/push/dispatch-ready";

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste"; process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste"; delete process.env.VAPID_SUBJECT;
});
afterEach(() => { for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } });

class FakeSender extends PushSender {
  calls: Array<{ target: PushTarget; payload: PushPayload }> = [];
  failWith = new Map<string, { statusCode?: number }>();
  notReady: string | null = null;
  async ready() { if (this.notReady) throw new Error(this.notReady); }
  async send(target: PushTarget, payload: PushPayload) {
    this.calls.push({ target, payload });
    const f = this.failWith.get(target.endpoint);
    if (f) throw Object.assign(new Error("falha simulada"), { statusCode: f.statusCode });
  }
}

const T0 = new Date("2026-06-01T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const genotype: Genotype = { loci: { A: ["a", "a"] }, qtl: {} };
const pheno = (loci: Record<string, string>): Phenotype => ({ loci, qtl: {}, viable: true, epistasis: [], hasMutation: false });
const WHITE = pheno({ W: "branco" });          // → "Branco"
const SIAMESE = pheno({ C: "pontos" });        // → "Pontos (siamês)"
const EP = (n: number | string) => `https://fcm.googleapis.com/fcm/send/device-${n}`;

function build() {
  const incubator = new InMemoryIncubatorRepository();
  const subs = new InMemoryPushSubscriptionRepository();
  const sender = new FakeSender();
  const clock = new SystemClock();
  clock.setForTesting(T0);
  const push = new PushService(subs, sender, clock);
  const deps = { incubator, push, clock };
  const lines: string[] = [];
  const log = (l: string) => { lines.push(l); };
  // `created_at` ESTRITAMENTE crescente a cada assinatura (1 s de diferença): a ordem de `listByUser` é
  // (created_at, id) e o `id` é um uuid aleatório — com o mesmo instante a ordem entre dispositivos seria
  // arbitrária e os testes que conferem a ordem de envio dependeriam de sorte.
  let subSeq = 0;
  const subscribe = (owner: string, n: number | string) =>
    subs.upsert(owner, { endpoint: EP(n), p256dh: `p-${n}`, auth: `a-${n}`, userAgent: null }, new Date(T0.getTime() - 3_600_000 + (++subSeq) * 1000));

  /** Cria uma entrada; `endsInHours` < 0 = gestação já vencida; `undefined` = nunca gestada. */
  async function entry(owner: string, endsInHours: number | undefined, phenotype: Phenotype = WHITE) {
    const e = await incubator.create({
      ownerId: owner, crossId: "cx", sireId: "gato-tabby", damId: "gato-siames", method: "F1", pack: "feline", species: "felis-catus",
      genotype, phenotype, prob: 1, fPedigree: 0, fixationIndex: 0, aura: 3, generation: 1, sex: "M", fertility: null, haldaneStatus: null,
    });
    if (endsInHours !== undefined) {
      const ends = new Date(T0.getTime() + endsInHours * HOUR);
      await incubator.claimGestation(e.id, new Date(ends.getTime() - 24 * HOUR), ends);
    }
    return e;
  }
  return { incubator, subs, sender, clock, push, deps, lines, log, subscribe, entry };
}

describe("dispatchReady — o aviso", () => {
  it("gestação vencida + dono com assinatura → UM push 'Gestação concluída', corpo = nome do fenótipo, clique abre a Incubadora, ícone 192", async () => {
    const { deps, sender, subscribe, entry, incubator, log } = build();
    await subscribe("u1", 1);
    const e = await entry("u1", -1, SIAMESE);

    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ disabled: false, encontradas: 1, avisadas: 1, semAssinatura: 0, falhas: 0, usuarios: 1 });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.target.endpoint).toBe(EP(1));
    expect(sender.calls[0]!.payload).toEqual({
      title: "Gestação concluída", body: "Pontos (siamês)", icon: "/icon-192.png", url: "/app/incubadora", tag: `gestacao-${e.id}`,
    });
    expect((await incubator.get(e.id))!.readyNotifiedAt?.getTime()).toBe(T0.getTime()); // marcada como avisada
  });

  it("o corpo é o MESMO nome que a Incubadora mostra (phenoSummary compartilhado)", async () => {
    const { deps, sender, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    await entry("u1", -2, WHITE);
    await dispatchReady(deps, log);
    expect(sender.calls[0]!.payload.body).toBe(phenoSummary(WHITE.loci));
    expect(NOTIFICATION_TITLE).toBe("Gestação concluída");
    expect(NOTIFICATION_URL).toBe("/app/incubadora");
    expect(NOTIFICATION_ICON).toBe("/icon-192.png");
  });

  it("avisa TODOS os dispositivos do dono (vários aparelhos)", async () => {
    const { deps, sender, subscribe, entry, log } = build();
    for (const n of [1, 2, 3]) await subscribe("u1", n);
    await entry("u1", -1);
    const s = await dispatchReady(deps, log);
    expect(s.avisadas).toBe(1);
    expect(sender.calls.map((c) => c.target.endpoint)).toEqual([EP(1), EP(2), EP(3)]);
  });

  it("várias gestações vencidas do MESMO dono na rodada → UM push só, com a contagem", async () => {
    const { deps, sender, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    await entry("u1", -3, WHITE);
    await entry("u1", -2, WHITE);
    await entry("u1", -1, WHITE);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 3, avisadas: 3, usuarios: 1 });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.payload.title).toBe("Gestação concluída");
    expect(sender.calls[0]!.payload.body).toBe("Branco e mais 2 prontos para nascer");
  });

  it("buildPayload: 1 entrada → só o nome; várias → o primeiro + 'e mais N prontos para nascer'", async () => {
    const { entry } = build();
    const a = await entry("u1", -1, WHITE);
    const b = await entry("u1", -1, SIAMESE);
    expect(buildPayload([a]).body).toBe("Branco");
    expect(buildPayload([a, b]).body).toBe("Branco e mais 1 prontos para nascer");
  });
});

describe("dispatchReady — quem é candidato", () => {
  it("NÃO é candidata: gestação ainda em andamento, nunca gestada, ou já NASCIDA (o jogador fez nascer antes do aviso)", async () => {
    const { deps, sender, subscribe, entry, incubator, log } = build();
    await subscribe("u1", 1);
    const gestando = await entry("u1", +1);           // termina daqui a 1h
    const naoGestada = await entry("u1", undefined);  // nunca gestada
    const nascida = await entry("u1", -1);            // venceu…
    await incubator.markBorn(nascida.id, "spec_1");   // …mas o jogador já fez nascer

    const s = await dispatchReady(deps, log);
    expect(s.encontradas).toBe(0);
    expect(sender.calls).toEqual([]);
    for (const e of [gestando, naoGestada, nascida]) expect((await incubator.get(e.id))!.readyNotifiedAt).toBeNull(); // nada foi marcado
  });

  it("a gestação em andamento vira candidata quando o prazo vence — e aí é avisada uma vez", async () => {
    const { deps, sender, clock, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    await entry("u1", +1);
    await dispatchReady(deps, log);
    expect(sender.calls).toHaveLength(0);

    clock.setForTesting(new Date(T0.getTime() + 2 * HOUR)); // passou do prazo
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 1, avisadas: 1 });
    expect(sender.calls).toHaveLength(1);
  });

  it("IDEMPOTENTE: rodar de novo não reenvia nada", async () => {
    const { deps, sender, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    await entry("u1", -1);
    await dispatchReady(deps, log);
    const again = await dispatchReady(deps, log);
    const third = await dispatchReady(deps, log);
    expect(again).toMatchObject({ encontradas: 0, avisadas: 0 });
    expect(third.encontradas).toBe(0);
    expect(sender.calls).toHaveLength(1);
  });

  it("DUAS execuções SIMULTÂNEAS avisam cada entrada UMA vez só", async () => {
    const { deps, sender, subscribe, entry, log } = build();
    for (let i = 0; i < 6; i++) { await subscribe(`u${i}`, i); await entry(`u${i}`, -1); }
    const [a, b] = await Promise.all([dispatchReady(deps, log), dispatchReady(deps, log)]);
    expect(a.encontradas + b.encontradas).toBe(6); // 6 entradas, reivindicadas 1x cada
    expect(a.avisadas + b.avisadas).toBe(6);
    expect(sender.calls).toHaveLength(6);          // um push por dono, sem duplicata
    expect(new Set(sender.calls.map((c) => c.target.endpoint)).size).toBe(6);
  });

  it("processa em lotes: mais entradas que o lote → todas são reivindicadas", async () => {
    const { deps, entry, log } = build();
    const total = CLAIM_BATCH + 50;
    for (let i = 0; i < total; i++) await entry(`dono-${i}`, -1); // ninguém tem assinatura
    const s = await dispatchReady(deps, log);
    expect(s.encontradas).toBe(total);
    expect(s.semAssinatura).toBe(total);
  });
});

describe("dispatchReady — sem assinatura, falhas e dispositivos que sumiram", () => {
  it("dono SEM assinatura: a entrada é reivindicada (conta 'sem assinatura', não é falha) — assinar DEPOIS não gera aviso velho", async () => {
    const { deps, sender, subscribe, entry, incubator, log } = build();
    const e = await entry("u1", -5);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 1, avisadas: 0, semAssinatura: 1, falhas: 0 });
    expect(sender.calls).toEqual([]);
    expect((await incubator.get(e.id))!.readyNotifiedAt).not.toBeNull();

    await subscribe("u1", 1); // assina só agora
    const later = await dispatchReady(deps, log);
    expect(later.encontradas).toBe(0);
    expect(sender.calls).toEqual([]); // nada de aviso de uma gestação que terminou antes de assinar
  });

  it("dispositivo com 410: a assinatura é APAGADA e isso não é falha; se sobra outro dispositivo, ele é avisado", async () => {
    const { deps, sender, subs, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    await subscribe("u1", 2);
    sender.failWith.set(EP(1), { statusCode: 410 });
    await entry("u1", -1);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 1, avisadas: 1, falhas: 0, assinaturasRemovidas: 1 });
    expect((await subs.listByUser("u1")).map((x) => x.endpoint)).toEqual([EP(2)]);
  });

  it("todos os dispositivos com 410: assinaturas removidas, conta como 'sem assinatura' (não é falha)", async () => {
    const { deps, sender, subs, subscribe, entry, log } = build();
    await subscribe("u1", 1);
    sender.failWith.set(EP(1), { statusCode: 410 });
    await entry("u1", -1);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 1, avisadas: 0, semAssinatura: 1, falhas: 0, assinaturasRemovidas: 1 });
    expect(await subs.listByUser("u1")).toEqual([]);
  });

  it("erro de envio (5xx) em todos os dispositivos: conta FALHA, a assinatura FICA, e o script segue com os outros donos", async () => {
    const { deps, sender, subs, subscribe, entry, log, lines } = build();
    await subscribe("ruim", 1);
    await subscribe("bom", 2);
    sender.failWith.set(EP(1), { statusCode: 500 });
    await entry("ruim", -1);
    await entry("bom", -1);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 2, avisadas: 1, falhas: 1, usuarios: 2 });
    expect(await subs.listByUser("ruim")).toHaveLength(1);
    expect(lines.some((l) => l.includes("ruim") && l.includes("FALHA"))).toBe(true);
  });

  it("falha ao LER as assinaturas (banco): conta falha, não lança", async () => {
    const { deps, subs, entry, log } = build();
    subs.listByUser = async () => { throw new Error("banco fora do ar"); };
    await entry("u1", -1);
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ encontradas: 1, avisadas: 0, falhas: 1 });
  });
});

describe("dispatchReady — desligado, sem biblioteca e nunca em silêncio", () => {
  it("SEM chaves VAPID: recurso desligado — nada é reivindicado, nada é enviado, avisa e não falha", async () => {
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    const { deps, sender, subscribe, entry, incubator, log, lines } = build();
    await subscribe("u1", 1);
    const e = await entry("u1", -1);
    const s = await dispatchReady(deps, log);
    expect(s.disabled).toBe(true);
    expect(sender.calls).toEqual([]);
    expect((await incubator.get(e.id))!.readyNotifiedAt).toBeNull(); // continua candidata quando ligarem
    expect(lines.join("\n")).toMatch(/DESLIGADO/);
    expect(lines).toContain("ENCONTRADAS: 0 | AVISADAS: 0 | SEM ASSINATURA: 0 | FALHAS: 0");
  });

  it("chaves definidas mas a biblioteca web-push ausente: LANÇA antes de reivindicar (nenhuma entrada é consumida)", async () => {
    const { deps, sender, subscribe, entry, incubator, log } = build();
    sender.notReady = "web-push não está instalado";
    await subscribe("u1", 1);
    const e = await entry("u1", -1);
    await expect(dispatchReady(deps, log)).rejects.toThrow(/web-push não está instalado/);
    expect((await incubator.get(e.id))!.readyNotifiedAt).toBeNull();
  });

  it("NUNCA em silêncio: a contagem é impressa mesmo sem nada a fazer (0 encontradas)", async () => {
    const { deps, log, lines } = build();
    const s = await dispatchReady(deps, log);
    expect(s).toMatchObject({ disabled: false, encontradas: 0, avisadas: 0, semAssinatura: 0, falhas: 0 });
    expect(lines).toContain("ENCONTRADAS: 0 | AVISADAS: 0 | SEM ASSINATURA: 0 | FALHAS: 0");
    expect(lines.some((l) => l.startsWith("Usuários: 0"))).toBe(true);
  });

  it("e é impressa também quando há trabalho: encontradas / avisadas / sem assinatura / falhas", async () => {
    const { deps, subscribe, entry, log, lines } = build();
    await subscribe("u1", 1);
    await entry("u1", -1);
    await entry("sem-sub", -1);
    await dispatchReady(deps, log);
    expect(lines).toContain("ENCONTRADAS: 2 | AVISADAS: 1 | SEM ASSINATURA: 1 | FALHAS: 0");
  });

  it("summaryLines sempre traz as duas linhas", () => {
    const lines = summaryLines({ disabled: false, encontradas: 0, avisadas: 0, semAssinatura: 0, falhas: 0, assinaturasRemovidas: 0, usuarios: 0 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("ENCONTRADAS: 0");
  });
});
