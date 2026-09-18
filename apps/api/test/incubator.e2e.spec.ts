/**
 * Incubadora (ADR-0021, modelo de gestação — substitui ADR-0020) — testes
 * e2e (via buildApp/inject, mesmo padrão de cross.e2e.spec.ts) pro que dá pra
 * exercitar por HTTP direto (gestar consome a vaga, nascer só depois do
 * prazo, estados 400, 429), e um bloco de instanciação direta
 * (IncubatorService, mesmo padrão de cross.service.spec.ts) pro fallback de
 * crédito (precisa conceder crédito fora do fluxo HTTP normal), gestações
 * simultâneas sem teto, e determinismo cruzamento→nascimento.
 *
 * BUGFIX (rodada de timeout): os testes que precisam avançar o prazo de
 * gestação NÃO usam mais `vi.useFakeTimers()` — combinado com `app.inject()`
 * (Fastify/`light-my-request`, que resolve a resposta via `setImmediate`
 * internamente), o fake global de timers trava a promise da requisição pra
 * sempre (o `setImmediate` que resolveria nunca dispara sem
 * `vi.advanceTimersByTimeAsync`), e o teste estoura os 5s de timeout. Pior:
 * como o teste trava DENTRO do `await app.inject(...)`, o `finally` que
 * restauraria `vi.useRealTimers()` nunca roda — os timers fake vazam pros
 * testes SEGUINTES do mesmo arquivo, que passam a travar também (era a causa
 * dos "4 testes com timeout": 1 trava de verdade, e mais 3 herdam o estado
 * quebrado). Troca: `SystemClock.setForTesting()` (`common/clock.ts`) avança
 * só o relógio que a REGRA DE NEGÓCIO lê — nunca os timers do runtime — então
 * `app.inject()` resolve normalmente.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";
import { SystemClock } from "../src/common/clock";
import { InMemoryIncubatorRepository } from "../src/incubator/in-memory.repository";
import { IncubatorService } from "../src/incubator/incubator.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { ImageService } from "../src/images/image.service";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { QuotaService } from "../src/quota/quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { CrossService } from "../src/cross/cross.service";
import type { Genotype, Phenotype } from "@genbreedai/shared";

let app: NestFastifyApplication;
let appClock: SystemClock;
const post = (url: string, body: Record<string, unknown> | undefined, headers: Record<string, string>) =>
  app.inject({ method: "POST", url, payload: body, headers });
const del = (url: string, headers: Record<string, string>) => app.inject({ method: "DELETE", url, headers });
const get = (url: string, headers: Record<string, string>) => app.inject({ method: "GET", url, headers });

const AUTH_JUNIOR = (id: string) => ({ "x-user-id": id, "x-user-tier": "JUNIOR" });
const AUTH_FREE = (id: string) => ({ "x-user-id": id, "x-user-tier": "FREE" });
const CROSS = { sireId: "gato-tabby", damId: "gato-siames", method: "F1" };

// `apps/api/.env` real (dev local, gitignorado) tem CROSS_QUOTA_UNLIMITED=true
// (nome antigo, ainda aceito por compatibilidade — ver quota-unlimited-dev.ts)
// — `main.ts` carrega via `dotenv/config` no import. Sem apagar os DOIS
// nomes aqui, TODA cota (cross_hourly E birth, QuotaService.reserve() não
// distingue) fica sempre liberada, e os testes de 429/crédito deste arquivo
// "passam" mesmo com a cota genuinamente quebrada (mesmo padrão de
// isolamento já usado em cross.e2e.spec.ts).
let savedQuotaUnlimitedDev: string | undefined;
let savedCrossQuotaUnlimited: string | undefined;
beforeAll(async () => {
  process.env.NODE_ENV = "test"; process.env.AUTH_DEV_HEADERS = "true";
  delete process.env.DATABASE_URL; delete process.env.FAL_KEY; // modo procedural — só testa a COTA, não o pixel
  savedQuotaUnlimitedDev = process.env.QUOTA_UNLIMITED_DEV; delete process.env.QUOTA_UNLIMITED_DEV;
  savedCrossQuotaUnlimited = process.env.CROSS_QUOTA_UNLIMITED; delete process.env.CROSS_QUOTA_UNLIMITED;
  app = await buildApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  // Mesma instância que `IncubatorService`/`QuotaService` recebem via DI
  // (`ClockModule` usa `useExisting` — ver `common/clock.module.ts`).
  appClock = app.get(SystemClock);
});
afterAll(async () => {
  await app.close();
  if (savedQuotaUnlimitedDev === undefined) delete process.env.QUOTA_UNLIMITED_DEV;
  else process.env.QUOTA_UNLIMITED_DEV = savedQuotaUnlimitedDev;
  if (savedCrossQuotaUnlimited === undefined) delete process.env.CROSS_QUOTA_UNLIMITED;
  else process.env.CROSS_QUOTA_UNLIMITED = savedCrossQuotaUnlimited;
});

/** Cruza e devolve a 1ª descrição criada (id + campos usados nos testes). */
async function crossOne(headers: Record<string, string>) {
  const res = await post("/api/v1/cross", CROSS, headers);
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return body.entries[0] as { id: string; genotype: unknown; phenotype: unknown; sex: string; aura: number };
}

describe("Incubadora — HTTP (ADR-0021, gestação)", () => {
  it("gestar consome birthQuota; gestar a MESMA entrada de novo → 400 (já gestando)", async () => {
    const headers = AUTH_JUNIOR("incu-gestate-1");
    const entry = await crossOne(headers);

    const meBefore = (await get("/api/v1/me/tier", headers)).json();
    expect(meBefore.birthQuota.used).toBe(0);

    const r1 = await post(`/api/v1/incubator/${entry.id}/gestate`, undefined, headers);
    expect(r1.statusCode).toBe(201);
    expect(r1.json().state).toBe("GESTANDO");
    expect(r1.json().gestationEndsAt).not.toBeNull();
    const meAfter1 = (await get("/api/v1/me/tier", headers)).json();
    expect(meAfter1.birthQuota.used).toBe(1);

    const r2 = await post(`/api/v1/incubator/${entry.id}/gestate`, undefined, headers);
    expect(r2.statusCode).toBe(400); // já gestando — não reconsome a vaga
    const meAfter2 = (await get("/api/v1/me/tier", headers)).json();
    expect(meAfter2.birthQuota.used).toBe(1);
  });

  it("nascer antes do prazo → 400 com o tempo restante; depois do prazo gera a imagem e cria o espécime sem consumir vaga; nascer 2x → 400; nascer sem gestar → 400", async () => {
    const headers = AUTH_JUNIOR("incu-born-1");
    const entry = await crossOne(headers);
    const gestateRes = await post(`/api/v1/incubator/${entry.id}/gestate`, undefined, headers);
    const gestationEndsAt = gestateRes.json().gestationEndsAt as string;

    // Antes do prazo (tempo real não avançado) → 400 com o tempo restante.
    const early = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
    expect(early.statusCode).toBe(400);
    expect(early.json().message).toMatch(/ainda não terminou/);

    const meBefore = (await get("/api/v1/me/tier", headers)).json();
    try {
      // Avança só o relógio que a REGRA lê (Clock), nunca os timers do
      // runtime — `vi.useFakeTimers()` travaria `app.inject()` (ver nota no
      // topo do arquivo).
      appClock.setForTesting(new Date(new Date(gestationEndsAt).getTime() + 1000));
      const bornRes = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
      expect(bornRes.statusCode).toBe(201);
      const specimen = bornRes.json().specimen;
      expect(specimen.genotype).toEqual(entry.genotype); // sem recalcular nada
      expect(specimen.phenotype).toEqual(entry.phenotype);
      expect(specimen.sex).toBe(entry.sex);
      const meAfter = (await get("/api/v1/me/tier", headers)).json();
      expect(meAfter.birthQuota.used).toBe(meBefore.birthQuota.used); // nascer não cobra vaga

      // nascer de novo (já nasceu) → 400
      const again = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
      expect(again.statusCode).toBe(400);
    } finally {
      appClock.setForTesting(null);
    }

    // outra entrada, NUNCA gestada → nascer recusa
    const entry2 = await crossOne(headers);
    const notGestating = await post(`/api/v1/incubator/${entry2.id}/born`, undefined, headers);
    expect(notGestating.statusCode).toBe(400);
    expect(notGestating.json().message).toMatch(/Inicie a gestação/);
  });

  it("DELETE descarta a entrada — some da listagem", async () => {
    const headers = AUTH_JUNIOR("incu-discard-1");
    const entry = await crossOne(headers);
    expect((await del(`/api/v1/incubator/${entry.id}`, headers)).statusCode).toBe(200);
    const list = (await get("/api/v1/incubator", headers)).json();
    expect(list.find((e: { id: string }) => e.id === entry.id)).toBeUndefined();
  });

  it("FREE (birthQuota 1/7dias): gestar 1ª entrada passa; gestar OUTRA entrada sem vaga nem crédito → 429 com nextAvailableAt", async () => {
    const headers = AUTH_FREE("incu-429-1");
    const e1 = await crossOne(headers);
    const e2 = await crossOne(headers);
    expect((await post(`/api/v1/incubator/${e1.id}/gestate`, undefined, headers)).statusCode).toBe(201);
    const blocked = await post(`/api/v1/incubator/${e2.id}/gestate`, undefined, headers);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().nextAvailableAt).not.toBeNull();
  });
});

describe("Incubadora — instanciação direta (fallback de crédito, gestações simultâneas, determinismo)", () => {
  function build() {
    const incubatorRepo = new InMemoryIncubatorRepository();
    const specimenRepo = new InMemorySpecimenRepository();
    const images = new ImageService(specimenRepo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const wallet = new WalletService(new InMemoryWalletRepository());
    const clock = new SystemClock();
    const quota = new QuotaService(clock);
    const cross = new CrossService(specimenRepo, wallet);
    const incubator = new IncubatorService(incubatorRepo, specimenRepo, images, quota, wallet, clock);
    return { incubatorRepo, specimenRepo, images, wallet, quota, cross, incubator, clock };
  }

  const genotype: Genotype = { loci: { A: ["a", "a"] }, qtl: {} };
  const phenotype: Phenotype = { loci: { A: "não-melanístico" }, qtl: {}, viable: true, epistasis: [], hasMutation: false };
  const makeEntry = (incubatorRepo: InMemoryIncubatorRepository, owner: string, aura = 3) => incubatorRepo.create({
    ownerId: owner, crossId: "cx", sireId: "gato-tabby", damId: "gato-siames", method: "F1",
    pack: "feline", species: "felis-catus",
    genotype, phenotype,
    prob: 1, fPedigree: 0, fixationIndex: 0, aura, generation: 1, sex: "M" as const, fertility: null, haldaneStatus: null,
  });

  it("sem birthQuota (esgotada), com crédito de imagem → gesta usando o crédito (não lança 429) e debita o crédito; sem nenhum dos dois → lança", async () => {
    const { incubatorRepo, wallet, incubator } = build();
    const owner = "credit-user";

    // Esgota a birthQuota do FREE (1/rolling7d) gestando uma 1ª entrada de verdade.
    const first = await makeEntry(incubatorRepo, owner);
    await incubator.gestate(first.id, owner, "FREE");
    // Concede 1 crédito de imagem (fonte real: referral/compra/bônus quinzenal — aqui, direto).
    await wallet.creditImageCredits(owner, 1);
    const creditsBefore = (await wallet.get(owner)).imageCredits ?? 0;

    const second = await makeEntry(incubatorRepo, owner);
    const result = await incubator.gestate(second.id, owner, "FREE"); // vaga já esgotada — deve cair no crédito
    expect(result.state).toBe("GESTANDO");
    const creditsAfter = (await wallet.get(owner)).imageCredits ?? 0;
    expect(creditsAfter).toBe(creditsBefore - 1); // o crédito foi consumido

    // Uma 3ª tentativa, sem vaga e sem crédito, → 429 (HttpException).
    const third = await makeEntry(incubatorRepo, owner);
    await expect(incubator.gestate(third.id, owner, "FREE")).rejects.toThrow();
  });

  it("gestações simultâneas: sem teto — N entradas diferentes gestando ao mesmo tempo, nenhuma bloqueia a outra", async () => {
    const { incubatorRepo, incubator } = build();
    const owner = "multi-gestate-user"; // PHD: 3/dia — gesta as 3 sem qualquer bloqueio cruzado
    const entries = await Promise.all([1, 2, 3].map(() => makeEntry(incubatorRepo, owner)));
    const results = [];
    for (const e of entries) results.push(await incubator.gestate(e.id, owner, "PHD"));
    expect(results.every((r) => r.state === "GESTANDO")).toBe(true);
    // Todas seguem gestando simultaneamente — nenhuma foi afetada pelas outras.
    const list = await incubator.list(owner);
    expect(list.filter((e) => e.state === "GESTANDO").length).toBe(3);
  });

  it("determinismo: o genótipo/fenótipo/sexo do espécime nascido é EXATAMENTE o que foi incubado (sem recalcular)", async () => {
    const { incubator, cross, incubatorRepo, clock } = build();
    const owner = "det-user";
    const tier = "PHD" as const;
    const dto = { sireId: "onca-pintada", damId: "onca-negra", method: "F1" as const, seed: "det-seed-1" };
    const inc = await cross.incubate(owner, tier, dto);
    const e = inc.entries[0]!;
    const stored = await incubatorRepo.create({
      ownerId: owner, crossId: inc.crossId, sireId: inc.sireId, damId: inc.damId, method: inc.method,
      pack: inc.pack as "feline" | "canine", species: inc.species,
      genotype: e.genotype, phenotype: e.phenotype, prob: e.prob, fPedigree: e.fPedigree, fixationIndex: e.fixationIndex,
      aura: e.aura, generation: e.generation, sex: e.sex, fertility: e.fertility, haldaneStatus: e.haldaneStatus,
    });
    const gestated = await incubator.gestate(stored.id, owner, tier);

    let specimen;
    try {
      clock.setForTesting(new Date(new Date(gestated.gestationEndsAt!).getTime() + 1000));
      ({ specimen } = await incubator.born(stored.id, owner, tier));
    } finally {
      clock.setForTesting(null);
    }
    expect(specimen.genotype).toEqual(e.genotype);
    expect(specimen.phenotype).toEqual(e.phenotype);
    expect(specimen.sex).toBe(e.sex);
    expect(specimen.fPedigree).toBe(e.fPedigree);
    expect(specimen.fixationIndex).toBe(e.fixationIndex);
    expect(specimen.aura).toBe(e.aura);

    // repete o MESMO cruzamento (mesmo seed) — as descrições saem byte-a-byte iguais.
    const inc2 = await cross.incubate(owner, tier, dto);
    expect(inc2.entries[0]!.genotype).toEqual(e.genotype);
    expect(inc2.entries[0]!.phenotype).toEqual(e.phenotype);
    expect(inc2.entries[0]!.sex).toBe(e.sex);
  });
});
