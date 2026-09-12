import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { CrossService } from "../src/cross/cross.service";
import { GeneBankService } from "../src/gene-bank/gene-bank.service";
import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";

describe("Criopreservação (Gene Bank)", () => {
  let repo: InMemorySpecimenRepository; let cross: CrossService; let wallet: WalletService; let gb: GeneBankService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); cross = new CrossService(repo, wallet); wallet = new WalletService(new InMemoryWalletRepository()); gb = new GeneBankService(repo, cross, wallet); });

  it("congela uma OPÇÃO → cria espécime FROZEN e debita Catalisadores", async () => {
    const opts = await cross.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const r = await gb.freezeOption("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: opts.options[0]!.key });
    expect(r.specimen.status).toBe("FROZEN");
    expect(r.wallet.catalisadores).toBe(12450 - 20);
  });

  it("espécime CONGELADO não pode cruzar até descongelar", async () => {
    const opts = await cross.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const frozen = await gb.freezeOption("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: opts.options[0]!.key });
    await expect(cross.execute("demo", "SENIOR", { sireId: frozen.specimen.id, damId: "onca-pintada", method: "BC1" }))
      .rejects.toThrow(/congelado/);
    // descongela → agora cruza
    const thawed = await gb.thaw("demo", frozen.specimen.id);
    expect(thawed.specimen.status).toBe("ALIVE");
    expect(thawed.wallet.biomassa).toBe(125480 - 10000);
    const r = await cross.execute("demo", "SENIOR", { sireId: frozen.specimen.id, damId: "onca-pintada", method: "BC1" });
    expect(r.specimen.id).toBeTruthy();
  });

  it("congela ESPÉCIME existente e bloqueia por saldo insuficiente", async () => {
    const f = await gb.freezeSpecimen("demo", "onca-pintada");
    expect(f.specimen.status).toBe("FROZEN");
    // drena catalisadores e tenta de novo
    await wallet.charge("demo", { catalisadores: f.wallet.catalisadores });
    await expect(gb.freezeSpecimen("demo", "onca-negra")).rejects.toThrow(/insuficientes/);
  });

  it("sintetiza o escolhido e CONGELA os demais (fluxo do Tales)", async () => {
    const opts = await cross.options("PHD", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const keys = opts.options.map((o) => o.key);
    const chosen = keys[0]!;
    const r = await gb.synthesizeAndFreeze("demo", "PHD", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: chosen }, keys);
    expect(r.specimen.status).toBe("ALIVE");            // o escolhido nasce vivo
    expect(r.frozenCount).toBe(keys.length - 1);         // os demais congelados
    for (const f of r.frozen) expect(f.status).toBe("FROZEN");
    expect(r.wallet.catalisadores).toBeLessThanOrEqual(12450 - 20 * (keys.length - 1));
  });
});
