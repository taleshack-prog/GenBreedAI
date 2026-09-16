/**
 * Regressão: generateForSpecimen cobrava a cota de `s.ownerId` — fundadores
 * têm ownerId "demo" (sem cota/crédito) → gerar retrato de fundador dava 403
 * pra QUALQUER usuário. Correção: cota/crédito sempre de `payerId` (quem
 * pediu, autenticado), nunca do dono do espécime; acesso passa a exigir dono
 * OU fundador, E visível no pool do tier (ADR-0016); regenerar (force) só o
 * dono pode, fundador nunca (retrato compartilhado por genótipo).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { computeCacheKey, FELINE_PACK } from "@genbreedai/engine";
import { InMemorySpecimenRepository, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { ImageService } from "../src/images/image.service";
import { remove } from "../src/images/storage";

const AUTOSOMAL: Record<string, [string, string]> = {
  A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
  Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
};

/** Espécime "de outro usuário" (não fundador) — filhote fictício, dono "user-other". */
function othersSpecimen(): StoredSpecimen {
  return {
    id: "other-users-cub", ownerId: "user-other", pack: "feline", species: "felis-catus",
    genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 1, sireId: "gato-branco", damId: "gato-tabby",
    method: "F1", fPedigree: 0, fixationIndex: 0, aura: 2, cacheKey: null,
    sex: "M", fertility: null, haldaneStatus: null,
  };
}

/** cacheKey determinístico de um espécime (mesma fórmula de image.service.ts). */
function cacheKeyOf(s: StoredSpecimen): string {
  return s.cacheKey ?? computeCacheKey(s.genotype, FELINE_PACK, s.sex ?? undefined);
}

describe("Acesso a retrato de espécime — dono/fundador/pool, cota do payerId (correção ownerId='demo')", () => {
  let repo: InMemorySpecimenRepository;
  let quota: ImageQuotaService;
  let svc: ImageService;

  beforeEach(async () => {
    delete process.env.FAL_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.IMAGE_QUOTA_UNLIMITED;
    repo = new InMemorySpecimenRepository();
    quota = new ImageQuotaService();
    svc = new ImageService(repo, new ImageJobRepository(), quota, new WalletService(new InMemoryWalletRepository()));
    await repo.save(othersSpecimen());
    // Limpa qualquer arquivo de retrato deixado por uma rodada anterior —
    // sem isso, `stat(cacheKey)` acharia "cache" e os testes nem chegariam
    // a checar acesso/cota (mesma cautela de storage.spec.ts).
    for (const id of ["gato-branco", "gato-tabby", "gato-siames", "onca-pintada"]) {
      const s = (await repo.get(id))!;
      await remove(cacheKeyOf(s));
    }
    await remove(cacheKeyOf(othersSpecimen()));
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.FAL_KEY; });

  it("PHD gera retrato de FUNDADOR sem imagem → cobra a cota do usuário (payerId), não de 'demo'", async () => {
    process.env.FAL_KEY = "test-fake-key";
    // Mock de fetch (sem rede de verdade) — só pra alcançar a checagem de
    // cota, que só roda com FAL_KEY definido (modo procedural nunca cobra).
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://fal.run/")) {
        return new Response(JSON.stringify({ images: [{ url: "https://fake.test/img.png" }] }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }));
    const r = await svc.generate("gato-branco", "user-phd-1", "PHD");
    try {
      expect(r.status).toBe("APPROVED");
      expect(await quota.used("user-phd-1")).toBe(1);
      expect(await quota.used("demo")).toBe(0);
    } finally {
      await remove(r.cacheKey);
    }
  });

  it("FREE sem cota (limite 0) nem crédito de imagem → 403 com a mensagem atual", async () => {
    process.env.FAL_KEY = "test-fake-key"; // precisa estar "ligado" pra cota valer (senão cai em modo procedural, grátis)
    let caught: unknown;
    try { await svc.generate("gato-tabby", "user-free-1", "FREE"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as Error).message).toContain("Sem cota mensal nem créditos de imagem");
  });

  it("gerar retrato de espécime de OUTRO usuário (não fundador) → 404", async () => {
    let caught: unknown;
    try { await svc.generate("other-users-cub", "user-random", "PHD"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NotFoundException);
  });

  it("ver (getCached) retrato de espécime de OUTRO usuário → 404", async () => {
    let caught: unknown;
    try { await svc.getCached("other-users-cub", "user-random", "PHD"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NotFoundException);
  });

  it("FREE tenta gerar retrato de fundador SELVAGEM (panthera-onca, fora do pool DOMESTIC_CAT) → 404", async () => {
    let caught: unknown;
    try { await svc.generate("onca-pintada", "user-free-2", "FREE"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NotFoundException);
  });

  it("force=true em FUNDADOR → 403 ('Retratos de fundador não podem ser regenerados.')", async () => {
    let caught: unknown;
    try { await svc.generate("gato-siames", "user-any", "PHD", true); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as Error).message).toContain("fundador");
  });

  it("force=true em espécime de OUTRO usuário → 404 (nem chega a checar force)", async () => {
    let caught: unknown;
    try { await svc.generate("other-users-cub", "user-random", "PHD", true); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(NotFoundException);
  });

  it("force=true no PRÓPRIO espécime (dono) → permitido", async () => {
    const r = await svc.generate("other-users-cub", "user-other", "PHD", true);
    expect(r.cacheKey).toBeTruthy();
    expect(r.model).toBe("procedural"); // sem FAL_KEY nesta rodada — resultado imediato, sem rede
  });
});
