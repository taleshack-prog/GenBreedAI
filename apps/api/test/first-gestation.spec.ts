/**
 * ADR-0025 — a PRIMEIRA gestação de cada conta dura 5 minutos (qualquer aura);
 * as seguintes usam a tabela por aura (ADR-0021). A marca vive em
 * `users.first_gestation_at` (`UserRepository`), não nas entradas da
 * incubadora — elas somem (nascida em 7 dias, descartada é apagada).
 *
 * Instanciação direta (mesmo padrão de `incubator.e2e.spec.ts`), com o `Clock`
 * fixado por `setForTesting` (nunca `vi.useFakeTimers()`), e um bloco HTTP
 * curto pro flag de `GET /me/tier`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";
import { SystemClock } from "../src/common/clock";
import { InMemoryIncubatorRepository } from "../src/incubator/in-memory.repository";
import { IncubatorService } from "../src/incubator/incubator.service";
import { GESTATION_HOURS_BY_AURA, FIRST_GESTATION_MINUTES, firstGestationEndFor } from "../src/incubator/gestation-time";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { InMemoryUserRepository } from "../src/auth/user.repository";
import { ImageService } from "../src/images/image.service";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { QuotaService } from "../src/quota/quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import type { Genotype, Phenotype } from "@genbreedai/shared";

// ISOLAMENTO DO AMBIENTE (todo o arquivo, não só o bloco HTTP): `../src/main` carrega o
// `apps/api/.env` local via `dotenv/config` no import. Sem limpar estas variáveis:
//  - DATABASE_URL  → `new QuotaService()` conecta no banco REAL e grava reservas de teste;
//  - FAL_KEY       → `born()` chama o fal.ai de verdade (lento — estoura o timeout — e pago);
//  - *_QUOTA_UNLIMITED* → a cota nunca bloqueia, então os testes de 429 "passam" sem testar nada.
// Mesmo isolamento de `incubator.e2e.spec.ts`; restaura tudo no fim.
const ISOLATED_ENV = [
  "NODE_ENV", "AUTH_DEV_HEADERS", "DATABASE_URL", "FAL_KEY",
  "QUOTA_UNLIMITED_DEV", "CROSS_QUOTA_UNLIMITED", "IMAGE_QUOTA_UNLIMITED",
] as const;
let savedEnv: Record<string, string | undefined>;
beforeAll(() => {
  savedEnv = Object.fromEntries(ISOLATED_ENV.map((k) => [k, process.env[k]]));
  process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true";
  for (const k of ["DATABASE_URL", "FAL_KEY", "QUOTA_UNLIMITED_DEV", "CROSS_QUOTA_UNLIMITED", "IMAGE_QUOTA_UNLIMITED"]) delete process.env[k];
});
afterAll(() => {
  for (const k of ISOLATED_ENV) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
});

const T0 = new Date("2026-06-01T12:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const genotype: Genotype = { loci: { A: ["a", "a"] }, qtl: {} };
const phenotype: Phenotype = { loci: { A: "não-melanístico" }, qtl: {}, viable: true, epistasis: [], hasMutation: false };

function build() {
  const incubatorRepo = new InMemoryIncubatorRepository();
  const specimenRepo = new InMemorySpecimenRepository();
  const wallet = new WalletService(new InMemoryWalletRepository());
  const images = new ImageService(specimenRepo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
  const clock = new SystemClock();
  const users = new InMemoryUserRepository();
  const incubator = new IncubatorService(incubatorRepo, specimenRepo, images, new QuotaService(clock), wallet, clock, users);
  const makeEntry = (owner: string, aura = 3) => incubatorRepo.create({
    ownerId: owner, crossId: "cx", sireId: "gato-tabby", damId: "gato-siames", method: "F1",
    pack: "feline", species: "felis-catus", genotype, phenotype,
    prob: 1, fPedigree: 0, fixationIndex: 0, aura, generation: 1, sex: "M" as const, fertility: null, haldaneStatus: null,
  });
  return { incubatorRepo, incubator, clock, users, makeEntry };
}

const msUntilEnd = (v: { gestationEndsAt: string | null }, from: Date) => new Date(v.gestationEndsAt!).getTime() - from.getTime();

describe("ADR-0025 — primeira gestação da conta = 5 minutos", () => {
  it("firstGestationEndFor soma exatamente 5 minutos", () => {
    expect(FIRST_GESTATION_MINUTES).toBe(5);
    expect(firstGestationEndFor(T0).toISOString()).toBe("2026-06-01T12:05:00.000Z");
  });

  it.each([1, 2, 3, 4, 5])("aura %i: a PRIMEIRA gestação da conta dura 5 minutos (não %ih)", async (aura) => {
    const { incubator, clock, makeEntry } = build();
    const owner = `first-aura-${aura}`;
    clock.setForTesting(T0);
    try {
      const entry = await makeEntry(owner, aura);
      const v = await incubator.gestate(entry.id, owner, "PHD");
      expect(msUntilEnd(v, T0)).toBe(5 * MIN);
      expect(v.firstGestation).toBe(true);
      expect(v.gestationHours).toBe(GESTATION_HOURS_BY_AURA[aura]); // a tabela continua sendo a "previsão" das seguintes
      expect(v.state).toBe("GESTANDO");
    } finally { clock.setForTesting(null); }
  });

  it.each([[1, 12], [2, 18], [3, 24], [4, 36], [5, 48]])(
    "aura %i: a SEGUNDA gestação usa a tabela normal (%ih)",
    async (aura, hours) => {
      const { incubator, clock, makeEntry } = build();
      const owner = `second-aura-${aura}`;
      clock.setForTesting(T0);
      try {
        const first = await incubator.gestate((await makeEntry(owner, aura)).id, owner, "PHD");
        const second = await incubator.gestate((await makeEntry(owner, aura)).id, owner, "PHD");
        expect(msUntilEnd(first, T0)).toBe(5 * MIN);
        expect(msUntilEnd(second, T0)).toBe(hours * HOUR);
        expect(second.firstGestation).toBe(false);
      } finally { clock.setForTesting(null); }
    },
  );

  it("a marca SOBREVIVE ao apagamento das entradas: nascida some em 7 dias e a descartada é deletada — a próxima gestação continua na tabela", async () => {
    const { incubator, incubatorRepo, users, clock, makeEntry } = build();
    const owner = "survives-user";
    try {
      clock.setForTesting(T0);
      const first = await incubator.gestate((await makeEntry(owner, 2)).id, owner, "PHD");
      const mark = await users.getFirstGestation(owner);
      expect(mark?.at.getTime()).toBe(T0.getTime());
      expect(mark?.entryId).toBe(first.id);

      // nasce depois dos 5 min...
      clock.setForTesting(new Date(T0.getTime() + 6 * MIN));
      await incubator.born(first.id, owner, "PHD");
      // ...e 8 dias depois a ENTRADA some (limpeza preguiçosa, ADR-0023).
      clock.setForTesting(new Date(T0.getTime() + 8 * 24 * HOUR));
      const page = await incubator.list(owner);
      expect(page.entries.some((e) => e.id === first.id)).toBe(false);
      expect(await incubatorRepo.get(first.id)).toBeFalsy(); // a única prova da 1ª gestação SUMIU...

      // ...e mesmo assim a conta NÃO ganha uma segunda "primeira".
      const laterStart = new Date(T0.getTime() + 8 * 24 * HOUR);
      const later = await incubator.gestate((await makeEntry(owner, 1)).id, owner, "PHD");
      expect(msUntilEnd(later, laterStart)).toBe(12 * HOUR);
      expect(later.firstGestation).toBe(false);
      expect((await users.getFirstGestation(owner))?.at.getTime()).toBe(T0.getTime()); // nunca mais muda
      expect((await users.getFirstGestation(owner))?.entryId).toBe(first.id);
    } finally { clock.setForTesting(null); }
  });

  it("descartar a entrada da 1ª gestação também não devolve a cortesia", async () => {
    const { incubator, users, clock, makeEntry } = build();
    const owner = "discard-first-user";
    clock.setForTesting(T0);
    try {
      const first = await incubator.gestate((await makeEntry(owner, 3)).id, owner, "PHD");
      await incubator.discard(first.id, owner);
      const next = await incubator.gestate((await makeEntry(owner, 3)).id, owner, "PHD");
      expect(msUntilEnd(next, T0)).toBe(24 * HOUR);
      expect((await users.getFirstGestation(owner))?.at.getTime()).toBe(T0.getTime());
    } finally { clock.setForTesting(null); }
  });

  it("contas diferentes têm cada uma a sua primeira", async () => {
    const { incubator, clock, makeEntry } = build();
    clock.setForTesting(T0);
    try {
      const a1 = await incubator.gestate((await makeEntry("conta-a", 5)).id, "conta-a", "PHD");
      const b1 = await incubator.gestate((await makeEntry("conta-b", 5)).id, "conta-b", "FREE");
      const a2 = await incubator.gestate((await makeEntry("conta-a", 5)).id, "conta-a", "PHD");
      expect(msUntilEnd(a1, T0)).toBe(5 * MIN);
      expect(msUntilEnd(b1, T0)).toBe(5 * MIN); // a gestação da conta A não gastou a da B
      expect(msUntilEnd(a2, T0)).toBe(48 * HOUR);
    } finally { clock.setForTesting(null); }
  });

  it("gestações simultâneas da mesma conta: exatamente UMA ganha os 5 minutos (claim atômico)", async () => {
    const { incubator, clock, makeEntry } = build();
    const owner = "race-user";
    clock.setForTesting(T0);
    try {
      const ids = await Promise.all([1, 2, 3].map(async () => (await makeEntry(owner, 4)).id));
      const results = await Promise.all(ids.map((id) => incubator.gestate(id, owner, "PHD")));
      const fast = results.filter((r) => msUntilEnd(r, T0) === 5 * MIN);
      const normal = results.filter((r) => msUntilEnd(r, T0) === 36 * HOUR);
      expect(fast.length).toBe(1);
      expect(fast[0]!.firstGestation).toBe(true);
      expect(normal.length).toBe(2);
      // Relógio fixo = as 3 gestações têm o MESMO gestationStartedAt; só UMA pode vir marcada (identificação por id, não por instante).
      expect(results.filter((r) => r.firstGestation).length).toBe(1);
      const { entries } = await incubator.list(owner);
      expect(entries.filter((e) => e.firstGestation).length).toBe(1);
    } finally { clock.setForTesting(null); }
  });

  it("se a gestação FALHA antes de acontecer (corrida na mesma entrada), a cortesia NÃO é queimada", async () => {
    const { incubator, incubatorRepo, users, clock, makeEntry } = build();
    const owner = "no-burn-user";
    clock.setForTesting(T0);
    try {
      const e1 = await makeEntry(owner, 3);
      vi.spyOn(incubatorRepo, "claimGestation").mockResolvedValueOnce(null); // outro pedido levou a entrada
      await expect(incubator.gestate(e1.id, owner, "PHD")).rejects.toThrow(/já está gestando/);
      expect(await users.getFirstGestation(owner)).toBeNull(); // marca desfeita

      const e2 = await makeEntry(owner, 3);
      const ok = await incubator.gestate(e2.id, owner, "PHD");
      expect(msUntilEnd(ok, T0)).toBe(5 * MIN); // ainda tem a primeira
    } finally { clock.setForTesting(null); vi.restoreAllMocks(); }
  });

  it("a 1ª gestação consome vaga como qualquer outra (a cortesia é só de PRAZO): FREE gasta a vaga e o 2º pedido sem vaga/crédito dá 429 sem mexer na marca", async () => {
    const { incubator, users, clock, makeEntry } = build();
    const owner = "429-user";
    clock.setForTesting(T0);
    try {
      await incubator.gestate((await makeEntry(owner, 2)).id, owner, "FREE"); // usa a vaga E a cortesia
      const second = await makeEntry(owner, 2);
      await expect(incubator.gestate(second.id, owner, "FREE")).rejects.toThrow(); // 429: sem vaga nem crédito
      // O 429 não tocou nem regravou a marca da 1ª gestação.
      expect((await users.getFirstGestation(owner))?.at.getTime()).toBe(T0.getTime());
    } finally { clock.setForTesting(null); }
  });

  it("list(): só a entrada da 1ª gestação vem com firstGestation=true; antes de gestar, false", async () => {
    const { incubator, clock, makeEntry } = build();
    const owner = "flag-user";
    clock.setForTesting(T0);
    try {
      const pending = await makeEntry(owner, 2);
      const first = await incubator.gestate((await makeEntry(owner, 2)).id, owner, "PHD");
      const second = await incubator.gestate((await makeEntry(owner, 2)).id, owner, "PHD");
      const { entries } = await incubator.list(owner);
      const byId = new Map(entries.map((e) => [e.id, e]));
      expect(byId.get(first.id)!.firstGestation).toBe(true);
      expect(byId.get(second.id)!.firstGestation).toBe(false);
      expect(byId.get(pending.id)!.firstGestation).toBe(false);
    } finally { clock.setForTesting(null); }
  });
});

describe("ADR-0025 — GET /me/tier.firstGestationAvailable (HTTP)", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    // O ambiente já foi isolado pelo beforeAll de topo do arquivo.
    app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });

  const H = (id: string) => ({ "x-user-id": id, "x-user-tier": "JUNIOR" });

  it("true antes da 1ª gestação; false depois; a entrada gestada volta com firstGestation=true e prazo de ~5 min", async () => {
    const headers = H("http-first-1");
    expect((await app.inject({ method: "GET", url: "/api/v1/me/tier", headers })).json().firstGestationAvailable).toBe(true);

    const cross = await app.inject({ method: "POST", url: "/api/v1/cross", payload: { sireId: "gato-tabby", damId: "gato-siames", method: "F1" }, headers });
    expect(cross.statusCode).toBe(201);
    const entry = cross.json().entries[0] as { id: string };

    const before = Date.now();
    const g = await app.inject({ method: "POST", url: `/api/v1/incubator/${entry.id}/gestate`, headers });
    expect(g.statusCode).toBe(201);
    expect(g.json().firstGestation).toBe(true);
    const left = new Date(g.json().gestationEndsAt).getTime() - before;
    expect(left).toBeGreaterThan(4 * MIN);
    expect(left).toBeLessThanOrEqual(5 * MIN + 5000);

    expect((await app.inject({ method: "GET", url: "/api/v1/me/tier", headers })).json().firstGestationAvailable).toBe(false);
  });

  it("outra conta continua com a sua primeira disponível", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/me/tier", headers: H("http-first-2") });
    expect(r.json().firstGestationAvailable).toBe(true);
  });
});
