import { WalletService } from "../src/economy/wallet.service";
import { InMemoryWalletRepository } from "../src/economy/wallet.repository";
import { describe, it, expect, beforeEach } from "vitest";
import { CrossService } from "../src/cross/cross.service";
import { InMemorySpecimenRepository } from "../src/specimens/in-memory.repository";
import { wrightF } from "@genbreedai/engine";
import { firstSeedWithSex } from "./helpers/seed-for-sex";

describe("CrossService (TDD B/K/M + gate por tier)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

  it("FREE cruza gato doméstico × gato doméstico (DOMESTIC_CAT — ADR-0016)", async () => {
    const r = await svc.execute("demo", "FREE", { sireId: "gato-tabby", damId: "gato-siames", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.specimen.pack).toBe("feline");
  });

  it("FREE é BLOQUEADO em felino selvagem, MESMO intraespécie (Onça×Onça — pool ADR-0016) → 404", async () => {
    // Não é sobre interespecificidade (onça×onça é a MESMA biologicalSpecies)
    // — é sobre a espécie estar fora do pool grátis (WILD_FELINE exige JUNIOR).
    await expect(svc.execute("demo", "FREE", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" }))
      .rejects.toThrow(/não encontrado/i);
  });

  it("JUNIOR libera felino selvagem intraespécie (Onça×Onça) e segrega melanismo", async () => {
    const r = await svc.execute("demo", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.engine.fPedigree).toBe(0);
    expect(r.specimen.pack).toBe("feline");
  });

  it("FREE é BLOQUEADO no interespecífico selvagem (Puma×Panthera) → 404 (pool, não mais 403 'interespecífico')", async () => {
    // onca-pintada-2 no lugar de onca-pintada: mesma espécie/pool (WILD_FELINE),
    // evita reusar onca-pintada (Macho, ver FOUNDER_SEX) como dam.
    await expect(svc.execute("demo", "FREE", { sireId: "puma", damId: "onca-pintada-2", method: "F1" }))
      .rejects.toThrow(/não encontrado/i);
  });

  it("JUNIOR libera interespecífico felino (Pumajaguar F1)", async () => {
    const r = await svc.execute("demo", "JUNIOR", { sireId: "puma", damId: "onca-pintada-2", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.specimen.species).toContain("×");
  });

  it("TESTE OBRIGATÓRIO (ADR-0016, item 2): FREE não cruza tigre-de-bengala × tigre-branco (intraespécie, mas WILD_FELINE) → 404", async () => {
    await expect(svc.execute("demo", "FREE", { sireId: "tigre-bengala", damId: "tigre-branco", method: "F1" }))
      .rejects.toThrow(/não encontrado/i);
  });

  it("FREE/JUNIOR são BLOQUEADOS em caninos → 404 (pool DOG exige SENIOR+, checado antes de família)", async () => {
    // O gate de pool (resolve(), ADR-0016) roda ANTES do gate de família
    // (assertTierAllows) — ambos concordam no mínimo (DOG = SENIOR, igual
    // família canina de sempre), mas quem intercepta primeiro é o pool, e
    // vira 404 "não encontrado" (nunca 403), como qualquer fora-do-pool.
    await expect(svc.execute("demo", "JUNIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" }))
      .rejects.toThrow(/não encontrado/i);
  });

  it("SENIOR cruza caninos (Boerpointer F1)", async () => {
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
    expect(r.specimen.pack).toBe("canine");
  });

  it("retrocruzamento → F_pedigree = 0.25", async () => {
    // F1 (puma×onca-pintada-2) é interespecífico — Regra de Haldane torna F1
    // MACHO interespecífico sempre estéril (não pode sirar nada depois).
    // Solução: a F1 precisa ser FÊMEA, e o retrocruzamento é ao PAI (puma de
    // novo como sire, f1 como dam) — não à mãe como antes. F_pedigree=0.25
    // continua valendo (retrocruzamento ao progenitor é simétrico — ver 1º
    // teste do arco Pumajaguar no motor). firstSeedWithSex acha a seed que dá
    // filha, em vez de fixar isso à mão.
    let f1!: Awaited<ReturnType<typeof svc.execute>>;
    await firstSeedWithSex(async (seed) => {
      const r = await svc.execute("demo", "JUNIOR", { sireId: "puma", damId: "onca-pintada-2", method: "F1", seed });
      f1 = r;
      return { specimen: { sex: r.engine.sex } };
    }, "F", "s1");
    const bc = await svc.execute("demo", "JUNIOR", { sireId: "puma", damId: f1.specimen.id, method: "BC1", seed: "s2" });
    expect(bc.engine.fPedigree).toBe(0.25);
    const ped = await repo.buildPedigree([f1.specimen.id, "onca-negra-1"]);
    expect(wrightF(ped, f1.specimen.id, "puma")).toBe(0.25);
  });

  it("ANTI-P2W: mesma entrada → resultado idêntico entre tiers permitidos", async () => {
    const a = await svc.execute("u", "JUNIOR", { sireId: "puma", damId: "onca-pintada-2", method: "F1", seed: "fix" });
    const b = await svc.execute("u", "PHD", { sireId: "puma", damId: "onca-pintada-2", method: "F1", seed: "fix" });
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(a.engine.fixationIndex).toBe(b.engine.fixationIndex);
  });

  it("OPÇÕES: Senior vê top-6 e PODE escolher; Junior não escolhe", async () => {
    // Junior (não Free — onça é WILD_FELINE, pool ADR-0016 exige JUNIOR+)
    const senior = await svc.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(senior.canChoose).toBe(true);
    expect(senior.maxOptions).toBe(6);
    expect(senior.options.length).toBeGreaterThan(0);
    const junior = await svc.options("JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(junior.canChoose).toBe(false);
    // ANTI-P2W: mesmas probabilidades independentemente do tier
    expect(junior.options[0]!.prob).toBe(senior.options[0]!.prob);
  });

  it("SELEÇÃO: Senior escolhe uma opção → filhote tem o genótipo escolhido", async () => {
    const opts = await svc.options("SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    const chosen = opts.options[0]!;
    const r = await svc.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: chosen.key });
    // o genótipo do filhote corresponde ao escolhido (loco A)
    expect(r.engine.genotype.loci.A).toEqual(chosen.genotype.loci.A);
  });

  it("SELEÇÃO inválida → 400", async () => {
    await expect(svc.execute("demo", "SENIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1", choiceKey: "chave-invalida" }))
      .rejects.toThrow();
  });

  it("DECISÃO desta rodada: quantidade de opções não varia mais por tier — PhD também vê 6 (era 12)", async () => {
    const phd = await svc.options("PHD", { sireId: "gato-tabby", damId: "gato-siames", method: "F1" });
    expect(phd.maxOptions).toBe(6);
  });

  it("CÃO × CÃO (raças) NÃO é interespecífico → fértil (sem Haldane) e vira CÃO", async () => {
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1" });
    expect(r.engine.fertility.haldaneSterile).toBe(false);
    expect(r.engine.fertility.score).toBeGreaterThan(0);
    expect(r.specimen.pack).toBe("canine");
    expect(r.specimen.species).toContain("×"); // mistura de raças
  });

  it("Braço Alemão tem roan → prole herda ticking (pintas do Pointer)", async () => {
    // F1 Boerboel × Braço: R/r (roan dominante) → ticking presente
    const r = await svc.execute("demo", "SENIOR", { sireId: "boerboel", damId: "braco-alemao", method: "F1", seed: "t" });
    expect(r.engine.genotype.loci.R).toContain("R"); // herdou o alelo roan do Braço
    expect(r.engine.phenotype.loci.R).toBe("roan");
  });

  it("nome de híbrido MULTI-ESPÉCIE inclui todos os ancestrais (não some o 3º)", async () => {
    const { speciesInfo } = await import("@genbreedai/shared");
    const info = speciesInfo("leptailurus-serval×panthera-onca×panthera-tigris-albino");
    expect(info.common).toContain("Serval");
    expect(info.common).toContain("Onça-pintada");
    expect(info.common).toContain("Tigre-albino");     // antes sumia
    // combineSpecies dedupe: cruzar híbrido com um ancestral não repete.
    // F1 (puma×onca-pintada-2, interespecífico) precisa ser FÊMEA — mesmo
    // motivo do teste de retrocruzamento acima (Haldane: macho interespecífico
    // é sempre estéril). O BC1 introduz uma TERCEIRA espécie (serval, macho,
    // já citada no speciesInfo acima) como sire, com a F1 fêmea como dam —
    // exercita de verdade "não some o 3º ancestral" no dedupe.
    let f1!: Awaited<ReturnType<typeof svc.execute>>;
    await firstSeedWithSex(async (seed) => {
      const r = await svc.execute("demo", "PHD", { sireId: "puma", damId: "onca-pintada-2", method: "F1", seed });
      f1 = r;
      return { specimen: { sex: r.engine.sex } };
    }, "F", "z");
    const back = await svc.execute("demo", "PHD", { sireId: "serval", damId: f1.specimen.id, method: "BC1", seed: "z2" });
    expect(back.specimen.species.split("×").length).toBe(new Set(back.specimen.species.split("×")).size); // sem duplicatas
  });
});

describe("classify() — correção do achado em produção (/app/reveal/[id]: 'Híbrido revelado' + 'Outcross de resgate' pra 2 fundadores sem parentesco)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

  it("gato fundador × gata fundadora, SEM parentesco (F=0 nos dois) → F1, NÃO OUTCROSS", async () => {
    const c = await svc.classify({ sireId: "gato-tabby", damId: "gato-siames" });
    expect(c.method).toBe("F1");
    expect(c.kinship).toBe(0);
  });

  it("pai/mãe com endogamia PRÓPRIA (F_pedigree>0, via F2 de irmãos) × fundador fresco sem parentesco → OUTCROSS de resgate", async () => {
    // Dois F1 da MESMA ninhada (gato-tabby×gato-siames) são irmãos completos;
    // cruzá-los dá F2 com F_pedigree=0.25 (endogamia leve, mesma regra do
    // motor testada em vários outros arquivos deste repo).
    let sibA!: Awaited<ReturnType<typeof svc.execute>>;
    await firstSeedWithSex(async (seed) => {
      const r = await svc.execute("demo", "SENIOR", { sireId: "gato-tabby", damId: "gato-siames", method: "F1", seed });
      sibA = r;
      return { specimen: { sex: r.engine.sex } };
    }, "M", "cx-siba");
    let sibB!: Awaited<ReturnType<typeof svc.execute>>;
    await firstSeedWithSex(async (seed) => {
      const r = await svc.execute("demo", "SENIOR", { sireId: "gato-tabby", damId: "gato-siames", method: "F1", seed });
      sibB = r;
      return { specimen: { sex: r.engine.sex } };
    }, "F", "cx-sibb");
    const f2 = await svc.execute("demo", "SENIOR", { sireId: sibA.specimen.id, damId: sibB.specimen.id, method: "F2", seed: "cx-f2" });
    expect(f2.engine.fPedigree).toBe(0.25);

    // "gato-branco" é fundador (species felis-catus, F_pedigree=0), sem
    // qualquer parentesco com a linha acima — cruzar com ele reduz o F da
    // prole (de 0.25 pra ~0): outcross de resgate de verdade.
    const c = await svc.classify({ sireId: f2.specimen.id, damId: "gato-branco" });
    expect(c.method).toBe("OUTCROSS");
    expect(c.kinship).toBeLessThan(0.25);
  });
});

/**
 * BUG 1 reportado (Gene Bank): "Selecione um macho e uma fêmea férteis"
 * pra qualquer par de fundadores — os 148 fundadores têm `fertility` NULL
 * no banco (nunca calculada, nascem sem cruzamento). Auditoria (ver
 * relatório da correção): `gene-bank/page.tsx:33`, `app/page.tsx:50-51`
 * (web) e `cross.ts:123-124`/`cross.service.ts:141,146` (motor/API) JÁ
 * tratam `fertility !== 0` corretamente (null/undefined passam — só
 * `=== 0` explícito bloqueia). Nenhum ponto tratando NULL como estéril foi
 * encontrado; estes testes fixam esse comportamento fim-a-fim via
 * CrossService (equivalente ao fluxo real do Gene Bank → Laboratório →
 * POST /cross), pra pegar qualquer regressão futura.
 */
describe("Gate de fertilidade — fertility NULL é fértil, só fertility===0 bloqueia (bug reportado no Gene Bank)", () => {
  let repo: InMemorySpecimenRepository;
  let svc: CrossService;
  beforeEach(() => { repo = new InMemorySpecimenRepository(); svc = new CrossService(repo, new WalletService(new InMemoryWalletRepository())); });

  it("par de FUNDADORES com fertility null (nunca calculada) → cruzamento PERMITIDO", async () => {
    const onca = await repo.get("onca-pintada");
    const negra = await repo.get("onca-negra");
    expect(onca?.fertility).toBeNull();
    expect(negra?.fertility).toBeNull();
    const r = await svc.execute("demo", "JUNIOR", { sireId: "onca-pintada", damId: "onca-negra", method: "F1" });
    expect(r.engine.phenotype.viable).toBe(true);
  });

  it("espécime com fertility===0 (estéril conhecido, ex.: macho híbrido pós-F1, ADR-0018) → cruzamento RECUSADO", async () => {
    const onca = (await repo.get("onca-pintada"))!;
    await repo.save({
      id: "sire-esteril-teste", ownerId: "demo", pack: "feline", species: "panthera-onca",
      genotype: onca.genotype, generation: 1, sireId: "onca-pintada", damId: "onca-negra", method: "F1",
      fPedigree: 0, fixationIndex: 0, aura: 3, cacheKey: null,
      sex: "M", fertility: 0, haldaneStatus: "STERILE",
    });
    await expect(svc.execute("demo", "JUNIOR", { sireId: "sire-esteril-teste", damId: "onca-negra", method: "F1" }))
      .rejects.toThrow(/estéril/i);
  });
});
