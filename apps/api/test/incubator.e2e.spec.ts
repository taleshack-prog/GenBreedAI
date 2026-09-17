/**
 * Incubadora (ADR-0020) — testes e2e (via buildApp/inject, mesmo padrão de
 * cross.e2e.spec.ts) pro que dá pra exercitar por HTTP direto (revelar sem
 * cobrar 2x, nascer grátis reaproveitando a imagem, estados 400, congelar),
 * e um bloco de instanciação direta (IncubatorService, mesmo padrão de
 * cross.service.spec.ts) pro fallback de crédito (precisa conceder crédito
 * fora do fluxo HTTP normal) e pro determinismo cruzamento→nascimento.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildApp } from "../src/main";
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
// nomes aqui, TODA cota (cross_hourly E reveal, QuotaService.reserve() não
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

describe("Incubadora — HTTP (ADR-0020)", () => {
  it("revelar consome revealQuota; revelar a MESMA entrada de novo NÃO cobra (idempotente)", async () => {
    const headers = AUTH_JUNIOR("incu-reveal-1");
    const entry = await crossOne(headers);

    const meBefore = (await get("/api/v1/me/tier", headers)).json();
    expect(meBefore.revealQuota.used).toBe(0);

    const r1 = await post(`/api/v1/incubator/${entry.id}/reveal`, undefined, headers);
    expect(r1.statusCode).toBe(201);
    const meAfter1 = (await get("/api/v1/me/tier", headers)).json();
    expect(meAfter1.revealQuota.used).toBe(1);

    const r2 = await post(`/api/v1/incubator/${entry.id}/reveal`, undefined, headers);
    expect(r2.statusCode).toBe(201);
    expect(r2.json().cacheKey).toBe(r1.json().cacheKey); // mesma imagem
    const meAfter2 = (await get("/api/v1/me/tier", headers)).json();
    expect(meAfter2.revealQuota.used).toBe(1); // 2ª revelação não cobrou de novo
  });

  it("nascer de uma revelada é grátis e reaproveita a imagem (cacheKey); nascer 2x → 400; nascer sem revelar → 400", async () => {
    const headers = AUTH_JUNIOR("incu-born-1");
    const entry = await crossOne(headers);
    const revealRes = await post(`/api/v1/incubator/${entry.id}/reveal`, undefined, headers);
    const revealedCacheKey = revealRes.json().cacheKey;

    const meBefore = (await get("/api/v1/me/tier", headers)).json();
    const bornRes = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
    expect(bornRes.statusCode).toBe(201);
    const specimen = bornRes.json().specimen;
    expect(specimen.cacheKey).toBe(revealedCacheKey); // reaproveita, não gera de novo
    expect(specimen.genotype).toEqual(entry.genotype); // sem recalcular nada
    expect(specimen.phenotype).toEqual(entry.phenotype);
    expect(specimen.sex).toBe(entry.sex);
    const meAfter = (await get("/api/v1/me/tier", headers)).json();
    expect(meAfter.revealQuota.used).toBe(meBefore.revealQuota.used); // nascer não cobra cota

    // nascer de novo (já nasceu) → 400
    const again = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
    expect(again.statusCode).toBe(400);

    // outra entrada, NUNCA revelada → nascer recusa
    const entry2 = await crossOne(headers);
    const notRevealed = await post(`/api/v1/incubator/${entry2.id}/born`, undefined, headers);
    expect(notRevealed.statusCode).toBe(400);
    expect(notRevealed.json().message).toMatch(/Revele antes/);
  });

  it("congelar só funciona revelada e não nascida; cobra catalisadores (mesmo valor do freezeOption antigo)", async () => {
    const headers = AUTH_JUNIOR("incu-freeze-1");
    const entry = await crossOne(headers);

    // ainda não revelada → recusa
    const early = await post(`/api/v1/incubator/${entry.id}/freeze`, undefined, headers);
    expect(early.statusCode).toBe(400);

    await post(`/api/v1/incubator/${entry.id}/reveal`, undefined, headers);
    const walletBefore = (await get("/api/v1/wallet", headers)).json();
    const frozen = await post(`/api/v1/incubator/${entry.id}/freeze`, undefined, headers);
    expect(frozen.statusCode).toBe(201);
    expect(frozen.json().entry.frozen).toBe(true);
    const walletAfter = (await get("/api/v1/wallet", headers)).json();
    expect(walletBefore.catalisadores - walletAfter.catalisadores).toBe(20);

    // nasce depois de congelada — continua grátis
    const born = await post(`/api/v1/incubator/${entry.id}/born`, undefined, headers);
    expect(born.statusCode).toBe(201);
  });

  it("DELETE descarta a entrada — some da listagem", async () => {
    const headers = AUTH_JUNIOR("incu-discard-1");
    const entry = await crossOne(headers);
    expect((await del(`/api/v1/incubator/${entry.id}`, headers)).statusCode).toBe(200);
    const list = (await get("/api/v1/incubator", headers)).json();
    expect(list.find((e: { id: string }) => e.id === entry.id)).toBeUndefined();
  });

  it("FREE (revealQuota 1/7dias): revelar 1ª entrada passa; revelar OUTRA entrada sem cota nem crédito → 429 com nextAvailableAt", async () => {
    const headers = AUTH_FREE("incu-429-1");
    const e1 = await crossOne(headers);
    const e2 = await crossOne(headers);
    expect((await post(`/api/v1/incubator/${e1.id}/reveal`, undefined, headers)).statusCode).toBe(201);
    const blocked = await post(`/api/v1/incubator/${e2.id}/reveal`, undefined, headers);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().nextAvailableAt).not.toBeNull();
  });
});

describe("Incubadora — instanciação direta (fallback de crédito, determinismo)", () => {
  function build() {
    const incubatorRepo = new InMemoryIncubatorRepository();
    const specimenRepo = new InMemorySpecimenRepository();
    const images = new ImageService(specimenRepo, new ImageJobRepository(), new ImageQuotaService(), new WalletService(new InMemoryWalletRepository()));
    const wallet = new WalletService(new InMemoryWalletRepository());
    const quota = new QuotaService();
    const cross = new CrossService(specimenRepo, wallet);
    const incubator = new IncubatorService(incubatorRepo, specimenRepo, images, quota, wallet);
    return { incubatorRepo, specimenRepo, images, wallet, quota, cross, incubator };
  }

  it("sem revealQuota (esgotada), com crédito de imagem → revela usando o crédito (não lança 429) e debita o crédito", async () => {
    const { incubatorRepo, wallet, incubator } = build();
    const owner = "credit-user";
    const genotype: Genotype = { loci: { A: ["a", "a"] }, qtl: {} };
    const phenotype: Phenotype = { loci: { A: "não-melanístico" }, qtl: {}, viable: true, epistasis: [], hasMutation: false };
    const makeEntry = () => incubatorRepo.create({
      ownerId: owner, crossId: "cx", sireId: "gato-tabby", damId: "gato-siames", method: "F1",
      pack: "feline", species: "felis-catus",
      genotype, phenotype,
      prob: 1, fPedigree: 0, fixationIndex: 0, aura: 3, generation: 1, sex: "M" as const, fertility: null, haldaneStatus: null,
    });

    // Esgota a revealQuota do FREE (1/rolling7d) revelando uma 1ª entrada de verdade.
    const first = await makeEntry();
    await incubator.reveal(first.id, owner, "FREE");
    // Concede 1 crédito de imagem (fonte real: referral/compra/bônus semanal — aqui, direto).
    await wallet.creditImageCredits(owner, 1);
    const creditsBefore = (await wallet.get(owner)).imageCredits ?? 0;

    const second = await makeEntry();
    const result = await incubator.reveal(second.id, owner, "FREE"); // cota já esgotada — deve cair no crédito
    expect(result).toBeDefined();
    const creditsAfter = (await wallet.get(owner)).imageCredits ?? 0;
    expect(creditsAfter).toBe(creditsBefore - 1); // o crédito foi consumido

    // Uma 3ª tentativa, sem cota e sem crédito, → 429.
    const third = await makeEntry();
    await expect(incubator.reveal(third.id, owner, "FREE")).rejects.toThrow();
  });

  it("determinismo: o genótipo/fenótipo/sexo do espécime nascido é EXATAMENTE o que foi incubado (sem recalcular)", async () => {
    const { incubator, cross, incubatorRepo } = build();
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
    await incubator.reveal(stored.id, owner, tier);
    const { specimen } = await incubator.born(stored.id, owner);
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
