/**
 * Buraco corrigido: POST /api/v1/cross/preview com force=true chamava
 * generateForSpecimen(..., force) → remove(cacheKey). Como o cacheKey é só
 * genótipo+pack+sexo (compartilhado por qualquer espécime igual, inclusive
 * fundador), qualquer usuário apagava/trocava um retrato compartilhado pelo
 * ↻ da prévia.
 *
 * Correção: `ImageService.previewImage()` nem recebe `force` — sempre
 * verifica o cache primeiro e NUNCA chama `remove()`; só `regenerateOwned()`
 * (privado, chamado só por `generate()` depois do dono já confirmado) chama
 * `remove()`. Este arquivo prova, com espião em `remove()`, que nenhum
 * caminho de preview o alcança.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { computeCacheKey, FELINE_PACK } from "@genbreedai/engine";
import { InMemorySpecimenRepository, type StoredSpecimen } from "../src/specimens/in-memory.repository";
import { ImageJobRepository } from "../src/images/image-job.repository";
import { ImageQuotaService } from "../src/economy/image-quota.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { ImageService } from "../src/images/image.service";
import * as storage from "../src/images/storage";

const AUTOSOMAL: Record<string, [string, string]> = {
  A: ["a", "a"], P: ["P^t", "P^t"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], W: ["w", "w"], S: ["s", "s"],
  Ma: ["ma", "ma"], Fl: ["Fl^s", "Fl^s"], Hr: ["Hr", "Hr"], Bd: ["Bd^d", "Bd^d"], He: ["He^r", "He^r"], Ec: ["Ec^n", "Ec^n"],
};

/** Espécime "preview" (não persistido) — mesma forma que preview.controller.ts monta. */
function previewSpecimen(overrides: Partial<StoredSpecimen> = {}): StoredSpecimen {
  return {
    id: "preview", ownerId: "user-1", pack: "feline", species: "felis-catus",
    genotype: { loci: AUTOSOMAL, qtl: {} }, generation: 0, sireId: null, damId: null,
    method: "FOUNDER", fPedigree: 0, fixationIndex: 0, aura: 0, cacheKey: null,
    sex: "M", fertility: null, haldaneStatus: null,
    ...overrides,
  };
}
function cacheKeyOf(s: StoredSpecimen): string {
  return s.cacheKey ?? computeCacheKey(s.genotype, FELINE_PACK, s.sex ?? undefined);
}
// 3 genótipos DISTINTOS (não só sexo — Ma/ma homozigoto não muda por sexo, ver
// computeCacheKey) → 3 cacheKeys distintas, um por teste, sem depender da
// ordem de execução entre eles.
const SPEC_1 = previewSpecimen();
const SPEC_2 = previewSpecimen({ id: "preview-2", genotype: { loci: { ...AUTOSOMAL, P: ["P^r", "P^r"] }, qtl: {} } });
const SPEC_3 = previewSpecimen({ id: "preview-3", ownerId: "user-3", genotype: { loci: { ...AUTOSOMAL, B: ["b", "b"] }, qtl: {} } });

describe("Preview de cruzamento nunca apaga um retrato existente (correção do buraco force=true)", () => {
  let repo: InMemorySpecimenRepository;
  let quota: ImageQuotaService;
  let svc: ImageService;
  let removeSpy: MockInstance<typeof storage.remove>;

  beforeEach(() => {
    delete process.env.FAL_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.IMAGE_QUOTA_UNLIMITED;
    repo = new InMemorySpecimenRepository();
    quota = new ImageQuotaService();
    svc = new ImageService(repo, new ImageJobRepository(), quota, new WalletService(new InMemoryWalletRepository()));
    removeSpy = vi.spyOn(storage, "remove");
  });
  afterEach(async () => {
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
    delete process.env.FAL_KEY;
    // Limpeza dos arquivos reais que os testes possam ter gravado em disco.
    for (const s of [SPEC_1, SPEC_2, SPEC_3]) await storage.remove(cacheKeyOf(s));
  });

  it("preview com imagem JÁ existente → não apaga (remove nunca chamado), devolve a MESMA imagem versionada, cota inalterada", async () => {
    const s = SPEC_1;
    const cacheKey = cacheKeyOf(s);
    // Semeia um "retrato já existente" direto no storage — sem depender do
    // provider/rede, só pra simular o estado "já tem imagem".
    const seededUrl = await storage.store(cacheKey, Buffer.from("retrato-ja-existente"));
    const usedBefore = await quota.used("user-1");

    // `previewImage` nem recebe `force` (removido do tipo) — o pedido de
    // regenerar do cliente nunca chega perto de `remove()`.
    const r = await svc.previewImage(s, "user-1", "PHD");
    expect(r.cached).toBe(true);
    expect(r.cacheKey).toBe(cacheKey);
    expect(r.imageUrl?.split("?")[0]).toBe(seededUrl.split("?")[0]); // mesmo arquivo/endereço
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await quota.used("user-1")).toBe(usedBefore); // cota inalterada
  });

  it("preview SEM imagem existente → gera normalmente e cobra a cota do usuário (sem chamar remove)", async () => {
    process.env.FAL_KEY = "test-fake-key";
    // Mock de fetch (sem rede de verdade) — só pra alcançar a cobrança de
    // cota, que só roda com FAL_KEY definido (procedural nunca cobra).
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://fal.run/")) {
        return new Response(JSON.stringify({ images: [{ url: "https://fake.test/img.png" }] }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }));
    const s = SPEC_2;
    const usedBefore = await quota.used("user-2");

    const r = await svc.previewImage(s, "user-2", "PHD");
    expect(r.cached).toBe(false);
    expect(r.status).toBe("APPROVED");
    expect(await quota.used("user-2")).toBe(usedBefore + 1);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("nenhum caminho de preview chama remove() — espião no storage inteiro, tier variado", async () => {
    await svc.previewImage(SPEC_3, "user-3", "FREE");
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
