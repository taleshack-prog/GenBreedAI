import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { GeneBankService } from "../src/gene-bank/gene-bank.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { firstSeedWithSex } from "./helpers/seed-for-sex";

describe("Criopreservação (Gene Bank)", () => {
  let repo: InMemorySpecimenRepository; let cross: CrossService; let wallet: WalletService; let gb: GeneBankService;
  // ORDEM IMPORTA: `wallet` precisa existir ANTES de `new CrossService(repo,
  // wallet)` — `CrossService` guarda a referência recebida no construtor
  // (não relê a variável de fora depois); construir `cross` com `wallet`
  // ainda `undefined` (bug de ordem, não de injeção do Nest — este arquivo
  // instancia as classes na mão, sem DI nenhuma) deixa `cross.wallet`
  // permanentemente `undefined`, e qualquer `cross.execute()` que tente
  // `this.wallet.rewardForCross(...)` explode com TypeError.
  beforeEach(() => { repo = new InMemorySpecimenRepository(); wallet = new WalletService(new InMemoryWalletRepository()); cross = new CrossService(repo, wallet); gb = new GeneBankService(repo, cross, wallet); });

  // `gb.freezeOption` (congelar uma OPÇÃO ainda não sintetizada) foi
  // REMOVIDO (ADR-0020, item 9) — toda descrição de um cruzamento já fica
  // de graça na incubadora (POST /cross), sem precisar pagar catalisadores
  // só pra "reservar" o genótipo. Cobertura equivalente (revelar/congelar
  // uma descrição JÁ revelada) vive em `incubator.e2e.spec.ts`.

  it("espécime CONGELADO não pode cruzar até descongelar", async () => {
    // Cruza e materializa DIRETO (CrossService.execute, ainda usado
    // internamente — ver ADR-0020) pra ter um espécime real pra congelar.
    let frozenId!: string;
    let frozenSex!: string;
    await firstSeedWithSex(async (seed) => {
      const r = await cross.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", seed });
      frozenId = r.specimen.id; frozenSex = r.specimen.sex!;
      return { specimen: { sex: r.specimen.sex! } };
    }, "M", "frozen-sire");
    expect(frozenSex).toBe("M");
    await gb.freezeSpecimen("demo", "SENIOR", frozenId);
    await expect(cross.execute("demo", "SENIOR", { sireId: frozenId, damId: "onca-negra", method: "BC1" }))
      .rejects.toThrow(/congelado/);
    // descongela → agora cruza
    const thawed = await gb.thaw("demo", "SENIOR", frozenId);
    expect(thawed.specimen.status).toBe("ALIVE");
    expect(thawed.wallet.biomassa).toBe(125480 - 10000);
    const r = await cross.execute("demo", "SENIOR", { sireId: frozenId, damId: "onca-negra", method: "BC1" });
    expect(r.specimen.id).toBeTruthy();
  });

  it("congela ESPÉCIME existente e bloqueia por saldo insuficiente", async () => {
    const f = await gb.freezeSpecimen("demo", "JUNIOR", "onca-pintada");
    expect(f.specimen.status).toBe("FROZEN");
    // drena catalisadores e tenta de novo
    await wallet.charge("demo", { catalisadores: f.wallet.catalisadores });
    await expect(gb.freezeSpecimen("demo", "JUNIOR", "onca-negra")).rejects.toThrow(/insuficientes/);
  });

  it("sintetiza o escolhido — ÓRFÃO (ADR-0020): 'congela os demais' não existe mais, frozen/frozenCount sempre vazios", async () => {
    const opts = await cross.options("PHD", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const keys = opts.options.map((o) => o.key);
    const chosen = keys[0]!;
    const r = await gb.synthesizeAndFreeze("demo", "PHD", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: chosen }, keys);
    expect(r.specimen.status).toBe("ALIVE"); // o escolhido ainda nasce vivo — isso não mudou
    expect(r.frozenCount).toBe(0);
    expect(r.frozen).toEqual([]);
    expect(r.skipped).toBe(0);
  });
});
